// Pure helpers for the sedimentation-data pipeline (build-crosswalk.mjs and
// build-sediment.mjs) — kept side-effect-free so vitest can exercise them in
// Node (tests/sedimentBuild.test.ts). Raw-input facts these encode are
// documented in data/DATA-SOURCES.md; the shipped-file schemas in the scripts.

import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

// ------------------------------------------------------------ numbers -------

/**
 * Format a number at `sig` significant figures as the SHORTER of plain and
 * exponential notation — both are valid JSON number tokens, and at national
 * scale (57k rows × many columns) the bytes matter. null/NaN → "null".
 */
export function fmtSig(v, sig) {
  if (v == null || !Number.isFinite(v)) return "null";
  if (v === 0) return "0";
  const p = Number(v.toPrecision(sig));
  const plain = String(p);
  const exp = p.toExponential();
  return exp.length < plain.length ? exp : plain;
}

/** Fixed-decimal rounding for coordinates (trailing zeros drop naturally). */
export function fmtFixed(v, decimals) {
  if (v == null || !Number.isFinite(v)) return "null";
  return String(Math.round(v * 10 ** decimals) / 10 ** decimals);
}

/** Join pre-formatted JSON tokens into a JSON array literal. */
export function buildJsonArray(values, fmt) {
  const parts = new Array(values.length);
  for (let i = 0; i < values.length; i++) parts[i] = fmt(values[i], i);
  return "[" + parts.join(",") + "]";
}

// ------------------------------------------------------------- RATTES -------

/**
 * The shipped trajectory grid: decadal 1900–2020 plus the benchmark years.
 * Pre-1900 history collapses to the (yr0, sed=0) anchor — acceptable for the
 * handful of 18th/19th-century dams.
 */
export const GRID = [1900, 1910, 1920, 1930, 1940, 1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020, 2025, 2030, 2040, 2050];

/** RATTES CSV field index for a model year (field 0 is the ShortID). */
export const rattesCol = (year) => year - 1698;

/** Index of the first GRID slot at/after yr0 (0 when yr0 ≤ 1900); -1 for null. */
export function gridStartIndex(yr0) {
  if (yr0 == null) return -1;
  for (let i = 0; i < GRID.length; i++) if (GRID[i] >= yr0) return i;
  return -1; // yr0 beyond 2050 — treat as no shippable series
}

/**
 * Stream one RATTES matrix CSV (353 columns × 57,307 data rows, ~110 MB —
 * never loaded whole). Rows are pure numerics, so a plain split is safe.
 * Calls onRow(shortId:number, cells:string[]) per data row; resolves to the
 * data-row count.
 */
export async function streamRattes(path, onRow) {
  const rl = createInterface({ input: createReadStream(path, { encoding: "utf8" }), crlfDelay: Infinity });
  let first = true;
  let count = 0;
  for await (const line of rl) {
    if (first) {
      first = false; // header: NaN,1699,…,2050
      continue;
    }
    if (!line) continue;
    const cells = line.split(",");
    onRow(Number(cells[0]), cells);
    count++;
  }
  return count;
}

// ------------------------------------------------------------- ResNet -------

/**
 * ResNet serializes upstream-dam lists as a Python repr, e.g.
 * "[np.float64(288955.0), np.float64(289838.0)]" — extract the numbers;
 * never JSON.parse. Used only for the build-time ToDam-inversion cross-check.
 */
export function parsePyIdList(str) {
  if (!str) return [];
  // "np.float64" itself contains digits — strip the wrapper tokens before
  // extracting, so both repr styles ("[np.float64(288955.0)]" and "[2, 9, 1]")
  // parse correctly.
  const cleaned = String(str).replace(/np\.float64/g, "");
  const out = [];
  for (const m of cleaned.matchAll(/-?\d+(?:\.\d+)?/g)) out.push(Math.round(Number(m[0])));
  return out;
}

/** NID identifiers carry stray whitespace/case in RESSED — canonicalize. */
export function canonNid(s) {
  return String(s ?? "").trim().toUpperCase();
}

// ------------------------------------------------------------- RESSED -------

export const ACFT_TO_M3 = 1233.48184; // acre-foot → cubic meters
export const AC_TO_M2 = 4046.8564224; // acre → square meters
export const PCF_TO_KGM3 = 16.018463; // lb/ft³ → kg/m³

// stat_def_ids of the four workhorse survey statistics (2013 export).
export const RESSED_STAT = { AREA: 2, CAPACITY: 3, SED_INTERVAL: 38, DRY_WEIGHT: 41 };

const asArray = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

function parseYear(dateStr) {
  const m = /^(\d{4})/.exec(String(dateStr ?? ""));
  return m ? Number(m[1]) : null;
}

