// Validates the authoritative CSVs in data/. Run before committing data edits
// and in CI on every pull request. Errors (exit 1) block; warnings inform.
//
//   node scripts/validate.mjs

import { readCsvFile } from "./lib/csv.mjs";
import { readFile } from "node:fs/promises";

const errors = [];
const warnings = [];
const err = (s) => errors.push(s);
const warn = (s) => warnings.push(s);

const sites = await readCsvFile("data/sites.csv");
const literature = await readCsvFile("data/literature.csv");
const entries = await readCsvFile("data/literature_entries.csv");
const nid = await readCsvFile("data/nid_snapshot.csv");

// ------------------------------------------------------------------ structure
function requireColumns(name, rows, cols) {
  const have = new Set(Object.keys(rows[0] ?? {}));
  for (const c of cols) if (!have.has(c)) err(`${name}: missing required column "${c}"`);
}
requireColumns("sites.csv", sites, ["site_id", "site_name", "nid_id", "site_type", "sediment_release", "ecological_concern", "analysis", "longitude", "latitude"]);
requireColumns("literature.csv", literature, ["lit_id", "title", "site_names", "longitude", "latitude"]);
requireColumns("literature_entries.csv", entries, ["entry_id", "lit_id", "site_id", "site_name", "title", "document_type"]);
requireColumns("nid_snapshot.csv", nid, ["nidid", "name"]);

// ------------------------------------------------------------------ uniqueness
function unique(name, rows, col) {
  const seen = new Map();
  rows.forEach((r, i) => {
    const v = r[col];
    if (!v) err(`${name} row ${i + 2}: blank ${col}`);
    else if (seen.has(v)) err(`${name}: duplicate ${col} "${v}" (rows ${seen.get(v)} and ${i + 2})`);
    else seen.set(v, i + 2);
  });
}
unique("sites.csv", sites, "site_id");
unique("literature.csv", literature, "lit_id");
// site_id is the join key; duplicate display names are legal but ambiguous for
// readers, so they warn (two distinct sites are genuinely both named Rio Grande).
{
  const byName = new Map();
  sites.forEach((s) => byName.set(s.site_name, (byName.get(s.site_name) ?? 0) + 1));
  for (const [name, n] of byName) if (n > 1) warn(`sites.csv: ${n} sites share the display name "${name}" (distinct site_ids — consider clarifying names)`);
  sites.forEach((s, i) => { if (!s.site_name) err(`sites.csv row ${i + 2}: blank site_name`); });
}
unique("literature_entries.csv", entries, "entry_id");
unique("nid_snapshot.csv", nid, "nidid");

// ---------------------------------------------------------------- coordinates
function checkCoords(name, rows) {
  rows.forEach((r, i) => {
    const lon = r.longitude ?? "", lat = r.latitude ?? "";
    if ((lon === "") !== (lat === "")) err(`${name} row ${i + 2} (${r.site_name ?? r.title}): longitude/latitude must both be set or both be blank`);
    if (lon !== "") {
      const nlon = Number(lon), nlat = Number(lat);
      if (!Number.isFinite(nlon) || !Number.isFinite(nlat)) err(`${name} row ${i + 2}: non-numeric coordinates "${lon}", "${lat}"`);
      else {
        if (Math.abs(nlat) > 90) err(`${name} row ${i + 2} (${r.site_name ?? r.title}): latitude ${nlat} out of range — lon/lat swapped?`);
        if (Math.abs(nlon) > 180) err(`${name} row ${i + 2} (${r.site_name ?? r.title}): longitude ${nlon} out of range`);
      }
    }
  });
}
checkCoords("sites.csv", sites);
checkCoords("literature.csv", literature);

