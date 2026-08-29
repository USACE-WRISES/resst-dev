// Builds the self-hosted reference-overlay snapshots:
//   public/overlays/{huc2,huc4,huc6,huc8,rivers}.json
//
// Dev-time tool (never CI — precedent: help-screenshots.mjs). Refresh with
//   npm run build:overlays        (then review sizes below and commit)
//
// SOURCES AND LICENSES — load-bearing; do not "optimize" these away:
// - HUC 2/4/6/8 come from USGS's OWN Watershed Boundary Dataset server
//   (hydro.nationalmap.gov/arcgis/rest/services/wbd/MapServer, layers 1-4),
//   which is PUBLIC DOMAIN, keyless, speaks f=geojson, and honors
//   maxAllowableOffset. Deliberately NOT the Esri Living Atlas copies the
//   runtime used to stream from — those items sit under the Esri Master
//   License Agreement and are not redistributable.
// - Rivers come from the CEC North American Environmental Atlas – Lakes and
//   Rivers layer (services7.arcgis.com/oF9CDB4lUYF7Um9q), licensed CC BY 4.0
//   (credit: Commission for Environmental Cooperation / Natural Resources
//   Canada / INEGI / USGS — the attribution lives in Help → About → Credits).
//   That server ignores maxAllowableOffset but honors quantizationParameters,
//   so this script carries its own copy of the quantized delta decoder.
//
// Tolerances (degrees; ≈ meters at CONUS latitudes) match or beat the
// selection accuracy the click-time service queries used, so display and
// selection share identical geometry:
//   huc2 2e-3 (~200 m) · huc4 1e-3 (~110 m) · huc6 5e-4 (~55 m)
//   huc8 5e-4 (~55 m)  · rivers 1e-3 (near the layer's native density)
// Coordinates are rounded to 4 decimals (~11 m — well under every tolerance).
//
// Size guardrails: GitHub warns on files >50 MB and blocks >100 MB. huc8 at
// 55 m is ~53 MB, so it ships as TWO halves (huc8-a/b.json, ~27 MB each —
// overlays.ts fetches a layer's parts in parallel and concatenates). If any
// other layer ever approaches 50 MB, give it a `split` too.

import { mkdir, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";

const OUT_DIR = "public/overlays";
const PRECISION = 4;
const WBD = "https://hydro.nationalmap.gov/arcgis/rest/services/wbd/MapServer";
const CEC =
  "https://services7.arcgis.com/oF9CDB4lUYF7Um9q/arcgis/rest/services/North_America_Lakes_and_Rivers/FeatureServer/0";

const LAYERS = [
  { name: "huc2", kind: "wbd", layerId: 1, hucField: "huc2", tolerance: 2e-3, baseline: 22 },
  { name: "huc4", kind: "wbd", layerId: 2, hucField: "huc4", tolerance: 1e-3, baseline: 245 },
  { name: "huc6", kind: "wbd", layerId: 3, hucField: "huc6", tolerance: 5e-4, baseline: 407 },
  { name: "huc8", kind: "wbd", layerId: 4, hucField: "huc8", tolerance: 5e-4, baseline: 2456, split: 2 },
  { name: "rivers", kind: "cec", tolerance: 1e-3, baseline: 5810 },
];

const META = {
  wbd: {
    source: "USGS Watershed Boundary Dataset — hydro.nationalmap.gov/arcgis/rest/services/wbd/MapServer",
    license: "Public domain (USGS)",
  },
  cec: {
    source:
      "North American Environmental Atlas – Lakes and Rivers — Commission for Environmental Cooperation (NRCan / INEGI / USGS)",
    license: "CC BY 4.0",
  },
};

const round = (v) => Math.round(v * 10 ** PRECISION) / 10 ** PRECISION;

/** Round a line/ring to PRECISION, drop consecutive duplicates rounding
 * creates, and re-close rings whose closure the dedupe consumed. */
function cleanLine(pts, isRing) {
  const out = [];
  for (const [x, y] of pts) {
    const p = [round(x), round(y)];
    const last = out[out.length - 1];
    if (last && last[0] === p[0] && last[1] === p[1]) continue;
    out.push(p);
  }
  if (isRing && out.length >= 3) {
    const f = out[0];
    const l = out[out.length - 1];
    if (f[0] !== l[0] || f[1] !== l[1]) out.push([f[0], f[1]]);
  }
  return out;
}

async function fetchJson(url) {
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 2000 * attempt));
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      if (body.error) throw new Error(`ArcGIS ${body.error.code ?? ""}: ${body.error.message ?? "query failed"}`);
      return body;
    } catch (err) {
      lastErr = err;
      console.warn(`  retryable: ${String(err).slice(0, 120)}`);
    }
  }
  throw lastErr;
}

