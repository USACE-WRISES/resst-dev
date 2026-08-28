// Minimal, correct CSV read/write used by all RESST data scripts.
// Dialect: RFC 4180 — comma-separated, double-quote quoting, quotes escaped by
// doubling, CRLF or LF accepted. Files are written UTF-8 with BOM so Excel
// opens them correctly; the parser strips a leading BOM.

export function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      rows.push(row); row = [];
    } else field += c;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  // Drop a trailing fully-empty row produced by a final newline.
  if (rows.length && rows[rows.length - 1].every((f) => f === "")) rows.pop();
  const header = rows.shift() ?? [];
  return rows.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

function encodeField(v) {
  const s = v == null ? "" : String(v);
  return /[",\r\n]/.test(s) ? '"' + s.replaceAll('"', '""') + '"' : s;
}

export function toCsv(records, columns) {
  const lines = [columns.map(encodeField).join(",")];
  for (const rec of records) lines.push(columns.map((c) => encodeField(rec[c])).join(","));
  return "﻿" + lines.join("\r\n") + "\r\n";
}

export async function readCsvFile(path) {
  const { readFile } = await import("node:fs/promises");
  return parseCsv(await readFile(path, "utf8"));
}

export async function writeCsvFile(path, records, columns) {
  const { writeFile } = await import("node:fs/promises");
  await writeFile(path, toCsv(records, columns), "utf8");
}
