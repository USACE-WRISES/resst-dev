// Summarizes what a data PR changes: per-table counts, added/removed/modified
// records by stable ID. Used by the data-diff workflow to comment on PRs.
//
//   node scripts/data-diff.mjs <base-dir> <head-dir>
// where each dir contains a data/ folder. Prints markdown to stdout.

import { readFile } from "node:fs/promises";
import { parseCsv } from "./lib/csv.mjs";

const [baseDir, headDir] = process.argv.slice(2);
if (!baseDir || !headDir) {
  console.error("usage: node scripts/data-diff.mjs <base-dir> <head-dir>");
  process.exit(2);
}

const TABLES = [
  ["sites.csv", "site_id", "site_name"],
  ["literature.csv", "lit_id", "title"],
  ["literature_entries.csv", "entry_id", "title"],
  ["nid_snapshot.csv", "nidid", "name"],
];

const loadTable = async (dir, file) => {
  try {
    return parseCsv(await readFile(`${dir}/data/${file}`, "utf8"));
  } catch {
    return null;
  }
};

const lines = ["<!-- resst-data-diff -->", "## Data change summary", ""];
lines.push("| Table | Base | Head | Added | Removed | Modified |", "|---|---|---|---|---|---|");
const details = [];

for (const [file, idCol, labelCol] of TABLES) {
  const base = await loadTable(baseDir, file);
  const head = await loadTable(headDir, file);
  if (!base && !head) continue;
  const bMap = new Map((base ?? []).map((r) => [r[idCol], r]));
  const hMap = new Map((head ?? []).map((r) => [r[idCol], r]));
  const added = [...hMap.keys()].filter((k) => !bMap.has(k));
  const removed = [...bMap.keys()].filter((k) => !hMap.has(k));
  const modified = [...hMap.keys()].filter((k) => {
    const b = bMap.get(k);
    return b && JSON.stringify(b) !== JSON.stringify(hMap.get(k));
  });
  lines.push(
    `| ${file} | ${base?.length ?? "—"} | ${head?.length ?? "—"} | ${added.length} | ${removed.length} | ${modified.length} |`,
  );
  const sample = (ids, map, verb) =>
    ids.slice(0, 5).map((k) => `- ${verb} \`${k}\` — ${String(map.get(k)?.[labelCol] ?? "").slice(0, 80)}`);
  const sect = [...sample(added, hMap, "added"), ...sample(removed, bMap, "removed"), ...sample(modified, hMap, "modified")];
  if (sect.length) {
    details.push(`<details><summary>${file}</summary>\n`);
    details.push(...sect);
    const more = added.length + removed.length + modified.length - Math.min(added.length, 5) - Math.min(removed.length, 5) - Math.min(modified.length, 5);
    if (more > 0) details.push(`- … and ${more} more`);
    details.push("\n</details>");
  }
}

lines.push("", ...details, "", "_Validation (`npm run validate`) must pass in CI before merge._");
console.log(lines.join("\n"));