// ---------------------------------------------------------------- WBD -------

async function buildWbd({ layerId, hucField, tolerance }) {
  const features = [];
  for (let page = 0; page < 20; page++) {
    const params = new URLSearchParams({
      where: "1=1",
      outFields: `${hucField},name`,
      returnGeometry: "true",
      outSR: "4326",
      f: "geojson",
      maxAllowableOffset: String(tolerance),
      geometryPrecision: String(PRECISION), // requested but not trusted — we round anyway
      // 1000/page: huc8 at 55 m in 2000-feature pages exceeds the server's
      // request timeout (HTTP 500).
      resultRecordCount: "1000",
      resultOffset: String(features.length),
    });
    const body = await fetchJson(`${WBD}/${layerId}/query?${params}`);
    const got = body.features ?? [];
    for (const f of got) {
      const g = f.geometry;
      if (!g) continue;
      if (g.type === "Polygon") g.coordinates = g.coordinates.map((ring) => cleanLine(ring, true)).filter((r) => r.length >= 4);
      else if (g.type === "MultiPolygon")
        g.coordinates = g.coordinates
          .map((poly) => poly.map((ring) => cleanLine(ring, true)).filter((r) => r.length >= 4))
          .filter((poly) => poly.length > 0);
      else continue;
      if (!g.coordinates.length) continue;
      const props = f.properties ?? {};
      features.push({
        type: "Feature",
        properties: { [hucField]: String(props[hucField] ?? ""), name: String(props.name ?? "") },
        geometry: g,
      });
    }
    if (got.length < 1000) break;
  }
  return features;
}

// ---------------------------------------------------------------- CEC -------
// Quantized delta decode — a direct port of the (retired) esriQuantized.ts
// decoder: vertex 0 is absolute on the integer grid, the rest are deltas;
// upperLeft origin means the y grid grows downward; (0,0) deltas are
// quantization-collapsed duplicates; parts under 2 points are dropped.

function decodeLine(raw, t) {
  const pts = [];
  let qx = 0;
  let qy = 0;
  for (let i = 0; i < raw.length; i++) {
    const [a, b] = raw[i];
    if (!t) {
      pts.push([round(a), round(b)]);
      continue;
    }
    if (i === 0) {
      qx = a;
      qy = b;
    } else {
      if (a === 0 && b === 0) continue;
      qx += a;
      qy += b;
    }
    const lat = t.originPosition === "upperLeft" ? t.translate[1] - qy * t.scale[1] : t.translate[1] + qy * t.scale[1];
    pts.push([round(t.translate[0] + qx * t.scale[0]), round(lat)]);
  }
  return pts.length >= 2 ? pts : null;
}

