// Quantized ArcGIS feature queries for the reference overlays.
//
// The Living Atlas hosted services behind the HUC/rivers overlays ignore
// maxAllowableOffset, so plain f=geojson pulls full-resolution geometry
// (measured: 52 MB for HUC2 across CONUS). quantizationParameters IS honored
// and returns delta-encoded integer vertices snapped to a per-pixel grid
// (measured: 202 KB for the same request), which this module decodes back to
// GeoJSON. Kept free of maplibre imports so vitest runs it in node.

import type { Feature, FeatureCollection, MultiLineString, Position } from "geojson";

export interface Bounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface EsriTransform {
  originPosition: "upperLeft" | "lowerLeft";
  scale: [number, number];
  translate: [number, number];
}

export interface EsriQuantizedPage {
  transform?: EsriTransform;
  features?: Array<{
    attributes?: Record<string, unknown>;
    geometry?: { rings?: number[][][]; paths?: number[][][] };
  }>;
  exceededTransferLimit?: boolean;
  /** ArcGIS reports request errors as HTTP 200 with this body. */
  error?: { code?: number; message?: string };
}

/** EPSG:4326 degrees per CSS pixel at this zoom (512px world at z0),
 * tightened by the worst-case Mercator stretch in the viewport so the
 * quantization error stays ≤ 1 px everywhere on screen. */
export function quantizationTolerance(zoom: number, maxAbsLat: number): number {
  const degPerPxAtEquator = 360 / (512 * 2 ** zoom);
  return degPerPxAtEquator * Math.cos((Math.min(maxAbsLat, 85) * Math.PI) / 180);
}

// Decode one quantized ring/path: vertex 0 is absolute on the integer grid
// (and may be negative — geometry extends past the query extent), the rest
// are deltas; with an upperLeft origin the y grid grows downward.
function decodeLine(raw: number[][], t: EsriTransform | undefined, closeRing: boolean): Position[] | null {
  const pts: Position[] = [];
  let qx = 0;
  let qy = 0;
  for (let i = 0; i < raw.length; i++) {
    const [a, b] = raw[i];
    if (!t) {
      // Unquantized page: coordinates are already absolute lon/lat.
      pts.push([a, b]);
      continue;
    }
    if (i === 0) {
      qx = a;
      qy = b;
    } else {
      if (a === 0 && b === 0) continue; // quantization-collapsed duplicate vertex
      qx += a;
      qy += b;
    }
    const lat = t.originPosition === "upperLeft" ? t.translate[1] - qy * t.scale[1] : t.translate[1] + qy * t.scale[1];
    pts.push([t.translate[0] + qx * t.scale[0], lat]);
  }
  if (pts.length < 2) return null; // part collapsed by quantization
  if (closeRing) {
    const f = pts[0];
    const l = pts[pts.length - 1];
    if (f[0] !== l[0] || f[1] !== l[1]) pts.push([f[0], f[1]]);
  }
  return pts;
}

/** Rings and paths both become MultiLineString — the overlays draw outlines
 * only, so no fill/winding logic is needed. Features whose every part
 * collapsed are dropped. */
export function dequantizePage(page: EsriQuantizedPage): Feature<MultiLineString>[] {
  const out: Feature<MultiLineString>[] = [];
  for (const f of page.features ?? []) {
    const isRings = !!f.geometry?.rings;
    const parts = f.geometry?.rings ?? f.geometry?.paths ?? [];
    const lines: Position[][] = [];
    for (const part of parts) {
      const line = decodeLine(part, page.transform, isRings);
      if (line) lines.push(line);
    }
    if (!lines.length) continue;
    out.push({
      type: "Feature",
      geometry: { type: "MultiLineString", coordinates: lines },
      properties: (f.attributes ?? {}) as Record<string, unknown>,
    });
  }
  return out;
}

// Bounded pagination: the worst real case (HUC8 across CONUS, ~2,264 features
// at the server's 1,000-record clamp) needs 3 pages; past the cap we render
// whatever was collected rather than loop unbounded.
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

export async function fetchQuantizedMultiLine(
  baseUrl: string,
  outFields: string,
  bounds: Bounds,
  zoom: number,
  signal: AbortSignal,
  fetchImpl: typeof fetch = fetch,
  pageSize = 2000,
): Promise<FeatureCollection> {
  const b = clampBounds(bounds);
  const params = baseParams(b, outFields, pageSize);
  params.set("f", "json");
  params.set(
    "quantizationParameters",
    JSON.stringify({
      mode: "view",
      originPosition: "upperLeft",
      tolerance: quantizationTolerance(zoom, Math.max(Math.abs(b.south), Math.abs(b.north))),
      extent: { xmin: b.west, ymin: b.south, xmax: b.east, ymax: b.north, spatialReference: { wkid: 4326 } },
    }),
  );
  const getPage = async (offset: number): Promise<EsriQuantizedPage> => {
    const p = new URLSearchParams(params); // clone — pages run concurrently
    p.set("resultOffset", String(offset));
    const res = await fetchImpl(`${baseUrl}/query?${p}`, { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as EsriQuantizedPage;
    if (body.error) throw new Error(`ArcGIS ${body.error.code ?? ""}: ${body.error.message ?? "query failed"}`);
    return body;
  };
  const first = await getPage(0);
  const features: Feature<MultiLineString>[] = dequantizePage(first);
  const n = first.features?.length ?? 0; // actual count — servers clamp below the requested size
  if (first.exceededTransferLimit && n > 0) {
    // Remaining pages in parallel: offsets assume the server clamp stays
    // constant (ArcGIS pagination is deterministic by object id order), and
    // pages past the end return empty quickly. Sequential paging made HUC8
    // take 3x longer than it needed to.
    const rest = await Promise.all(Array.from({ length: MAX_PAGES - 1 }, (_, i) => getPage((i + 1) * n)));
    for (const page of rest) features.push(...dequantizePage(page)); // each page carries its own transform
  }
  return { type: "FeatureCollection", features };
}

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
