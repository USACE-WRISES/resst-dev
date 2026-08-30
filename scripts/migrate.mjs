// One-time migration: verified ArcGIS extracts (RESST-migration/03-data) →
// authoritative repo CSVs (data/). Applies the owner-approved fixes (decision
// D7), assigns stable IDs, resolves the Survey123 relationship to a foreign
// key, snapshots the NID records referenced by sites, and writes
// data/MIGRATION-LOG.md documenting every transformation.
//
// Deterministic: source rows are processed in objectid order. It rebuilds
// data/ from the archived extracts every time.
//
// WARNING (2026-08-30): data/ now carries POST-MIGRATION edits made per
// docs/DATA-EDITING.md (e.g. the owner-approved removal of the "Narnia Test
// 123"/"This is a Test" test-record cluster, NID identity corrections). This
// script knows nothing about those edits — rerunning it OVERWRITES them and
// resurrects the removed records. Do not re-run against the live data/ unless
// you intend exactly that; its acceptance gates still assert the original
// migration output (979 sites / 466 literature / 1,410 entries).

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { writeCsvFile } from "./lib/csv.mjs";

const SRC = "RESST-migration/03-data";
const OUT = "data";
const log = [];
const note = (s) => log.push(s);

const trimAll = (obj) => {
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[k] = typeof v === "string" ? v.trim() : v;
  return out;
};

const slug = (name) =>
  name.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// ---------------------------------------------------------------- load inputs
const sitesGj = JSON.parse(await readFile(`${SRC}/resst-sites.geojson`, "utf8"));
const litGj = JSON.parse(await readFile(`${SRC}/resst-literature.geojson`, "utf8"));
const rep1 = JSON.parse(await readFile(`${SRC}/resst-lit-repeat-page1.json`, "utf8"));
const rep2 = JSON.parse(await readFile(`${SRC}/resst-lit-repeat-page2.json`, "utf8"));
const repRows = [...rep1.features, ...rep2.features].map((f) => f.attributes);

// ---------------------------------------------------------------------- sites
const COORD_FIXES = {
  // site_name -> [lon, lat]; owner-approved swap corrections (decision D7).
  "Millsite Reservoir": [-111.1978, 39.0965555600001],
  "Mrica Reservoir": [109.6061, -7.39229999999998],
};

const siteFeatures = [...sitesGj.features].sort((a, b) => a.properties.objectid - b.properties.objectid);
const sites = [];
const usedSiteIds = new Set();
const siteIdByRawName = new Map();
const noGeometry = [];
const coordMismatches = [];
let typoFixCount = 0;

const fixTypo = (v, where) => {
  if (typeof v === "string" && v.includes("Water Injection Dreding")) {
    typoFixCount++;
    return v.replaceAll("Water Injection Dreding", "Water Injection Dredging");
  }
  return v;
};

for (const f of siteFeatures) {
  const p = trimAll(f.properties);
  let lon = "", lat = "";
  if (f.geometry && Array.isArray(f.geometry.coordinates)) {
    [lon, lat] = f.geometry.coordinates;
  }
  if (COORD_FIXES[p.site_name]) {
    const [flon, flat] = COORD_FIXES[p.site_name];
    note(`- **Coordinate swap fixed** — ${p.site_name}: geometry [${lon}, ${lat}] → lon=${flon}, lat=${flat}`);
    lon = flon; lat = flat;
  }
  if (lon === "" && lat === "") noGeometry.push(p.site_name);
  // Cross-check against the Survey123 text attributes where present.
  const aLon = parseFloat(p.longitude), aLat = parseFloat(p.latitude);
  if (lon !== "" && Number.isFinite(aLon) && Number.isFinite(aLat)) {
    if (Math.abs(aLon - lon) > 0.001 || Math.abs(aLat - lat) > 0.001) {
      coordMismatches.push(`${p.site_name}: geometry [${lon}, ${lat}] vs attribute [${aLon}, ${aLat}]`);
    }
  }
  let id = slug(p.site_name) || "site";
  let n = 2;
  while (usedSiteIds.has(id)) id = `${slug(p.site_name)}-${n++}`;
  usedSiteIds.add(id);
  // Exact original (untrimmed) name → site_id, replicating the current app's
  // exact-string literature join so entry linkage migrates record-for-record.
  siteIdByRawName.set(f.properties.site_name, id);
  sites.push({
    site_id: id,
    site_name: p.site_name,
    nid_id: p.nid_id ?? "",
    responsible_districtagency: p.responsible_districtagency ?? "",
    address: p.address ?? "",
    city: p.city ?? "",
    site_type: fixTypo(p.site_type),
    sediment_release: fixTypo(p.sediment_release),
    ecological_concern: fixTypo(p.ecological_concern),
    analysis: fixTypo(p.analysis),
    longitude: lon === "" ? "" : String(lon),
    latitude: lat === "" ? "" : String(lat),
  });
}

