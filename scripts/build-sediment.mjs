// Distills the raw sedimentation datasets (data/rattes, data/resnet,
// data/ressed — gitignored, documented in data/DATA-SOURCES.md) into the
// committed runtime files under public/sediment/:
//
//   inventory.json            all 57,452 ResNet rows — columnar attribute +
//                             network arrays with RATTES headline stats
//   trajectories/traj-NN.json 64 chunks of per-reservoir RATTES series
//   surveys.json              RESSED measured surveys, unit-converted
//   sites.json                RESST-site enrichment via the curated crosswalk
//   manifest.json             counts + content hashes
//
// Dev-time tool (never CI — the raw inputs only exist locally). Refresh with
//   npm run build:crosswalk   (if sites or ResNet changed; curate, commit)
//   npm run build:sediment    (then review sizes below and commit)
//
// Deterministic BY DESIGN: no timestamps, stable sorts, fixed formatting —
// reruns against unchanged inputs must produce a zero git diff.
//
// Format notes:
// - Columnar parallel arrays (row index = key everywhere; rows sorted by
//   ResNet ShortID ascending, so the 145 negative-ID MOUTH_* nodes come
//   first). Versus row objects this drops ~9 MB of repeated keys.
// - All volumes stay in RATTES/ResNet native m³ (the app converts to
//   acre-feet at display time). Trajectory samples carry 3 significant
//   figures, headline stats 4 — chart and panel may differ in the 4th digit.
// - Capacity series are NOT shipped: RATTES holds capacity(y) + sediment(y)
//   constant per reservoir (verified here), so clients reconstruct
//   cap[i] = capOrig − sed[i]. Rows violating the invariant by >0.5% at any
//   shipped grid point get an explicit series in the chunk's capX map.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { readCsvFile } from "./lib/csv.mjs";
import {
  GRID,
  buildJsonArray,
  canonNid,
  dedupeRessedNids,
  fmtFixed,
  fmtSig,
  gridStartIndex,
  normalizeRessed,
  parsePyIdList,
  rattesCol,
  streamRattes,
} from "./lib/sediment.mjs";

const RESNET_CSV = "data/resnet/database/ResNet.csv";
const RATTES_DIR = "data/rattes/v1.2";
const RESSED_JSON = "data/ressed/2013_database/json/ressed_export_20130404.json/ressed_export_20130404.json";
const CROSSWALK_CSV = "data/site_resnet_crosswalk.csv";
const OUT = "public/sediment";

const TRAJ_CHUNKS = 64;
const NT = GRID.length; // 17 grid slots
const SLOT_2025 = GRID.indexOf(2025);
const SLOT_2050 = GRID.indexOf(2050);

// Bitfield shipped in inventory cols.flags. Bit 32 is reserved (ResNet's
// countryOut turned out to be a multi-valued code, not an exits-the-US flag).
export const FLAG = {
  MOUTH: 1,
  TERMINAL: 2,
  HEADWATER: 4,
  IS_SITE: 8, // ResNet's own IsSite tag, distinct from the RESST crosswalk
  HAS_SURVEYS: 16,
  NO_STORAGE: 64,
  LOCK: 128,
  REMOVED: 256,
  HAS_TRAJ: 512,
};

const fail = (msg) => {
  throw new Error(`build-sediment: ${msg}`);
};

// ------------------------------------------------------ 1. ResNet load ------

const rawResnet = await readCsvFile(RESNET_CSV);
if (rawResnet.length !== 57452) fail(`ResNet.csv rows ${rawResnet.length}, expected 57452`);

const flag01 = (v) => (Number(v) === 1 ? 1 : 0);
const prettifyMouth = (s) => String(s).replace(/([a-z])([A-Z])/g, "$1 $2");