// --------------------------------------------------------- referential checks
const siteNames = new Set(sites.map((s) => s.site_name));
const siteIds = new Set(sites.map((s) => s.site_id));
const litIds = new Set(literature.map((l) => l.lit_id));
const nidIds = new Set(nid.map((n) => n.nidid));
const legacyUnlinked = new Map(); // display text with no site_id (known legacy pattern)
entries.forEach((e, i) => {
  if (!e.lit_id || !litIds.has(e.lit_id)) err(`literature_entries.csv row ${i + 2}: lit_id "${e.lit_id}" not found in literature.csv`);
  if (e.site_id) {
    if (!siteIds.has(e.site_id)) err(`literature_entries.csv row ${i + 2}: site_id "${e.site_id}" not found in sites.csv`);
  } else if (e.site_name) {
    if (siteNames.has(e.site_name)) err(`literature_entries.csv row ${i + 2}: site_name "${e.site_name}" matches a site but site_id is blank — set site_id so the entry links`);
    else legacyUnlinked.set(e.site_name, (legacyUnlinked.get(e.site_name) ?? 0) + 1);
  }
});
if (legacyUnlinked.size) {
  const total = [...legacyUnlinked.values()].reduce((a, b) => a + b, 0);
  warn(`${total} entries carry a site_name matching no site (legacy, unlinked — see data/MIGRATION-LOG.md): ${[...legacyUnlinked.keys()].slice(0, 5).map((n) => `"${n}"`).join(", ")}${legacyUnlinked.size > 5 ? ` … +${legacyUnlinked.size - 5} more` : ""}`);
}
const nidMisses = [...new Set(sites.map((s) => s.nid_id).filter((v) => v && !nidIds.has(v)))];
if (nidMisses.length) warn(`sites.nid_id values with no nid_snapshot.csv record (NID panel will be empty for them): ${nidMisses.join(", ")}`);

// literature.site_names may reference multiple sites, comma-separated.
literature.forEach((l, i) => {
  if (!l.site_names) return;
  for (const raw of l.site_names.split(",")) {
    const v = raw.trim();
    if (v && !siteNames.has(v)) warn(`literature.csv row ${i + 2}: site_names entry "${v}" not found in sites.csv`);
  }
});

// ------------------------------------------- sediment crosswalk + outputs
// The crosswalk is curated + tracked; the public/sediment files are committed
// pipeline outputs. Both exist from the sedimentation expansion onward — the
// checks skip quietly if the files are absent (pre-expansion branches).
try {
  const xwalk = await readCsvFile("data/site_resnet_crosswalk.csv");
  requireColumns("site_resnet_crosswalk.csv", xwalk, ["site_id", "short_id", "nid", "method", "confidence", "status", "notes"]);
  unique("site_resnet_crosswalk.csv", xwalk, "site_id");
  const METHODS = new Set(["nid", "spatial_name", "manual"]);
  const CONF = new Set(["high", "medium", "low"]);
  const STATUS = new Set(["auto", "confirmed", "rejected"]);
  xwalk.forEach((r, i) => {
    const at = `site_resnet_crosswalk.csv row ${i + 2} (${r.site_id})`;
    if (!METHODS.has(r.method)) err(`${at}: method "${r.method}" not one of ${[...METHODS].join("/")}`);
    if (!CONF.has(r.confidence)) err(`${at}: confidence "${r.confidence}" not one of ${[...CONF].join("/")}`);
    if (!STATUS.has(r.status)) err(`${at}: status "${r.status}" not one of ${[...STATUS].join("/")}`);
    if (!siteIds.has(r.site_id)) err(`${at}: site_id not found in sites.csv`);
    if (r.status !== "rejected" && !/^-?\d+$/.test(String(r.short_id))) err(`${at}: short_id "${r.short_id}" must be an integer for non-rejected rows`);
  });
  const sharedDams = new Map();
  for (const r of xwalk) if (r.status !== "rejected" && r.short_id !== "") sharedDams.set(r.short_id, (sharedDams.get(r.short_id) ?? 0) + 1);
  const multi = [...sharedDams.entries()].filter(([, c]) => c > 1);
  if (multi.length) warn(`site_resnet_crosswalk.csv: ${multi.length} dams matched by more than one site (legal — verify intent): ${multi.slice(0, 5).map(([id, c]) => `${id}×${c}`).join(", ")}`);
} catch (e) {
  if (e?.code === "ENOENT") warn("data/site_resnet_crosswalk.csv not found — sediment crosswalk checks skipped");
  else throw e;
}
try {
  const surveySites = await readCsvFile("data/rattes_survey_sites.csv");
  requireColumns("rattes_survey_sites.csv", surveySites, ["short_id", "dam_name", "survey_yr1", "survey_yr2"]);
  unique("rattes_survey_sites.csv", surveySites, "short_id");
  // A pinned distillation of RATTES Supplementary Data 1 — the count is a fact
  // of that publication, so drift means the file was edited or re-derived wrong.
  if (surveySites.length !== 924)
    err(`rattes_survey_sites.csv: ${surveySites.length} rows, expected the 924 qualifying repeat-survey reservoirs`);
} catch (e) {
  if (e?.code === "ENOENT") warn("data/rattes_survey_sites.csv not found — RATTES evidence-class checks skipped");
  else throw e;
}
try {
  const { createHash } = await import("node:crypto");
  const sedManifest = JSON.parse(await readFile("public/sediment/manifest.json", "utf8"));
  for (const [rel, expected] of Object.entries(sedManifest.sha256)) {
    if (rel === "manifest.json") continue;
    const actual = createHash("sha256").update(await readFile(`public/sediment/${rel}`)).digest("hex").slice(0, 16);
    if (actual !== expected) err(`public/sediment/${rel}: content hash ${actual} != manifest ${expected} — generated file edited by hand or manifest stale (rerun build:sediment)`);
  }
} catch (e) {
  if (e?.code === "ENOENT") warn("public/sediment/manifest.json not found — sediment output checks skipped");
  else throw e;
}