// ----------------------------------------------------------------- literature
// Field renames applied during migration (documented): the two Survey123
// truncated names get full spellings; entries drop their lit_ prefix.
const litFeatures = [...litGj.features].sort((a, b) => a.properties.objectid - b.properties.objectid);
const literature = [];
const litIdByGlobalId = new Map();
litFeatures.forEach((f, i) => {
  const p = trimAll(f.properties);
  let lon = "", lat = "";
  if (f.geometry && Array.isArray(f.geometry.coordinates)) [lon, lat] = f.geometry.coordinates;
  const lit_id = `L${String(i + 1).padStart(4, "0")}`;
  litIdByGlobalId.set(String(p.globalid).toLowerCase().replace(/[{}]/g, ""), lit_id);
  literature.push({
    lit_id,
    title: p.title ?? "",
    year: p.year ?? "",
    author: p.author ?? "",
    doi: p.doi ?? "",
    document_type: fixTypo(p.document_type),
    purpose: fixTypo(p.purpose),
    data_collection: fixTypo(p.data_collection),
    modeling: fixTypo(p.modeling),
    adaptive_management: fixTypo(p.adaptive_management),
    sediment_characteristic: fixTypo(p.sediment_characteristic),
    sediment_source: fixTypo(p.sediment_source),
    covered_topics_ecohydrology: p.covered_topics_ecohydrology ?? "",
    covered_topics_ecohydraulics: p.covered_topics_ecohydraulics ?? "",
    covered_topics_ecological_systems: p.covered_topics_ecological_syste ?? "",
    covered_topics_future_conditions: p.covered_topics_future_condition ?? "",
    risk_and_uncertainty: fixTypo(p.risk_and_uncertainty),
    special_cases: fixTypo(p.special_cases),
    geography: fixTypo(p.geography),
    sustainable_sediment_management: fixTypo(p.sustainable_sediment_management),
    land_use: fixTypo(p.land_use),
    channel_type: fixTypo(p.channel_type),
    site_names: p.site_names ?? "",
    longitude: lon === "" ? "" : String(lon),
    latitude: lat === "" ? "" : String(lat),
  });
});

// ------------------------------------------------------- literature entries
const entries = [];
const orphanParents = [];
const blankDocTypeSiteLinked = [];
const unmatchedSiteNames = new Map(); // raw name -> count (legacy: no site record)
let literatureTitleDiffers = 0;
const AMBIGUOUS = Symbol("ambiguous");
const matchTiers = { exact: 0, trimmed: 0, folded: 0 };
const siteIdByTrimmedName = new Map();
const siteIdByFoldedName = new Map();
for (const [raw, id] of siteIdByRawName) {
  for (const [map, key] of [[siteIdByTrimmedName, raw.trim()], [siteIdByFoldedName, raw.trim().toLowerCase()]]) {
    map.set(key, map.has(key) && map.get(key) !== id ? AMBIGUOUS : (map.get(key) ?? id));
  }
}

