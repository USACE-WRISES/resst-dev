// Generates candidate matches between RESST sites (data/sites.csv) and ResNet
// dams (data/resnet/database/ResNet.csv), writing the CURATED, TRACKED file
//   data/site_resnet_crosswalk.csv
//
// Dev-time tool (raw ResNet is gitignored — see data/DATA-SOURCES.md). Run:
//   npm run build:crosswalk        (then review new "auto" rows and commit)
//
// Curation contract: rows whose status is "confirmed" or "rejected", and rows
// whose method is "manual", are NEVER overwritten — edit status/notes freely
// (a spreadsheet is fine; keep the header). Rows with status "auto" are
// regenerated from scratch on every run. build-sediment.mjs consumes every
// non-rejected row, so auto matches flow into the app immediately and a bad
// match is fixed by flipping its status to "rejected".
//
// Match passes:
//   1. NID exact — site.nid_id == ResNet.NID (canonicalized). confidence high.
//   2. Spatial + name — nearest candidates within 5 km, scored by Jaccard
//      similarity of non-generic name tokens (CamelCase split — ResNet mouth
//      and some dam names look like "SacramentoRiver"):
//        ≤1 km and score ≥0.50 → high
//        ≤3 km and score ≥0.34 → medium
//        otherwise best within 5 km → low
//      Pure nearest-neighbor was rejected: dam-dense valleys make silent
//      false positives that curation would never notice; a low-confidence row
//      with score 0 is at least visibly weak.
//   Sites with no coordinates, or outside ResNet's CONUS coverage, get no row.

import { readCsvFile, writeCsvFile } from "./lib/csv.mjs";
import { access } from "node:fs/promises";
import { canonNid, haversineMeters, jaccard, nameTokens } from "./lib/sediment.mjs";

const OUT = "data/site_resnet_crosswalk.csv";
const COLUMNS = ["site_id", "short_id", "nid", "method", "confidence", "distance_m", "name_score", "status", "notes"];
const MAX_DIST_M = 5000;

const sites = await readCsvFile("data/sites.csv");
const resnet = (await readCsvFile("data/resnet/database/ResNet.csv"))
  .filter((r) => !String(r.NID).startsWith("MOUTH_")) // never match a site to a synthetic mouth node
  .map((r) => ({
    shortId: Math.round(Number(r.ShortID)),
    nid: canonNid(r.NID),
    name: r.Dam_Name,
    lon: Number(r.Longitude),
    lat: Number(r.Latitude),
    tokens: nameTokens(r.Dam_Name),
  }));
const byNid = new Map(resnet.map((r) => [r.nid, r]));

// Preserve curated rows from a previous run.
let preserved = [];
try {
  await access(OUT);
  const existing = await readCsvFile(OUT);
  preserved = existing.filter((r) => r.status !== "auto" || r.method === "manual");
} catch {
  /* first run — nothing to preserve */
}
const preservedSiteIds = new Set(preserved.map((r) => r.site_id));

// Sort dams by latitude for a cheap window prefilter (5 km ≈ 0.045° lat).
const byLat = [...resnet].sort((a, b) => a.lat - b.lat);
const lats = byLat.map((r) => r.lat);
const LAT_WINDOW = 0.05;
function lowerBound(arr, v) {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] < v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

const rows = [];
const counts = { nid: 0, high: 0, medium: 0, low: 0, none: 0, noCoords: 0, preserved: preserved.length };
const nidMisses = [];

for (const site of sites) {
  if (preservedSiteIds.has(site.site_id)) continue;

  // Pass 1: NID exact.
  const siteNid = canonNid(site.nid_id);
  if (siteNid) {
    const hit = byNid.get(siteNid);
    if (hit) {
      const lon = Number(site.longitude);
      const lat = Number(site.latitude);
      const d = Number.isFinite(lon) && Number.isFinite(lat) ? Math.round(haversineMeters(lon, lat, hit.lon, hit.lat)) : "";
      rows.push({
        site_id: site.site_id,
        short_id: hit.shortId,
        nid: hit.nid,
        method: "nid",
        confidence: "high",
        distance_m: d,
        name_score: "",
        status: "auto",
        notes: "",
      });
      counts.nid++;
      continue;
    }
    nidMisses.push(`${site.site_id} (${siteNid})`); // fall through to spatial
  }

  // Pass 2: spatial + name.
  const lon = Number(site.longitude);
  const lat = Number(site.latitude);
  if (site.longitude === "" || !Number.isFinite(lon) || !Number.isFinite(lat)) {
    counts.noCoords++;
    continue;
  }
  const tokens = nameTokens(site.site_name);
  let best = null; // { dam, d, score, tier } — tier 0 high, 1 medium, 2 low
  const from = lowerBound(lats, lat - LAT_WINDOW);
  for (let i = from; i < byLat.length && byLat[i].lat <= lat + LAT_WINDOW; i++) {
    const dam = byLat[i];
    const d = haversineMeters(lon, lat, dam.lon, dam.lat);
    if (d > MAX_DIST_M) continue;
    const score = jaccard(tokens, dam.tokens);
    const tier = d <= 1000 && score >= 0.5 ? 0 : d <= 3000 && score >= 0.34 ? 1 : 2;
    if (
      !best ||
      tier < best.tier ||
      (tier === best.tier && (score > best.score || (score === best.score && (d < best.d || (d === best.d && dam.shortId < best.dam.shortId)))))
    ) {
      best = { dam, d, score, tier };
    }
  }
  if (!best) {
    counts.none++;
    continue;
  }
  const confidence = best.tier === 0 ? "high" : best.tier === 1 ? "medium" : "low";
  counts[confidence]++;
  rows.push({
    site_id: site.site_id,
    short_id: best.dam.shortId,
    nid: best.dam.nid,
    method: "spatial_name",
    confidence,
    distance_m: Math.round(best.d),
    name_score: best.score.toFixed(2),
    status: "auto",
    notes: "",
  });
}

const all = [...preserved, ...rows].sort((a, b) => (a.site_id < b.site_id ? -1 : a.site_id > b.site_id ? 1 : 0));
await writeCsvFile(OUT, all, COLUMNS);

// Duplicate ShortIDs are legal (two RESST sites can describe one dam) but
// worth eyeballing during curation.
const dupes = new Map();
for (const r of all) if (r.status !== "rejected" && r.short_id !== "") dupes.set(r.short_id, (dupes.get(r.short_id) ?? 0) + 1);
const shared = [...dupes.entries()].filter(([, n]) => n > 1);

console.log(
  `wrote ${OUT}: ${all.length} rows (${counts.preserved} curated preserved) — ` +
    `nid ${counts.nid} · spatial high ${counts.high} · medium ${counts.medium} · low ${counts.low}`,
);
console.log(`unmatched: ${counts.none} coord sites with no dam within ${MAX_DIST_M / 1000} km · ${counts.noCoords} sites without coordinates skipped`);
if (nidMisses.length) console.log(`WARN site nid_id absent from ResNet (fell back to spatial): ${nidMisses.join(", ")}`);
if (shared.length) console.log(`note: ${shared.length} dams matched by more than one site (legal — review): ${shared.slice(0, 5).map(([id, n]) => `${id}×${n}`).join(", ")}`);
