// Client-side exports of the CURRENT (filtered + searched) records: CSV,
// GeoJSON, and zipped Shapefile (decision D3). Full-dataset downloads in
// every GIS format are pre-built by CI and offered on the Download Data
// panel; these exporters cover "what I'm looking at right now".

import { zip } from "@mapbox/shp-write";
import type { FeatureCollection } from "geojson";

/** RFC 4180 CSV with UTF-8 BOM (Excel-friendly) — the browser twin of the
 *  serializer in scripts/lib/csv.mjs. */
export function toCsv(records: Array<Record<string, unknown>>, columns: Array<{ field: string; label: string }>): string {
  const enc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\r\n]/.test(s) ? '"' + s.replaceAll('"', '""') + '"' : s;
  };
  const lines = [columns.map((c) => enc(c.label)).join(",")];
  for (const r of records) lines.push(columns.map((c) => enc(r[c.field])).join(","));
  return "﻿" + lines.join("\r\n") + "\r\n";
}

export function toGeoJSON(records: Array<Record<string, unknown>>, columns: Array<{ field: string; label: string }>): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: records
      .filter((r) => typeof r.longitude === "number" && typeof r.latitude === "number")
      .map((r) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [r.longitude as number, r.latitude as number] },
        properties: Object.fromEntries(columns.map((c) => [c.field, r[c.field] ?? null])),
      })),
  };
}

export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export const stamp = () => new Date().toISOString().slice(0, 10);

export function exportCsv(records: Array<Record<string, unknown>>, columns: Array<{ field: string; label: string }>, name: string): void {
  saveBlob(new Blob([toCsv(records, columns)], { type: "text/csv;charset=utf-8" }), `resst-${name}-${stamp()}.csv`);
}

export function exportGeoJson(records: Array<Record<string, unknown>>, columns: Array<{ field: string; label: string }>, name: string): void {
  const fc = toGeoJSON(records, columns);
  saveBlob(new Blob([JSON.stringify(fc)], { type: "application/geo+json" }), `resst-${name}-${stamp()}.geojson`);
}

/** Shapefile caveat handled here: DBF field names are 10 chars max, so
 *  shp-write truncates — acceptable for a quick working export; the CI-built
 *  full downloads carry the faithful schema. */
export async function exportShapefile(
  records: Array<Record<string, unknown>>,
  columns: Array<{ field: string; label: string }>,
  name: string,
): Promise<void> {
  const fc = toGeoJSON(records, columns);
  const blob = (await zip(fc, {
    outputType: "blob",
    compression: "DEFLATE",
    types: { point: `resst_${name}` },
  })) as Blob;
  saveBlob(blob, `resst-${name}-${stamp()}-shapefile.zip`);
}