const dams = rawResnet.map((r) => {
  const nid = canonNid(r.NID);
  const isMouth = nid.startsWith("MOUTH_");
  const shortId = Math.round(Number(r.ShortID));
  if (!Number.isFinite(shortId)) fail(`bad ShortID ${r.ShortID}`);
  if (isMouth !== shortId < 0 || isMouth !== (flag01(r.IsRiverMth) === 1))
    fail(`mouth-marker disagreement on ShortID ${shortId} (${nid})`);
  return {
    shortId,
    nid,
    name: isMouth ? prettifyMouth(r.Dam_Name) : r.Dam_Name,
    lon: Number(r.Longitude),
    lat: Number(r.Latitude),
    state: r.State,
    owner: r.OwnerTypes,
    purpose: r.PrimaryPur,
    storSrc: r.StorSource,
    yrc: isMouth ? 0 : Math.round(Number(r.yrc) || 0), // mouth 1700 placeholder scrubbed
    yrr: Math.round(Number(r.yrr) || 0),
    isMouth,
    terminal: flag01(r.flagTerm),
    headwater: flag01(r.flagHW),
    isSite: flag01(r.IsSite),
    isLock: flag01(r.IsLock),
    toDam: r.ToDam === "" ? null : Math.round(Number(r.ToDam)),
    fromDam: r.FromDam, // build-time cross-check only; never shipped
    deltaTag: Math.round(Number(r.DeltaTag) || 0),
    maxStor: Number(r.MaxStor_m3),
    da: r.DivDASqKM === "" ? NaN : Number(r.DivDASqKM),
    sca: r.SCA2025 === "" ? NaN : Number(r.SCA2025),
  };
});
dams.sort((a, b) => a.shortId - b.shortId);

const n = dams.length;
const rowById = new Map(dams.map((d, i) => [d.shortId, i]));
if (rowById.size !== n) fail("duplicate ShortIDs");
const mouthCount = dams.filter((d) => d.isMouth).length;
if (mouthCount !== 145) fail(`mouth rows ${mouthCount}, expected 145`);

const to = new Int32Array(n).fill(-1);
dams.forEach((d, i) => {
  if (d.toDam == null) return;
  const t = rowById.get(d.toDam);
  if (t == null) fail(`row ${i} (ShortID ${d.shortId}): ToDam ${d.toDam} not in ResNet`);
  to[i] = t;
});

// FromDam-free verification: invert `to` and compare against the Python-repr
// FromDam lists. Nothing from this ships — it proves ToDam inversion gives
// the client the same immediate-upstream sets ResNet recorded.
{
  const children = new Map(); // row -> Set(shortId of immediate upstream)
  dams.forEach((d, i) => {
    if (to[i] >= 0) {
      let set = children.get(to[i]);
      if (!set) children.set(to[i], (set = new Set()));
      set.add(d.shortId);
    }
  });
  let populated = 0;
  let mismatched = 0;
  dams.forEach((d, i) => {
    if (!d.fromDam) return;
    populated++;
    const listed = parsePyIdList(d.fromDam);
    const derived = children.get(i) ?? new Set();
    if (listed.length !== derived.size || listed.some((id) => !derived.has(id))) mismatched++;
  });
  const pct = populated ? (100 * mismatched) / populated : 0;
  console.log(`FromDam cross-check: ${populated} populated rows, ${mismatched} mismatched (${pct.toFixed(2)}%)`);
  if (pct > 1) fail("FromDam vs inverted-ToDam mismatch above 1% — upstream derivation is unsafe");
}

// -------------------------------------------------- 2. RATTES streaming ----

const capGrid = new Float64Array(n * NT).fill(NaN);
const sedGrid = new Float64Array(n * NT).fill(NaN);
const maxCap = new Float64Array(n).fill(NaN);
const sed2015 = new Float64Array(n).fill(NaN);
const yr0Cap = new Int32Array(n).fill(-1);
const yr0Sed = new Int32Array(n).fill(-1);
const hasTraj = new Uint8Array(n);
const ci = Object.fromEntries(
  ["capHi25", "capLo25", "capHi50", "capLo50", "sedHi25", "sedLo25", "sedHi50", "sedLo50"].map((k) => [
    k,
    new Float64Array(n).fill(NaN),
  ]),
);