[...repRows].sort((a, b) => a.objectid - b.objectid).forEach((r0, i) => {
  const r = trimAll(r0);
  const parentKey = String(r.parentglobalid ?? "").toLowerCase().replace(/[{}]/g, "");
  const lit_id = litIdByGlobalId.get(parentKey) ?? "";
  if (!lit_id) orphanParents.push(`entry objectid=${r.objectid} parentglobalid=${r.parentglobalid}`);
  const parent = lit_id ? literature[Number(lit_id.slice(1)) - 1] : null;
  if (parent && (r.literature_title ?? "") !== "" && r.literature_title !== parent.title) literatureTitleDiffers++;
  if ((r.site_name ?? "") !== "" && (r.lit_document_type ?? "") === "") {
    blankDocTypeSiteLinked.push(`${r.site_name} — "${(r.lit_title ?? "").slice(0, 70)}"`);
  }
  // Resolve the explicit site link the way the current app did (ArcGIS string
  // equality is case- and trailing-space-tolerant): exact raw match first,
  // then trimmed, then case-insensitive — skipping any tier where the key is
  // ambiguous. Unmatched names are legacy records that never linked to a site
  // in the current app either — text kept for display; site_id stays blank.
  let site_id = "";
  const rawEntryName = r0.site_name ?? "";
  if (rawEntryName !== "") {
    site_id = siteIdByRawName.get(rawEntryName) ?? "";
    if (site_id) matchTiers.exact++;
    if (!site_id) {
      const t = siteIdByTrimmedName.get(rawEntryName.trim());
      if (t && t !== AMBIGUOUS) { site_id = t; matchTiers.trimmed++; }
    }
    if (!site_id) {
      const t = siteIdByFoldedName.get(rawEntryName.trim().toLowerCase());
      if (t && t !== AMBIGUOUS) { site_id = t; matchTiers.folded++; }
    }
    if (!site_id) unmatchedSiteNames.set(rawEntryName.trim(), (unmatchedSiteNames.get(rawEntryName.trim()) ?? 0) + 1);
  }
  entries.push({
    entry_id: `E${String(i + 1).padStart(5, "0")}`,
    lit_id,
    site_id,
    site_name: r.site_name ?? "",
    title: r.lit_title ?? "",
    year: r.lit_year ?? "",
    author: r.lit_author ?? "",
    doi: r.lit_doi ?? "",
    document_type: fixTypo(r.lit_document_type),
    purpose: fixTypo(r.lit_purpose),
    data_collection: fixTypo(r.lit_data_collection),
    modeling: fixTypo(r.lit_modeling),
    adaptive_management: fixTypo(r.lit_adaptive_management),
    sediment_characteristic: fixTypo(r.lit_sediment_characteristic),
    sediment_source: fixTypo(r.lit_sediment_source),
    covered_topics_ecohydrology: r.lit_covered_topics_ecohydrology ?? "",
    covered_topics_ecohydraulics: r.lit_covered_topics_ecohydraulics ?? "",
    covered_topics_ecological_systems: r.lit_covered_topics_ecological_syste ?? "",
    covered_topics_future_conditions: r.lit_covered_topics_future_condition ?? "",
    risk_and_uncertainty: fixTypo(r.lit_risk_and_uncertainty),
    special_cases: fixTypo(r.lit_special_cases),
    geography: fixTypo(r.lit_geography),
    sustainable_sediment_management: fixTypo(r.lit_sustainable_sediment_management),
    land_use: fixTypo(r.lit_land_use),
    channel_type: fixTypo(r.lit_channel_type),
  });
});

