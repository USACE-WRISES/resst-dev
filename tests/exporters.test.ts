// Export correctness: CSV shape, GeoJSON geometry handling, Shapefile zip.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { toCsv, toGeoJSON } from "../src/utils/exporters";
import { zip } from "@mapbox/shp-write";
import { TABS } from "../src/config/tabs";

const sites = JSON.parse(readFileSync("public/data/sites.json", "utf8"));
const sitesTab = TABS.find((t) => t.id === "sites")!;

describe("toCsv", () => {
  it("writes header labels + all rows, quoting commas", () => {
    const csv = toCsv(sites, sitesTab.columns);
    const lines = csv.trimEnd().split("\r\n");
    expect(lines).toHaveLength(1 + 978);
    expect(lines[0]).toContain("Site Name");
    // Multi-value keyword cells (contain commas) must be quoted.
    const tuttle = lines.find((l) => l.includes("Tuttle Creek"))!;
    expect(tuttle).toContain('"Flood control,Water supply"');
  });
});

describe("toGeoJSON", () => {
  it("exports one point per located site and skips coordinate-less sites", () => {
    const fc = toGeoJSON(sites, sitesTab.columns);
    expect(fc.features).toHaveLength(978 - 15); // 15 sites have no geometry
    const f = fc.features.find((x) => x.properties?.site_name === "Tuttle Creek")!;
    expect(f.geometry.type).toBe("Point");
    expect(f.properties?.nid_id).toBe("KS00012");
  });
});

describe("shapefile zip", () => {
  it("produces a ZIP archive from the sites", async () => {
    const fc = toGeoJSON(sites.slice(0, 25), sitesTab.columns);
    const buf = (await zip(fc, { outputType: "arraybuffer", compression: "STORE", types: { point: "resst_sites" } })) as ArrayBuffer;
    const bytes = new Uint8Array(buf);
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe("PK"); // zip magic
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });
});