// -------------------------------------------------- keyword vocabulary drift
// New keyword tokens that no filter option covers are legal but usually mean
// the filter config in src/config should gain an option (or the value has a
// typo). Reported as warnings, grouped.
try {
  const cfg = JSON.parse(await readFile("RESST-migration/07-assessment/filter-config-extracted.json", "utf8"));
  const known = new Map(); // field (unprefixed) -> Set(lowercased values)
  for (const w of Object.values(cfg)) {
    for (const item of w.items) {
      for (const c of item.clauses) {
        if (!c.values) continue;
        const field = c.field.replace(/^lit_/, "").replace("covered_topics_ecological_syste", "covered_topics_ecological_systems").replace("covered_topics_future_condition", "covered_topics_future_conditions");
        if (!known.has(field)) known.set(field, new Set());
        for (const v of c.values) known.get(field).add(String(v).toLowerCase().replace("water injection dreding", "water injection dredging"));
      }
    }
  }
  const drift = new Map();
  for (const [table, rows] of [["sites", sites], ["literature", literature], ["entries", entries]]) {
    for (const row of rows) {
      for (const [field, vocab] of known) {
        if (!(field in row)) continue;
        for (const raw of String(row[field]).split(",")) {
          const v = raw.trim();
          if (v && !vocab.has(v.toLowerCase())) {
            const key = `${table}.${field}`;
            if (!drift.has(key)) drift.set(key, new Set());
            drift.get(key).add(v);
          }
        }
      }
    }
  }
  for (const [key, vals] of drift) {
    const list = [...vals];
    warn(`keyword values outside the current filter options — ${key}: ${list.slice(0, 6).map((v) => `"${v}"`).join(", ")}${list.length > 6 ? ` … +${list.length - 6} more` : ""}`);
  }
} catch { warn("filter-config-extracted.json not found — vocabulary drift check skipped"); }

// -------------------------------------------------------------------- report
console.log(`sites: ${sites.length} · literature: ${literature.length} · entries: ${entries.length} · nid: ${nid.length}`);
console.log(`site-linked entries: ${entries.filter((e) => e.site_name).length} · general literature: ${literature.filter((l) => !l.site_names).length}`);
for (const w of warnings) console.log("WARN  " + w);
for (const e of errors) console.error("ERROR " + e);
console.log(errors.length ? `\n${errors.length} error(s) — fix before committing.` : `\nValidation passed (${warnings.length} warning(s)).`);
process.exit(errors.length ? 1 : 0);