// -------------------------------------------------------------- NID snapshot
const NID_URL = "https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/NID_v1/FeatureServer/0/query";
const NID_FIELDS = [
  "NIDID", "NAME", "OTHER_NAMES", "RIVER_OR_STREAM", "CITY", "STATE",
  "PRIMARY_PURPOSE", "PURPOSES", "PRIMARY_DAM_TYPE", "YEAR_COMPLETED",
  "NID_HEIGHT", "DAM_LENGTH", "NID_STORAGE", "NORMAL_STORAGE", "SURFACE_AREA",
  "DRAINAGE_AREA", "MAX_DISCHARGE", "HAZARD_POTENTIAL", "CONDITION_ASSESSMENT",
  "OWNER_TYPES", "WEBSITE_URL",
];
const nidIds = [...new Set(sites.map((s) => s.nid_id).filter(Boolean))];
let nidRows = [];
const nidMisses = [];
if (nidIds.length) {
  const where = `NIDID IN (${nidIds.map((id) => `'${id.replaceAll("'", "''")}'`).join(",")})`;
  const body = new URLSearchParams({ where, outFields: NID_FIELDS.join(","), returnGeometry: "false", f: "json" });
  const res = await fetch(NID_URL, { method: "POST", body });
  const json = await res.json();
  if (json.error) throw new Error("NID query failed: " + JSON.stringify(json.error));
  const byId = new Map(json.features.map((f) => [String(f.attributes.NIDID), f.attributes]));
  for (const id of nidIds) {
    const a = byId.get(id);
    if (!a) { nidMisses.push(id); continue; }
    const row = { };
    for (const f of NID_FIELDS) row[f.toLowerCase()] = a[f] == null ? "" : String(a[f]);
    nidRows.push(row);
  }
  nidRows.sort((a, b) => a.nidid.localeCompare(b.nidid));
}

// ------------------------------------------------- migration acceptance gate
// Matching is case-insensitive to mirror ArcGIS hosted-layer LIKE semantics —
// verified against the live service (e.g. site_type carries both
// "Flood Control" and "Flood control"; the app treats them as one keyword).
const contains = (v, kw) => typeof v === "string" && v.toLowerCase().includes(kw.toLowerCase());
const c1 = sites.filter((s) => contains(s.sediment_release, "Dam Removal")).length;
const c2 = sites.filter((s) => contains(s.sediment_release, "Dam Removal") || contains(s.sediment_release, "Drawdown")).length;
const c3 = sites.filter((s) => (contains(s.sediment_release, "Dam Removal") || contains(s.sediment_release, "Drawdown")) && contains(s.site_type, "Flood Control")).length;
const siteLinked = entries.filter((e) => e.site_name !== "").length;
const generalLit = literature.filter((l) => l.site_names === "").length;

// Audit: keyword values that differ only by case within a field (across all
// tables). Left unchanged for strict parity; the app matches case-insensitively.
const KEYWORD_FIELDS = [
  [sites, ["site_type", "sediment_release", "ecological_concern", "analysis", "responsible_districtagency"]],
  [literature, ["document_type", "purpose", "data_collection", "modeling", "adaptive_management", "sediment_characteristic", "sediment_source", "risk_and_uncertainty", "special_cases", "geography", "sustainable_sediment_management", "land_use", "channel_type"]],
  [entries, ["document_type", "purpose", "data_collection", "modeling", "adaptive_management", "sediment_characteristic", "sediment_source", "risk_and_uncertainty", "special_cases", "geography", "sustainable_sediment_management", "land_use", "channel_type"]],
];
// Count known value corruptions (flagged, not fixed — outside the approved list).
const corruptionReport = [];
{
  const patterns = [[/maNot Applicablegement/gi, '"…maNot Applicablegement" (corrupted "management")'], [/Depostion/gi, '"Depostion" (misspelled "Deposition")']];
  for (const [table, name] of [[sites, "sites"], [literature, "literature"], [entries, "entries"]]) {
    for (const [re, label] of patterns) {
      let n = 0;
      for (const row of table) for (const v of Object.values(row)) if (typeof v === "string") n += (v.match(re) ?? []).length;
      if (n) corruptionReport.push(`${name}: ${label} — ${n} occurrence${n === 1 ? "" : "s"}`);
    }
  }
}