/**
 * Normalize the 2013 RESSED JSON export into flat reservoir records with
 * converted-unit survey lists. Quirks handled (see data/DATA-SOURCES.md):
 * XML-shaped export leaves `survey`/`stat` as bare objects when singular;
 * survey years outside [1750, 2013] are artifacts and are dropped; duplicate
 * stat_def_ids within one survey keep the first value. Surveys carrying none
 * of the four workhorse stats are dropped; reservoirs may end up with zero
 * surveys (the caller decides whether to keep them).
 */
export function normalizeRessed(json) {
  const dropped = { badYear: 0, emptySurvey: 0 };
  const reservoirs = [];
  for (const res of json.ressed.reservoir) {
    const surveys = [];
    for (const s of asArray(res.survey)) {
      const year = parseYear(s.survey_date);
      if (year == null || year < 1750 || year > 2013) {
        dropped.badYear++;
        continue;
      }
      const stats = {};
      for (const st of asArray(s.stat)) {
        if (st == null || st.stat_def_id == null) continue;
        if (!(st.stat_def_id in stats)) stats[st.stat_def_id] = Number(st.stat_value);
      }
      const pick = (id, factor) => (Number.isFinite(stats[id]) ? stats[id] * factor : null);
      const survey = {
        year,
        date: String(s.survey_date),
        pool: String(s.pool_type_cd ?? ""),
        cap: pick(RESSED_STAT.CAPACITY, ACFT_TO_M3),
        area: pick(RESSED_STAT.AREA, AC_TO_M2),
        sedTot: pick(RESSED_STAT.SED_INTERVAL, ACFT_TO_M3),
        dryWt: pick(RESSED_STAT.DRY_WEIGHT, PCF_TO_KGM3),
      };
      if (survey.cap == null && survey.area == null && survey.sedTot == null && survey.dryWt == null) {
        dropped.emptySurvey++;
        continue;
      }
      surveys.push(survey);
    }
    surveys.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    reservoirs.push({
      id: String(res.reservoir_id ?? ""),
      name: String(res.reservoir_nm ?? ""),
      nid: canonNid(res.nid_id),
      lon: Number.isFinite(Number(res.longitude)) && res.longitude != null ? Number(res.longitude) : null,
      lat: Number.isFinite(Number(res.latitude)) && res.latitude != null ? Number(res.latitude) : null,
      state: String(res.state_fips_alpha_cd ?? "").trim(),
      began: parseYear(res.date_storage_began),
      surveys,
    });
  }
  return { reservoirs, dropped };
}

/**
 * RESSED has 20 NID values shared by more than one reservoir (distinct pools
 * or datasheets under one dam). Exactly one reservoir may carry the ResNet
 * link: most surviving surveys wins; ties break to the latest survey year,
 * then the lowest reservoir_id. Returns Map<nid, reservoir index>.
 */
export function dedupeRessedNids(reservoirs) {
  const byNid = new Map();
  reservoirs.forEach((r, i) => {
    if (!r.nid) return;
    const prev = byNid.get(r.nid);
    if (prev == null) {
      byNid.set(r.nid, i);
      return;
    }
    const a = reservoirs[prev];
    const better =
      r.surveys.length !== a.surveys.length
        ? r.surveys.length > a.surveys.length
        : lastYear(r) !== lastYear(a)
          ? lastYear(r) > lastYear(a)
          : idKey(r) < idKey(a);
    if (better) byNid.set(r.nid, i);
  });
  return byNid;
}

const lastYear = (r) => (r.surveys.length ? r.surveys[r.surveys.length - 1].year : -1);
const idKey = (r) => {
  const n = Number(r.id);
  return Number.isFinite(n) ? n : r.id;
};

// ---------------------------------------------------- crosswalk scoring -----

// Tokens too generic to indicate a real name match on their own.
const GENERIC_TOKENS = new Set(["dam", "lake", "reservoir", "creek", "river", "no", "the", "of", "and", "at", "site"]);

/**
 * Scoring tokens for dam/site name similarity: CamelCase is split (RESST site
 * names look like "SacramentoRiver"), then non-alphanumerics; lowercased;
 * generic hydronym tokens excluded so "X Creek Dam" vs "Y Creek Dam" scores 0.
 */
export function nameTokens(s) {
  const spaced = String(s ?? "").replace(/([a-z])([A-Z])/g, "$1 $2");
  const out = new Set();
  for (const t of spaced.toLowerCase().split(/[^a-z0-9]+/)) {
    if (t && !GENERIC_TOKENS.has(t)) out.add(t);
  }
  return out;
}

/** Jaccard similarity of two token sets (0 when either is empty). */
export function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

const R_EARTH = 6371008.8;
const rad = (d) => (d * Math.PI) / 180;

/** Great-circle distance in meters. */
export function haversineMeters(lon1, lat1, lon2, lat2) {
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(a)));
}
