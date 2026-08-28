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