const caseVariantReport = [];
for (const [table, fields] of KEYWORD_FIELDS) {
  const label = table === sites ? "sites" : table === literature ? "literature" : "entries";
  for (const field of fields) {
    const byLower = new Map();
    for (const row of table) {
      for (const raw of String(row[field] ?? "").split(",")) {
        const v = raw.trim();
        if (!v) continue;
        const key = v.toLowerCase();
        if (!byLower.has(key)) byLower.set(key, new Map());
        const m = byLower.get(key);
        m.set(v, (m.get(v) ?? 0) + 1);
      }
    }
    for (const [, m] of byLower) {
      if (m.size > 1) {
        caseVariantReport.push(`${label}.${field}: ${[...m.entries()].map(([v, c]) => `"${v}" ×${c}`).join(" / ")}`);
      }
    }
  }
}

const linkedById = entries.filter((e) => e.site_id !== "").length;
const unmatchedTotal = [...unmatchedSiteNames.values()].reduce((a, b) => a + b, 0);
const checks = [
  ["sites", sites.length, 979],
  ["literature", literature.length, 466],
  ["entries", entries.length, 1410],
  ["site-linked entries (Site Literature view)", siteLinked, 1192],
  ["general literature (site_names blank)", generalLit, 214],
  ["baseline: Dam Removal", c1, 8],
  ["baseline: Dam Removal OR Drawdown", c2, 77],
  ["baseline: + Site Type Flood Control", c3, 42],
  ["orphan entries (no parent)", orphanParents.length, 0],
  ["unique site_ids", usedSiteIds.size, 979],
  ["entries: site_id-resolved + unmatched = site-named", linkedById + unmatchedTotal, siteLinked],
];
let failed = false;
for (const [name, got, want] of checks) {
  const ok = got === want;
  if (!ok) failed = true;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}: ${got} (expected ${want})`);
}
if (failed) { console.error("\nMigration acceptance gate FAILED — data/ not written."); process.exit(1); }

// ---------------------------------------------------------------- write data
await mkdir(OUT, { recursive: true });
await writeCsvFile(`${OUT}/sites.csv`, sites, Object.keys(sites[0]));
await writeCsvFile(`${OUT}/literature.csv`, literature, Object.keys(literature[0]));
await writeCsvFile(`${OUT}/literature_entries.csv`, entries, Object.keys(entries[0]));
if (nidRows.length) await writeCsvFile(`${OUT}/nid_snapshot.csv`, nidRows, Object.keys(nidRows[0]));

// -------------------------------------------------------------- migration log
const today = "2026-08-28";
const logMd = `# RESST Data Migration Log

