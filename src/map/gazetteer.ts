// USGS GNIS gazetteer place search (carto.nationalmap.gov — keyless,
// CORS-open, public domain), feeding the map search box's "Places" group.
// Bounded per-layer /query requests, prefix-first with a contains fallback:
// the service's cross-layer /find has no result-limit parameter, so common
// substrings would return unbounded payloads, while per-layer queries stay
// tiny (resultRecordCount) and rank prefix matches naturally for typeahead.
// Conventions mirror esriQuantized.ts: injectable fetchImpl + AbortSignal,
// and ArcGIS's HTTP-200-with-error-body responses are surfaced as throws.

export interface GazetteerPlace {
  /** gaz_id — the dedupe key (the same feature can surface from several layers). */
  id: number;
  name: string;
  /** Raw GNIS feature class ("Stream", "Civil", …). */
  featureClass: string;
  /** Display label ("Stream", "City", …). */
  classLabel: string;
  /** Two-letter state ("NE"); may be "". */
  state: string;
  /** County name; may be "". Shown bare — "Co." would mislabel parishes/boroughs. */
  county: string;
  lon: number;
  lat: number;
  /** Suggested fly-to zoom for this feature class. */
  zoom: number;
}

export const GNIS_BASE = "https://carto.nationalmap.gov/arcgis/rest/services/geonames/MapServer";

/**
 * Layers queried, in merge priority order: incorporated places, census
 * places, populated places, streams, other hydrography, landforms.
 */
export const GNIS_LAYERS: readonly number[] = [1, 2, 3, 6, 7, 5];

export const PLACE_RESULT_CAP = 6;

const DEFAULT_ZOOM = 10;

const CLASS_META: Record<string, { label?: string; zoom: number }> = {
  Civil: { label: "City", zoom: 11 },
  Census: { label: "Community", zoom: 11 },
  "Populated Place": { zoom: 11 },
  // GNIS stream points sit at the MOUTH — zoom 10 keeps enough context to see
  // where the stream heads.
  Stream: { zoom: 10 },
  Lake: { zoom: 11 },
  Reservoir: { zoom: 11 },
  Summit: { zoom: 12 },
  Ridge: { zoom: 12 },
  Valley: { zoom: 12 },
  Basin: { zoom: 12 },
  Falls: { zoom: 12 },
  Spring: { zoom: 12 },
};

/** SQL string literal escape. `%`/`_` pass through as LIKE wildcards — harmless. */
const escapeLike = (s: string) => s.replace(/'/g, "''");

export function buildPlaceQueryUrl(
  layerId: number,
  search: string,
  mode: "prefix" | "contains",
  cap: number = PLACE_RESULT_CAP,
): string {
  const pattern = mode === "prefix" ? `${escapeLike(search)}%` : `%${escapeLike(search)}%`;
  const params = new URLSearchParams({
    f: "json",
    where: `UPPER(gaz_name) LIKE UPPER('${pattern}')`,
    outFields: "gaz_id,gaz_name,gaz_featureclass,state_alpha,county_name",
    returnGeometry: "true",
    outSR: "4326",
    orderByFields: "gaz_name",
    resultRecordCount: String(cap),
  });
  return `${GNIS_BASE}/${layerId}/query?${params.toString()}`;
}

interface EsriQueryFeature {
  attributes?: Record<string, unknown>;
  geometry?: { x?: number; y?: number; points?: [number, number][] };
}

/**
 * Parse one layer's /query response. Throws on ArcGIS error bodies; accepts
 * point ({x,y}) and multipoint ({points}) geometries (the service reports
 * esriGeometryMultipoint — the first point is taken); skips features with no
 * usable geometry.
 */
export function parsePlacesResponse(body: unknown): GazetteerPlace[] {
  const b = body as { error?: { code?: number; message?: string }; features?: EsriQueryFeature[] };
  if (b.error) throw new Error(`ArcGIS error ${b.error.code ?? ""}: ${b.error.message ?? "query failed"}`);
  const out: GazetteerPlace[] = [];
  for (const f of b.features ?? []) {
    const a = f.attributes ?? {};
    const g = f.geometry;
    let lon: number | undefined;
    let lat: number | undefined;
    if (typeof g?.x === "number" && typeof g?.y === "number") {
      lon = g.x;
      lat = g.y;
    } else if (Array.isArray(g?.points) && g.points.length > 0) {
      [lon, lat] = g.points[0];
    }
    if (lon == null || lat == null) continue;
    const featureClass = String(a.gaz_featureclass ?? "");
    const meta = CLASS_META[featureClass];
    out.push({
      id: Number(a.gaz_id),
      name: String(a.gaz_name ?? ""),
      featureClass,
      classLabel: meta?.label ?? (featureClass || "Place"),
      state: String(a.state_alpha ?? ""),
      county: String(a.county_name ?? ""),
      lon,
      lat,
      zoom: meta?.zoom ?? DEFAULT_ZOOM,
    });
  }
  return out;
}

/**
 * Merge per-layer results (arriving in GNIS_LAYERS order): dedupe by gaz_id
 * with the earlier (higher-priority) layer winning, sort case-insensitively
 * by name (ties keep input order — Array.prototype.sort is stable), cap.
 */
export function mergePlaces(perLayer: GazetteerPlace[][], cap: number = PLACE_RESULT_CAP): GazetteerPlace[] {
  const seen = new Set<number>();
  const merged: GazetteerPlace[] = [];
  for (const layer of perLayer) {
    for (const p of layer) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      merged.push(p);
    }
  }
  return merged.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())).slice(0, cap);
}

async function queryRound(
  text: string,
  mode: "prefix" | "contains",
  signal: AbortSignal,
  fetchImpl: typeof fetch,
): Promise<GazetteerPlace[]> {
  const settled = await Promise.allSettled(
    GNIS_LAYERS.map(async (layerId) => {
      const res = await fetchImpl(buildPlaceQueryUrl(layerId, text, mode), { signal });
      if (!res.ok) throw new Error(`GNIS layer ${layerId} failed: HTTP ${res.status}`);
      return parsePlacesResponse(await res.json());
    }),
  );
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  // Partial failures degrade to fewer groups; only a total failure surfaces.
  if (settled.every((r) => r.status === "rejected")) {
    throw (settled[0] as PromiseRejectedResult).reason;
  }
  return mergePlaces(settled.map((r) => (r.status === "fulfilled" ? r.value : [])));
}

/**
 * Search GNIS for `text`: one round of parallel bounded prefix queries; if
 * that comes back empty, one contains round. Aborting the signal rejects with
 * AbortError (the caller swallows it as a superseded keystroke).
 */
export async function searchPlaces(
  text: string,
  signal: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<GazetteerPlace[]> {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const prefix = await queryRound(trimmed, "prefix", signal, fetchImpl);
  if (prefix.length > 0) return prefix;
  return queryRound(trimmed, "contains", signal, fetchImpl);
}
