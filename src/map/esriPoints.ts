// Paged GeoJSON point queries for the live reference overlays (NID dams,
// Live Stream Gauges). The boundary/line overlays that once streamed through
// this module's quantized-geometry machinery became self-hosted static
// snapshots (scripts/build-overlays.mjs) — the quantized decoder now lives
// there, and this module keeps only the plain points path. Kept free of
// maplibre imports so vitest runs it in node.

import type { FeatureCollection } from "geojson";

export interface Bounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

// Bounded pagination: past the cap we render whatever was collected rather
// than loop unbounded.
const MAX_PAGES = 5;

/** ArcGIS rejects envelopes outside the CRS range (a zoomed-out world view
 * can report bounds past ±180°) with "Invalid query parameters". */
export function clampBounds(b: Bounds): Bounds {
  return {
    west: Math.max(-180, b.west),
    south: Math.max(-85, b.south),
    east: Math.min(180, b.east),
    north: Math.min(85, b.north),
  };
}

const baseParams = (b: Bounds, outFields: string, pageSize: number): URLSearchParams =>
  new URLSearchParams({
    where: "1=1",
    geometry: `${b.west},${b.south},${b.east},${b.north}`,
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields,
    outSR: "4326",
    returnGeometry: "true",
    resultRecordCount: String(pageSize),
  });

export async function fetchGeojsonPoints(
  baseUrl: string,
  outFields: string,
  bounds: Bounds,
  signal: AbortSignal,
  fetchImpl: typeof fetch = fetch,
  pageSize = 2000,
): Promise<FeatureCollection> {
  const params = baseParams(clampBounds(bounds), outFields, pageSize);
  params.set("f", "geojson");
  const features: FeatureCollection["features"] = [];
  let offset = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    params.set("resultOffset", String(offset));
    const res = await fetchImpl(`${baseUrl}/query?${params}`, { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as FeatureCollection & {
      exceededTransferLimit?: boolean;
      error?: { message?: string };
    };
    if (body.error) throw new Error(`ArcGIS: ${body.error.message ?? "query failed"}`);
    if (!body.features) throw new Error("no features in response");
    features.push(...body.features);
    const n = body.features.length;
    offset += n;
    // geojson output does not reliably carry exceededTransferLimit — treat a
    // full page as "maybe more".
    if (n === 0 || !(body.exceededTransferLimit === true || n >= pageSize)) break;
  }
  return { type: "FeatureCollection", features };
}