const rowOf = (shortId) => {
  const row = rowById.get(shortId);
  if (row == null) fail(`RATTES ShortID ${shortId} not in ResNet`);
  return row;
};

async function streamFull(file, grid, yr0Arr, maxArr, extra) {
  const t0 = Date.now();
  const count = await streamRattes(`${RATTES_DIR}/${file}`, (shortId, cells) => {
    if (cells.length !== 353) fail(`${file}: row with ${cells.length} fields`);
    const row = rowOf(shortId);
    hasTraj[row] = 1;
    let max = 0;
    let first = -1;
    for (let i = 1; i < 353; i++) {
      const v = +cells[i];
      if (v > max) max = v;
      if (first < 0 && v > 0) first = 1698 + i;
    }
    if (maxArr) maxArr[row] = max;
    yr0Arr[row] = first;
    for (let g = 0; g < NT; g++) grid[row * NT + g] = +cells[rattesCol(GRID[g])];
    if (extra) extra(row, cells);
  });
  if (count !== 57307) fail(`${file}: ${count} data rows, expected 57307`);
  console.log(`${file}: ${count} rows (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}

async function streamBenchmarks(file, hi25OrLo, at50) {
  const t0 = Date.now();
  const c25 = rattesCol(2025);
  const c50 = rattesCol(2050);
  const count = await streamRattes(`${RATTES_DIR}/${file}`, (shortId, cells) => {
    const row = rowOf(shortId);
    hi25OrLo[row] = +cells[c25];
    at50[row] = +cells[c50];
  });
  if (count !== 57307) fail(`${file}: ${count} data rows, expected 57307`);
  console.log(`${file}: ${count} rows (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}

// NOTE the filename token order differs between the Capacity and Sediment
// families — this is faithful to the Zenodo download, not a typo.
await streamFull("Capacity_m3_silt_010626.csv", capGrid, yr0Cap, maxCap);
await streamFull("Sediment_silt_m3_010626.csv", sedGrid, yr0Sed, null, (row, cells) => {
  sed2015[row] = +cells[rattesCol(2015)];
});
await streamBenchmarks("CapacityHi_m3_silt_010626.csv", ci.capHi25, ci.capHi50);
await streamBenchmarks("CapacityLo_m3_silt_010626.csv", ci.capLo25, ci.capLo50);
await streamBenchmarks("SedimentHi_silt_m3_010626.csv", ci.sedHi25, ci.sedHi50);
await streamBenchmarks("SedimentLo_silt_m3_010626.csv", ci.sedLo25, ci.sedLo50);

const trajCount = hasTraj.reduce((a, b) => a + b, 0);
if (trajCount !== 57307) fail(`hasTraj rows ${trajCount}, expected 57307`);
dams.forEach((d, i) => {
  if (!hasTraj[i] && !d.isMouth) fail(`non-mouth row without RATTES data: ShortID ${d.shortId}`);
});

// ------------------------------------- 3. derived: yr0, capOrig, capX ------

const yr0 = new Int32Array(n).fill(-1);
const capOrig = new Float64Array(n).fill(NaN);
const startIdx = new Int32Array(n).fill(-1);
const capXRows = new Set();
let maxCapDrift = 0;

for (let i = 0; i < n; i++) {
  if (!hasTraj[i]) continue;
  yr0[i] = yr0Cap[i] >= 0 ? yr0Cap[i] : yr0Sed[i];
  startIdx[i] = gridStartIndex(yr0[i] >= 0 ? yr0[i] : null);
  if (maxCap[i] > 0) {
    capOrig[i] = capGrid[i * NT + SLOT_2025] + sedGrid[i * NT + SLOT_2025];
    if (Math.abs(maxCap[i] - capOrig[i]) / Math.max(capOrig[i], 1) > 0.001) maxCapDrift++;
    const s = startIdx[i];
    if (s >= 0) {
      for (let g = s; g < NT; g++) {
        const recon = capOrig[i] - sedGrid[i * NT + g];
        if (Math.abs(recon - capGrid[i * NT + g]) / Math.max(capOrig[i], 1) > 0.005) {
          capXRows.add(i);
          break;
        }
      }
    }
  }
}
console.log(`capacity invariant: ${capXRows.size} rows need explicit capX series; maxCap vs capOrig drift >0.1% on ${maxCapDrift} rows`);

// ----------------------------------------------------- 4. RESSED join ------

const ressedRaw = JSON.parse(await readFile(RESSED_JSON, "utf8"));
if (ressedRaw.ressed.reservoir.length !== 2194) fail(`RESSED reservoirs ${ressedRaw.ressed.reservoir.length}, expected 2194`);
const { reservoirs: ressedAll, dropped, dateOnly } = normalizeRessed(ressedRaw);
const ressed = ressedAll.filter((r) => r.surveys.length > 0);
ressed.sort((a, b) => {
  const ka = Number(a.id);
  const kb = Number(b.id);
  return Number.isFinite(ka) && Number.isFinite(kb) ? ka - kb : a.id < b.id ? -1 : 1;
});
const nidWinner = dedupeRessedNids(ressed);
const rowByNid = new Map(dams.map((d, i) => [d.nid, i]));
let joined = 0;
const ressedRow = ressed.map((r, i) => {
  if (!r.nid || nidWinner.get(r.nid) !== i) return null;
  const row = rowByNid.get(r.nid);
  if (row == null) return null;
  joined++;
  return row;
});
const surveyRows = new Set(ressedRow.filter((r) => r != null));
const latestSurveyYear = new Map(); // inventory row -> most recent survey year
ressed.forEach((r, i) => {
  const row = ressedRow[i];
  if (row != null && r.surveys.length) latestSurveyYear.set(row, r.surveys[r.surveys.length - 1].year);
});
console.log(
  `RESSED: ${ressed.length} reservoirs with surveys (${dateOnly} date-only surveys kept; ${dropped.badYear} bad-year dropped), ` +
    `${joined} joined to ResNet by NID (${((100 * joined) / ressed.length).toFixed(0)}%)`,
);

// ------------------------------------------------- 5. crosswalk / sites ----

const xwalk = (await readCsvFile(CROSSWALK_CSV)).filter((r) => r.status !== "rejected");
const p4 = (v) => (v == null || !Number.isFinite(v) ? null : Number(v.toPrecision(4)));
const siteLinks = xwalk
  .map((r) => {
    const shortId = Math.round(Number(r.short_id));
    const row = rowById.get(shortId);
    if (row == null) fail(`crosswalk ${r.site_id}: short_id ${r.short_id} not in ResNet`);
    return {
      site_id: r.site_id,
      short_id: shortId,
      nid: dams[row].nid,
      method: r.method,
      confidence: r.confidence,
      cap_orig_m3: p4(capOrig[row]),
      cap2025_m3: hasTraj[row] ? p4(capGrid[row * NT + SLOT_2025]) : null,
      sed2025_m3: hasTraj[row] ? p4(sedGrid[row * NT + SLOT_2025]) : null,
      sed2015_m3: hasTraj[row] ? p4(sed2015[row]) : null,
      cap2050_m3: hasTraj[row] ? p4(capGrid[row * NT + SLOT_2050]) : null,
      sed2050_m3: hasTraj[row] ? p4(sedGrid[row * NT + SLOT_2050]) : null,
      has_surveys: surveyRows.has(row),
      latest_survey_year: latestSurveyYear.get(row) ?? null,
    };
  })
  .sort((a, b) => (a.site_id < b.site_id ? -1 : 1));

// ------------------------------------------------------ 6. flags column ----

const flags = new Int32Array(n);
dams.forEach((d, i) => {
  let f = 0;
  if (d.isMouth) f |= FLAG.MOUTH;
  if (d.terminal) f |= FLAG.TERMINAL;
  if (d.headwater) f |= FLAG.HEADWATER;
  if (d.isSite) f |= FLAG.IS_SITE;
  if (surveyRows.has(i)) f |= FLAG.HAS_SURVEYS;
  if (hasTraj[i] && !(maxCap[i] > 0)) f |= FLAG.NO_STORAGE;
  if (d.isLock) f |= FLAG.LOCK;
  if (d.yrr > 0) f |= FLAG.REMOVED;
  if (hasTraj[i]) f |= FLAG.HAS_TRAJ;
  flags[i] = f;
});

// -------------------------------------------------------- 7. validation ----

{
  let cap25Total = 0;
  let sed25Total = 0;
  let zeroCap25 = 0;
  for (let i = 0; i < n; i++) {
    if (!hasTraj[i]) continue;
    const c = capGrid[i * NT + SLOT_2025];
    const s = sedGrid[i * NT + SLOT_2025];
    if (!(c >= 0) || !(s >= 0)) fail(`negative/NaN 2025 value on row ${i}`);
    cap25Total += c;
    sed25Total += s;
    if (c === 0) zeroCap25++;
  }
  const capKm3 = cap25Total / 1e9;
  const sedKm3 = sed25Total / 1e9;
  console.log(`totals: capacity2025 ${capKm3.toFixed(1)} km³ · sediment2025 ${sedKm3.toFixed(1)} km³ · zero-capacity-2025 rows ${zeroCap25}`);
  if (Math.abs(capKm3 - 1142.6) / 1142.6 > 0.005) fail(`capacity2025 total ${capKm3} km³ outside ±0.5% of 1142.6`);
  if (Math.abs(sedKm3 - 65.6) / 65.6 > 0.005) fail(`sediment2025 total ${sedKm3} km³ outside ±0.5% of 65.6`);
  if (Math.abs(zeroCap25 - 501) > 10) fail(`zero-capacity-2025 rows ${zeroCap25} outside 501±10`);
  dams.forEach((d, i) => {
    if (!Number.isFinite(d.lon) || !Number.isFinite(d.lat) || Math.abs(d.lon) > 180 || Math.abs(d.lat) > 90)
      fail(`row ${i}: bad coordinates ${d.lon}, ${d.lat}`);
    if (d.maxStor < 0 || d.da < 0 || (Number.isFinite(d.sca) && d.sca < 0)) fail(`row ${i}: negative attribute`);
  });
}

// ------------------------------------------------------------- 8. emit -----

await mkdir(`${OUT}/trajectories`, { recursive: true });
const trajSpan = Math.ceil(n / TRAJ_CHUNKS);
const manifest = { counts: {}, sha256: {} };
const written = [];

async function emit(relPath, content) {
  await writeFile(`${OUT}/${relPath}`, content);
  manifest.sha256[relPath] = createHash("sha256").update(content).digest("hex").slice(0, 16);
  const gz = gzipSync(Buffer.from(content), { level: 9 }).length;
  written.push({ relPath, raw: content.length, gz });
  if (content.length > 50 * 1048576) fail(`${relPath} exceeds 50 MB — needs a split`);
}

// Dictionary-encode the four categorical columns.
function buildDict(values) {
  const list = [...new Set(values.filter((v) => v !== ""))].sort();
  const index = new Map(list.map((v, i) => [v, i]));
  return { list, idx: (v) => (v === "" ? -1 : index.get(v)) };
}
const dState = buildDict(dams.map((d) => d.state));
const dOwner = buildDict(dams.map((d) => d.owner));
const dPurpose = buildDict(dams.map((d) => d.purpose));
const dStorSrc = buildDict(dams.map((d) => d.storSrc));

const RESNET_META = {
  source: "ResNet (Hurst, Foster & Eckland 2025, Scientific Data 12:2044)",
  doi: "10.1038/s41597-025-06315-8",
  zenodo: "10.5281/zenodo.15644268",
  type: "inventory + network-derived",
  license: "see data/DATA-SOURCES.md",
};
const RATTES_META = {
  source: "RATTES v1.2, silt scenario (final)",
  doi: "10.1038/s41467-026-76986-3",
  zenodo: "10.5281/zenodo.20789549",
  type: "modeled",
  units: "m3",
  license: "see data/DATA-SOURCES.md",
};
const CAPACITY_RULE = "cap[i] = capOrig - sed[i] unless the row appears in capX";

// inventory.json — hand-assembled columnar JSON.
{
  const idxs = dams.map((_, i) => i);
  const col = {
    id: buildJsonArray(idxs, (i) => String(dams[i].shortId)),
    name: buildJsonArray(idxs, (i) => JSON.stringify(dams[i].name)),
    nid: buildJsonArray(idxs, (i) => JSON.stringify(dams[i].nid)),
    lon: buildJsonArray(idxs, (i) => fmtFixed(dams[i].lon, 4)),
    lat: buildJsonArray(idxs, (i) => fmtFixed(dams[i].lat, 4)),
    state: buildJsonArray(idxs, (i) => String(dState.idx(dams[i].state))),
    owner: buildJsonArray(idxs, (i) => String(dOwner.idx(dams[i].owner))),
    purpose: buildJsonArray(idxs, (i) => String(dPurpose.idx(dams[i].purpose))),
    storSrc: buildJsonArray(idxs, (i) => String(dStorSrc.idx(dams[i].storSrc))),
    yrc: buildJsonArray(idxs, (i) => String(dams[i].yrc)),
    flags: buildJsonArray(idxs, (i) => String(flags[i])),
    to: buildJsonArray(idxs, (i) => String(to[i])),
    deltaTag: buildJsonArray(idxs, (i) => String(dams[i].deltaTag)),
    maxStor: buildJsonArray(idxs, (i) => fmtSig(dams[i].maxStor, 4)),
    da: buildJsonArray(idxs, (i) => fmtSig(Number.isFinite(dams[i].da) ? dams[i].da : null, 4)),
    sca: buildJsonArray(idxs, (i) => fmtSig(Number.isFinite(dams[i].sca) ? dams[i].sca : null, 4)),
    capOrig: buildJsonArray(idxs, (i) => fmtSig(Number.isFinite(capOrig[i]) ? capOrig[i] : null, 4)),
    cap2025: buildJsonArray(idxs, (i) => (hasTraj[i] ? fmtSig(capGrid[i * NT + SLOT_2025], 4) : "null")),
    cap2050: buildJsonArray(idxs, (i) => (hasTraj[i] ? fmtSig(capGrid[i * NT + SLOT_2050], 4) : "null")),
    sed2015: buildJsonArray(idxs, (i) => (hasTraj[i] ? fmtSig(sed2015[i], 4) : "null")),
    sed2025: buildJsonArray(idxs, (i) => (hasTraj[i] ? fmtSig(sedGrid[i * NT + SLOT_2025], 4) : "null")),
    sed2050: buildJsonArray(idxs, (i) => (hasTraj[i] ? fmtSig(sedGrid[i * NT + SLOT_2050], 4) : "null")),
    evd: buildJsonArray(idxs, () => "0"), // 0 until RATTES Supplementary Data 1 is acquired
  };
  const meta = {
    resnet: RESNET_META,
    rattes: RATTES_META,
    coordPrecision: 4,
    sigFigs: 4,
    flagBits: FLAG,
    trajSpan,
    trajChunks: TRAJ_CHUNKS,
    capacityRule: CAPACITY_RULE,
    notes:
      "Columnar parallel arrays; row = index, sorted by ShortID (145 negative-ID mouth nodes first). " +
      "capOrig = cap2025 + sed2025 (RATTES invariant). yrc 0 = unknown. to = row index of next downstream dam, -1 = none. " +
      "evd: 0 unknown, 1 survey-constrained, 2 MLR-predicted.",
  };
  const json =
    `{"_meta":${JSON.stringify(meta)},"n":${n},` +
    `"dicts":{"state":${JSON.stringify(dState.list)},"owner":${JSON.stringify(dOwner.list)},"purpose":${JSON.stringify(dPurpose.list)},"storSrc":${JSON.stringify(dStorSrc.list)}},` +
    `"cols":{${Object.entries(col)
      .map(([k, v]) => `"${k}":${v}`)
      .join(",")}}}`;
  await emit("inventory.json", json);
}

// trajectories/traj-NN.json — 64 row-range chunks.
for (let k = 0; k < TRAJ_CHUNKS; k++) {
  const lo = k * trajSpan;
  const hi = Math.min(n, lo + trajSpan);
  const rows = [];
  for (let i = lo; i < hi; i++) if (hasTraj[i]) rows.push(i);
  const meta = {
    ...RATTES_META,
    grid: GRID,
    chunk: `${k + 1}/${TRAJ_CHUNKS}`,
    span: trajSpan,
    sigFigs: 3,
    capacityRule: CAPACITY_RULE,
  };
  const sedArr = buildJsonArray(rows, (i) => {
    const s = startIdx[i];
    if (s < 0) return "[]";
    const vals = [];
    for (let g = s; g < NT; g++) vals.push(sedGrid[i * NT + g]);
    return buildJsonArray(vals, (v) => fmtSig(v, 3));
  });
  const ciArr = (arr) => buildJsonArray(rows, (i) => fmtSig(Number.isFinite(arr[i]) ? arr[i] : null, 3));
  const capX = rows
    .filter((i) => capXRows.has(i))
    .map((i) => {
      const s = startIdx[i];
      const vals = [];
      for (let g = s; g < NT; g++) vals.push(capGrid[i * NT + g]);
      return `"${i}":${buildJsonArray(vals, (v) => fmtSig(v, 3))}`;
    });
  const json =
    `{"_meta":${JSON.stringify(meta)},` +
    `"rows":${buildJsonArray(rows, (i) => String(i))},` +
    `"yr0":${buildJsonArray(rows, (i) => (yr0[i] >= 0 ? String(yr0[i]) : "null"))},` +
    `"start":${buildJsonArray(rows, (i) => String(startIdx[i]))},` +
    `"sed":${sedArr},` +
    `"sedHi25":${ciArr(ci.sedHi25)},"sedLo25":${ciArr(ci.sedLo25)},"sedHi50":${ciArr(ci.sedHi50)},"sedLo50":${ciArr(ci.sedLo50)},` +
    `"capHi25":${ciArr(ci.capHi25)},"capLo25":${ciArr(ci.capLo25)},"capHi50":${ciArr(ci.capHi50)},"capLo50":${ciArr(ci.capLo50)},` +
    `"capX":{${capX.join(",")}}}`;
  await emit(`trajectories/traj-${String(k).padStart(2, "0")}.json`, json);
}

// surveys.json — RESSED distilled, columnar reservoir + survey arrays.
{
  const surveysFlat = [];
  ressed.forEach((r, ri) => {
    for (const s of r.surveys) surveysFlat.push({ ri, s });
  });
  const meta = {
    source: "USGS RESSED (Reservoir Sedimentation Database), 2013-04-04 JSON export",
    url: "https://water.usgs.gov/osw/ressed/",
    license: "Public domain (USGS)",
    type: "measured",
    units: {
      cap: "m3 (ACFT × 1233.48184)",
      area: "m2 (AC × 4046.8564)",
      sedTot: "m3 (ACFT × 1233.48184)",
      dryWt: "kg/m3 (lb/ft3 × 16.018463)",
    },
    notes: "row = inventory row index of the joined ResNet dam (null when unjoined). sedTot is the per-interval deposit since the previous survey.",
  };
  const json =
    `{"_meta":${JSON.stringify(meta)},` +
    `"reservoirs":{` +
    `"id":${buildJsonArray(ressed, (r) => JSON.stringify(r.id))},` +
    `"name":${buildJsonArray(ressed, (r) => JSON.stringify(r.name))},` +
    `"nid":${buildJsonArray(ressed, (r) => (r.nid ? JSON.stringify(r.nid) : "null"))},` +
    `"row":${buildJsonArray(ressedRow, (row) => (row == null ? "null" : String(row)))},` +
    `"lon":${buildJsonArray(ressed, (r) => fmtFixed(r.lon, 4))},` +
    `"lat":${buildJsonArray(ressed, (r) => fmtFixed(r.lat, 4))},` +
    `"state":${buildJsonArray(ressed, (r) => JSON.stringify(r.state))},` +
    `"began":${buildJsonArray(ressed, (r) => (r.began == null ? "null" : String(r.began)))}},` +
    `"surveys":{` +
    `"rIdx":${buildJsonArray(surveysFlat, (x) => String(x.ri))},` +
    `"year":${buildJsonArray(surveysFlat, (x) => String(x.s.year))},` +
    `"pool":${buildJsonArray(surveysFlat, (x) => JSON.stringify(x.s.pool))},` +
    `"cap":${buildJsonArray(surveysFlat, (x) => fmtSig(x.s.cap, 4))},` +
    `"area":${buildJsonArray(surveysFlat, (x) => fmtSig(x.s.area, 4))},` +
    `"sedTot":${buildJsonArray(surveysFlat, (x) => fmtSig(x.s.sedTot, 4))},` +
    `"dryWt":${buildJsonArray(surveysFlat, (x) => fmtSig(x.s.dryWt, 3))}}}`;
  await emit("surveys.json", json);
  manifest.counts.surveyReservoirs = ressed.length;
  manifest.counts.surveys = surveysFlat.length;
}

// sites.json — small row-object file, boot-loaded with the core app data.
{
  const meta = {
    sources: { resnet: RESNET_META, rattes: RATTES_META },
    notes: "One row per non-rejected data/site_resnet_crosswalk.csv match. Headline stats let site panels render without inventory.json.",
  };
  await emit("sites.json", JSON.stringify({ _meta: meta, sites: siteLinks }));
  manifest.counts.siteLinks = siteLinks.length;
}

manifest.counts.inventory = n;
manifest.counts.trajectories = trajCount;
manifest.counts.trajectoryChunks = TRAJ_CHUNKS;
manifest.counts.capXRows = capXRows.size;
await emit("manifest.json", JSON.stringify(manifest, null, 2));

// -------------------------------------------------------------- report -----

let rawTotal = 0;
let gzTotal = 0;
const mb = (b) => (b / 1048576).toFixed(2).padStart(6);
for (const w of written) {
  rawTotal += w.raw;
  gzTotal += w.gz;
  if (!w.relPath.startsWith("trajectories/") || w.relPath.endsWith("-00.json"))
    console.log(`${w.relPath.padEnd(28)} raw: ${mb(w.raw)} MB  gzip: ${mb(w.gz)} MB`);
}
const trajFiles = written.filter((w) => w.relPath.startsWith("trajectories/"));
const trajRaw = trajFiles.reduce((a, w) => a + w.raw, 0);
const trajGz = trajFiles.reduce((a, w) => a + w.gz, 0);
console.log(`trajectories/ (all ${trajFiles.length})       raw: ${mb(trajRaw)} MB  gzip: ${mb(trajGz)} MB`);
console.log(`TOTAL                        raw: ${mb(rawTotal)} MB  gzip: ${mb(gzTotal)} MB`);
console.log("done — review sizes and `git status` (a rerun against unchanged inputs must show zero diff), then commit public/sediment/.");
