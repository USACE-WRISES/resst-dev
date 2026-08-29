// Local lookups against the static overlay snapshots (public/overlays/*.json)
// for the map Select tools: which HUC basin contains a point, and a named
// river's complete course. These replaced the click-time ArcGIS queries when
// the overlays went self-hosted — the whole layer is resident, so selection
// is synchronous. Kept free of maplibre imports so vitest runs it in node.

import type { Feature, FeatureCollection, Position } from "geojson";
import { corridorOf, pointInRings, type Bbox, type Pt } from "./spatial";

export interface HucEntry {
  /** The basin code (huc2/huc4/huc6/huc8 property value). */
  id: string;
  name: string;
  /** Flat ring list — outer rings + holes, all parts — even-odd ready. */
  rings: Position[][];
  bbox: Bbox;
}

/** A feature's rings as the flat list spatial.pointInRings consumes. GeoJSON
 * Polygon coordinates already have that shape; MultiPolygon flattens — the
 * even-odd XOR needs no ring-role or part grouping. */
export function ringsOfFeature(f: Feature): Position[][] {
  const g = f.geometry;
  if (g.type === "Polygon") return g.coordinates;
  if (g.type === "MultiPolygon") return g.coordinates.flat();
  return [];
}

/** Containment index over a HUC snapshot — one O(vertices) pass; the overlay
 * key doubles as the huc property name, as everywhere else in the app. */
export function buildHucIndex(fc: FeatureCollection, hucField: string): HucEntry[] {
  const out: HucEntry[] = [];
  for (const f of fc.features) {
    const rings = ringsOfFeature(f);
    if (!rings.length) continue;
    const props = (f.properties ?? {}) as Record<string, unknown>;
    out.push({
      id: String(props[hucField] ?? ""),
      name: String(props.name ?? ""),
      rings,
      bbox: corridorOf(rings).bbox,
    });
  }
  return out;
}

/** The entry containing p: bbox precheck, then even-odd containment. The
 * first hit wins — a click ON a shared boundary is defensible either way,
 * the same rule the service query's first-feature pick applied. */
export function findHucAt(index: HucEntry[], p: Pt): HucEntry | null {
  for (const entry of index) {
    const [w, s, e, n] = entry.bbox;
    if (p[0] < w || p[0] > e || p[1] < s || p[1] > n) continue;
    if (pointInRings(p, entry.rings)) return entry;
  }
  return null;
}

/** Every line part of every feature named `name` (trimmed match). The
 * snapshot holds the whole continent, so this IS the river's full course;
 * the caller clusters namesakes away with spatial.partsNearSeed. */
export function riverPartsByName(fc: FeatureCollection, name: string): Position[][] {
  const parts: Position[][] = [];
  for (const f of fc.features) {
    if (String((f.properties as Record<string, unknown> | null)?.NameEn ?? "").trim() !== name) continue;
    if (f.geometry.type === "MultiLineString") parts.push(...f.geometry.coordinates);
    else if (f.geometry.type === "LineString") parts.push(f.geometry.coordinates);
  }
  return parts;
}

/** Normalize a click longitude that may sit on a wrapped world copy into
 * [-180, 180) — the snapshots store canonical longitudes. */
export const wrapLon = (lon: number): number => ((((lon + 180) % 360) + 360) % 360) - 180;
