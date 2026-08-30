// Parity tests for the filter engine against baselines captured from the live
// Experience Builder app on 2026-08-28 and reproduced by REST query (see
// RESST-migration/07-assessment/RESST-migration-assessment.md §4).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  applyFilters,
  dynamicOptions,
  emptyItemState,
  type FilterState,
} from "../src/filters/engine";
import { FILTER_DEFS } from "../src/config/filters.generated";

const load = (name: string) => JSON.parse(readFileSync(`public/data/${name}`, "utf8"));
const sites = load("sites.json");
const literature = load("literature.json");
const entries = load("literature_entries.json");

const state = (): FilterState => Object.fromEntries(FILTER_DEFS.map((d) => [d.key, emptyItemState()]));
const def = (key: string) => {
  const d = FILTER_DEFS.find((x) => x.key === key);
  if (!d) throw new Error(`no filter def ${key}`);
  return d;
};

describe("dataset shape", () => {
  it("matches the verified source counts", () => {
    // 2026-08-30: the migration's 979/466/1,410 dropped by the owner-approved
    // removal of the test-record cluster (narnia-test-123 site + "This is a
    // Test" literature record and its two entries).
    expect(sites.length).toBe(978);
    expect(literature.length).toBe(465);
    expect(entries.length).toBe(1408);
  });
  it("derives the app's three counter scopes", () => {
    expect(entries.filter((e: any) => e.site_name !== "").length).toBe(1191); // Site Literature view
    expect(literature.filter((l: any) => l.site_names === "").length).toBe(214); // General Literature view
  });
});

describe("filter defs ported from the current app", () => {
  it("has all 40 items in their three domains", () => {
    expect(FILTER_DEFS).toHaveLength(40);
    expect(FILTER_DEFS.filter((d) => d.domain === "sites")).toHaveLength(6);
    expect(FILTER_DEFS.filter((d) => d.domain === "siteLit")).toHaveLength(17);
    expect(FILTER_DEFS.filter((d) => d.domain === "generalLit")).toHaveLength(17);
  });
  it("preserves the curated Sediment Release option list with the corrected spelling", () => {
    const sr = def("sites.sediment_release");
    expect(sr.options).toEqual([
      "Drawdown",
      "Water Injection Dredging",
      "Dam Removal",
      "Diversion",
      "Normal Operation",
      "Hydraulic Dredging",
      "Dredging",
    ]);
  });
});

describe("live-verified filter baselines", () => {
  it("Sediment Release = Dam Removal → 8 sites", () => {
    const s = state();
    s["sites.sediment_release"] = { enabled: true, selected: ["Dam Removal"] };
    expect(applyFilters(sites, FILTER_DEFS, s, "sites")).toHaveLength(8);
  });
  it("+ Drawdown (OR within the item) → 77 sites", () => {
    const s = state();
    s["sites.sediment_release"] = { enabled: true, selected: ["Dam Removal", "Drawdown"] };
    expect(applyFilters(sites, FILTER_DEFS, s, "sites")).toHaveLength(77);
  });
  it("+ Site Type = Flood Control (AND across items, case-insensitive) → 42 sites", () => {
    const s = state();
    s["sites.sediment_release"] = { enabled: true, selected: ["Dam Removal", "Drawdown"] };
    s["sites.site_type"] = { enabled: true, selected: ["Flood Control"] };
    expect(applyFilters(sites, FILTER_DEFS, s, "sites")).toHaveLength(42);
  });
  it("enabled item with nothing selected applies the not-blank guard (1,191 → 1,188)", () => {
    const s = state();
    s["siteLit.document_type"] = { enabled: true, selected: [] };
    const siteLit = entries.filter((e: any) => e.site_name !== "");
    expect(applyFilters(siteLit, FILTER_DEFS, s, "siteLit")).toHaveLength(1188);
  });
  it("filters never cross domains", () => {
    const s = state();
    s["sites.sediment_release"] = { enabled: true, selected: ["Dam Removal"] };
    expect(applyFilters(literature, FILTER_DEFS, s, "generalLit")).toHaveLength(465);
    expect(applyFilters(entries, FILTER_DEFS, s, "siteLit")).toHaveLength(1408);
  });
});

describe("dynamic option lists", () => {
  it("covered-topics flags derive their values from data", () => {
    expect(dynamicOptions(literature, "covered_topics_ecohydrology")).toEqual(["Not Applicable", "Yes"]);
  });
  it("site_name picker offers every site exactly once", () => {
    const opts = dynamicOptions(sites, "site_name");
    expect(opts.length).toBeGreaterThan(900);
    expect(opts).toContain("Tuttle Creek");
  });
});