async function buildCec({ tolerance }) {
  const quantization = JSON.stringify({
    mode: "view",
    originPosition: "upperLeft",
    tolerance,
    extent: { xmin: -180, ymin: -85, xmax: 180, ymax: 85, spatialReference: { wkid: 4326 } },
  });
  const features = [];
  let offset = 0;
  for (let page = 0; page < 10; page++) {
    const params = new URLSearchParams({
      f: "json",
      where: "1=1",
      outFields: "NameEn",
      outSR: "4326",
      returnGeometry: "true",
      resultRecordCount: "2000",
      resultOffset: String(offset),
      quantizationParameters: quantization,
    });
    const body = await fetchJson(`${CEC}/query?${params}`);
    const got = body.features ?? [];
    for (const f of got) {
      const parts = (f.geometry?.paths ?? [])
        .map((p) => decodeLine(p, body.transform))
        .filter(Boolean)
        .map((p) => cleanLine(p, false))
        .filter((p) => p.length >= 2);
      if (!parts.length) continue;
      features.push({
        type: "Feature",
        properties: { NameEn: String(f.attributes?.NameEn ?? "").trim() },
        geometry: { type: "MultiLineString", coordinates: parts },
      });
    }
    offset += got.length;
    if (got.length < 2000) break;
  }
  return features;
}

// ------------------------------------------------------------ validate ------

function validate(spec, features) {
  const fail = (msg) => {
    throw new Error(`${spec.name}: ${msg}`);
  };
  const lo = spec.baseline * 0.8;
  const hi = spec.baseline * 1.2;
  if (features.length < lo || features.length > hi)
    fail(`feature count ${features.length} outside ±20% of baseline ${spec.baseline}`);
  const checkPt = ([x, y]) => {
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < -180 || x > 180 || y < -90 || y > 90)
      fail(`out-of-range coordinate [${x}, ${y}]`);
  };
  for (const f of features) {
    const g = f.geometry;
    if (spec.kind === "wbd") {
      if (!String(f.properties[spec.hucField] ?? "").trim()) fail(`feature with empty ${spec.hucField}`);
      const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
      for (const poly of polys)
        for (const ring of poly) {
          if (ring.length < 4) fail("ring with fewer than 4 points");
          const f0 = ring[0];
          const fn = ring[ring.length - 1];
          if (f0[0] !== fn[0] || f0[1] !== fn[1]) fail("unclosed ring");
          for (const p of ring) checkPt(p);
        }
    } else {
      for (const part of g.coordinates) {
        if (part.length < 2) fail("line part with fewer than 2 points");
        for (const p of part) checkPt(p);
      }
    }
  }
}

// --------------------------------------------------------------- main -------

await mkdir(OUT_DIR, { recursive: true });
for (const spec of LAYERS) {
  const t0 = Date.now();
  const features = spec.kind === "wbd" ? await buildWbd(spec) : await buildCec(spec);
  validate(spec, features);
  const parts = spec.split ?? 1;
  const perPart = Math.ceil(features.length / parts);
  for (let i = 0; i < parts; i++) {
    const file = parts === 1 ? `${spec.name}.json` : `${spec.name}-${String.fromCharCode(97 + i)}.json`;
    const slice = features.slice(i * perPart, (i + 1) * perPart);
    // _meta is a GeoJSON foreign member — legal, ignored by maplibre. No
    // timestamp: reruns against unchanged upstream produce a zero git diff.
    const fc = {
      type: "FeatureCollection",
      _meta: {
        ...META[spec.kind],
        tolerance: spec.tolerance,
        precision: PRECISION,
        ...(parts > 1 ? { part: `${i + 1}/${parts}` } : {}),
      },
      features: slice,
    };
    const json = JSON.stringify(fc);
    await writeFile(`${OUT_DIR}/${file}`, json);
    const gz = gzipSync(Buffer.from(json), { level: 9 }).length;
    console.log(
      `${file.padEnd(14)} features: ${String(slice.length).padStart(5)}  raw: ${(json.length / 1048576).toFixed(1).padStart(5)} MB  gzip: ${(gz / 1048576).toFixed(1).padStart(4)} MB  (${((Date.now() - t0) / 1000).toFixed(0)}s)`,
    );
  }
}
console.log("done — review sizes (every file must stay under 50 MB) and commit public/overlays/.");
