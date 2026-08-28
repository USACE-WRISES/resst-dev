// Builds the app's runtime data from the authoritative CSVs:
//   data/*.csv  →  public/data/*.json + public/data/manifest.json
// Run after any data edit (CI runs it on every build). Deterministic given the
// same inputs, except the manifest's generated-at stamp.
//
//   node scripts/build-data.mjs

import { readCsvFile } from "./lib/csv.mjs";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const OUT = "public/data";
await mkdir(OUT, { recursive: true });

const numify = (row, fields) => {
  const out = { ...row };
  for (const f of fields) out[f] = row[f] === "" || row[f] == null ? null : Number(row[f]);
  return out;
};

const sites = (await readCsvFile("data/sites.csv")).map((r) => numify(r, ["longitude", "latitude"]));
const literature = (await readCsvFile("data/literature.csv")).map((r) => numify(r, ["longitude", "latitude"]));
const entries = await readCsvFile("data/literature_entries.csv");
const nid = await readCsvFile("data/nid_snapshot.csv");

const files = { "sites.json": sites, "literature.json": literature, "literature_entries.json": entries, "nid.json": nid };
const manifest = { generated: new Date().toISOString(), counts: {}, sha256: {} };
for (const [name, rows] of Object.entries(files)) {
  const json = JSON.stringify(rows);
  await writeFile(`${OUT}/${name}`, json, "utf8");
  manifest.counts[name] = rows.length;
  manifest.sha256[name] = createHash("sha256").update(json).digest("hex").slice(0, 16);
}
manifest.counts.site_linked_entries = entries.filter((e) => e.site_name).length;
manifest.counts.general_literature = literature.filter((l) => !l.site_names).length;
// Data date = last commit touching data/ would be ideal; the CSV content hash
// changing is what matters. The UI shows manifest.generated as "data built".
await writeFile(`${OUT}/manifest.json`, JSON.stringify(manifest, null, 2), "utf8");
console.log("Wrote", Object.keys(files).join(", "), "+ manifest.json:", JSON.stringify(manifest.counts));