Migrated ${today} from the verified ArcGIS extracts in \`RESST-migration/03-data/\`
(collected and count-verified the same day — see \`RESST-migration/MANIFEST.md\`).
This file documents every transformation between the ArcGIS-hosted data and the
authoritative CSVs in \`data/\`. Re-running \`node scripts/migrate.mjs\` rebuilds
\`data/\` from the archived extracts deterministically.

## Structure changes

- ArcGIS housekeeping fields dropped from all tables: \`objectid\`, \`globalid\`,
  \`parentglobalid\`, \`CreationDate\`, \`Creator\`, \`EditDate\`, \`Editor\`.
  Traceability: row order follows source \`objectid\`; the archived extracts
  retain the originals.
- Stable IDs added: \`site_id\` (slug of the verified-unique \`site_name\`),
  \`lit_id\` (\`L0001\`…), \`entry_id\` (\`E00001\`…).
- The Survey123 relationship (literature layer ↔ \`lit_repeat\` via
  \`parentglobalid\`) is resolved to the \`lit_id\` foreign key in
  \`literature_entries.csv\`. Orphans found: ${orphanParents.length}.
- **New \`site_id\` foreign key on entries.** The current app links literature to
  sites by matching the \`site_name\` string at runtime. That link is resolved
  once at migration (exact raw match: ${matchTiers.exact}; trimmed: ${matchTiers.trimmed};
  case-insensitive: ${matchTiers.folded}) and stored explicitly; \`site_name\`
  remains as display text. This also disambiguates the two distinct sites both
  named "Rio Grande" (Matamoros, Mexico = \`rio-grande\`; Bernalillo, NM =
  \`rio-grande-2\`) — the ${entries.filter((e) => e.site_name === "Rio Grande").length} entries naming "Rio Grande" resolved to the
  NM site, exactly as the current app's exact-string match behaved.
- \`literature_entries.csv\` drops the \`lit_\` field prefix (context is the table
  itself). \`literature_title\` (parent title copied into each entry by
  Survey123) is dropped — derivable via \`lit_id\`; rows where it differed from
  the parent title: ${literatureTitleDiffers}.
- Truncated Survey123 field names normalized in both literature tables:
  \`covered_topics_ecological_syste\` → \`covered_topics_ecological_systems\`,
  \`covered_topics_future_condition\` → \`covered_topics_future_conditions\`.
- Sites: geometry and the redundant Survey123 text \`longitude\`/\`latitude\`
  attributes are unified into single numeric \`longitude\`/\`latitude\` columns
  (blank = no location; site appears in tables only, matching current app
  behavior).

## Owner-approved data fixes (decision D7)

${log.length ? log.join("\n") : "- (none)"}
- **"Water Injection Dreding" typo** — investigation showed the typo lives in the
  Experience Builder *filter widget's predefined option list*, not in the data
  (data spells it correctly; the current app's option therefore matches zero
  records). Data values changed: ${typoFixCount}. The new app's ported filter
  config uses the corrected spelling, making the option functional
  (documented deliberate difference).

## Flagged for later owner attention (not changed)

### Newly discovered value corruptions (NOT in the approved fix list — awaiting approval)
${corruptionReport.length ? corruptionReport.map((n) => `- ${n}`).join("\n") : "- none"}

These look like a find/replace accident ("na" → "Not Applicable" applied inside
"management") plus a "Depostion"/"Deposition" misspelling. They are invisible in
the current app because its filter options are a hand-curated static list; they
would surface if options were ever derived from data. Recommend fixing in a
dedicated data PR after owner sign-off.

### ${noGeometry.length} sites without coordinates (table-only, never on the map)
${noGeometry.map((n) => `- ${n}`).join("\n")}

### ${unmatchedSiteNames.size} distinct legacy site_name values on entries matching no site (${unmatchedTotal} entries)
These entries count toward the "Site Literature" view but were never reachable
by selecting a site in the current app either (no site record matches the
text). Kept verbatim with blank \`site_id\`. Several look like typos of real
sites ("Tuttle Creek Dam" vs site "Tuttle Creek") or comma-split fragments of
descriptive locations ("NE to St. Louis", "MO") — fixing them by assigning the
right \`site_id\` (or creating missing site records) is an owner data decision.
${[...unmatchedSiteNames.entries()].map(([n, c]) => `- "${n}" ×${c}`).join("\n")}

### ${blankDocTypeSiteLinked.length} site-linked literature entries with blank document_type
${blankDocTypeSiteLinked.map((n) => `- ${n}`).join("\n")}

### Geometry vs Survey123 text-coordinate mismatches (>0.001°)
${coordMismatches.length ? coordMismatches.map((n) => `- ${n}`).join("\n") : "- none"}

### NID IDs with no match in the National Inventory of Dams service
${nidMisses.length ? nidMisses.map((n) => `- ${n}`).join("\n") : "- none"}

### Keyword case variants (left as-is; filters match case-insensitively, mirroring ArcGIS)
${caseVariantReport.length ? caseVariantReport.map((n) => `- ${n}`).join("\n") : "- none"}

## Acceptance gate (all must pass for this log to exist)

${checks.map(([n, g, w]) => `- ${n}: **${g}** (expected ${w})`).join("\n")}

## NID snapshot

\`nid_snapshot.csv\`: ${nidRows.length} records fetched ${today} from the public
NID_v1 service for the ${nidIds.length} distinct \`nid_id\` values present in
\`sites.csv\` (curated ${NID_FIELDS.length}-field subset).
`;
await writeFile(`${OUT}/MIGRATION-LOG.md`, logMd, "utf8");
console.log(`\nWrote ${OUT}/sites.csv (${sites.length}), literature.csv (${literature.length}), literature_entries.csv (${entries.length}), nid_snapshot.csv (${nidRows.length}), MIGRATION-LOG.md`);
