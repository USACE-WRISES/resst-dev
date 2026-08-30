// USGS NLDI (Network-Linked Data Index) drainage-basin delineation — the
// app's one on-demand external data API beyond the map/overlay services.
// Two requests: snap the dam's coordinates to the nearest NHDPlusV2 flowline
// (comid), then fetch that flowline's upstream basin polygon. Public, CORS
// open (Access-Control-Allow-Origin: *), no key; verified 2026-08-30 (Tuttle
// Creek's basin returns in ~0.6 s). The basin reflects the dam's MAPPED
// location snapped to NHDPlus, so off-channel or small-tributary dams can
// snap to the wrong stream — the UI's provenance note carries that caveat.

import type { Feature, MultiPolygon, Polygon } from "geojson";

const NLDI = "https://api.water.usgs.gov/nldi/linked-data";

export type BasinFeature = Feature<Polygon | MultiPolygon>;

async function getJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const res = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`NLDI ${res.status}`);
  return res.json();
}

/** Delineate the upstream drainage basin for a dam location. Throws on any miss. */
export async function fetchBasin(lon: number, lat: number, signal?: AbortSignal): Promise<BasinFeature> {
  // Literal %20 (not encodeURIComponent) — mirrors the verified request shape.
  const pos = (await getJson(`${NLDI}/comid/position?coords=POINT(${lon}%20${lat})`, signal)) as {
    features?: Array<{ properties?: { comid?: number } }>;
  };
  const comid = pos?.features?.[0]?.properties?.comid;
  if (comid == null) throw new Error("NLDI: no flowline at this location");
  const basin = (await getJson(`${NLDI}/comid/${comid}/basin?simplified=true`, signal)) as {
    features?: Array<Feature>;
  };
  const feat = basin?.features?.[0];
  if (!feat?.geometry || (feat.geometry.type !== "Polygon" && feat.geometry.type !== "MultiPolygon")) {
    throw new Error("NLDI: no basin polygon returned");
  }
  return feat as BasinFeature;
}

/** [southwest, northeast] corners of a basin polygon, for view fitting. */
export function basinBounds(f: BasinFeature): [[number, number], [number, number]] {
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  const scan = (ring: number[][]) => {
    for (const [x, y] of ring) {
      if (x < w) w = x;
      if (x > e) e = x;
      if (y < s) s = y;
      if (y > n) n = y;
    }
  };
  if (f.geometry.type === "Polygon") f.geometry.coordinates.forEach(scan);
  else f.geometry.coordinates.forEach((poly) => poly.forEach(scan));
  return [
    [w, s],
    [e, n],
  ];
}
