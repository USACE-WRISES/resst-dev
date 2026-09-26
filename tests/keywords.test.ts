// Keyword tallies shared by the Dashboard and the Library
// (src/lib/keywords.ts): case variants merge under the most frequent
// spelling, every spelling of "not applicable" is absence, and the chart's
// "Other" slice keeps its share while listing each record once.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { groupOther, isNaToken, keywordTokens, tallyKeyword, tallyRecords } from "../src/lib/keywords";

const sites = JSON.parse(readFileSync("public/data/sites.json", "utf8")) as Array<Record<string, string>>;

describe("keywordTokens", () => {
  it("drops every spelling of not applicable and blanks", () => {
    expect(keywordTokens("Dredging, Not Applicable, NA, n/a, Not_Applicable, , Drawdown")).toEqual(["Dredging", "Drawdown"]);
    expect(isNaToken(" N/A ")).toBe(true);
    expect(isNaToken("Navigation")).toBe(false);
  });
});

describe("tallyRecords", () => {
  const records = [
    { k: "Water supply,Hydropower" },
    { k: "Water Supply" },
    { k: "water supply" },
    { k: "Not Applicable" },
    { k: "" },
    { k: "Hydropower,hydropower" },
  ];
  it("merges case variants, labels with the most frequent spelling, and counts records once", () => {
    const t = tallyRecords(records, (r) => keywordTokens(r.k));
    expect(t.total).toBe(6);
    expect(t.withValue).toBe(4); // NA and blank are absence; the duplicate-keyword record counts once
    expect(t.multi).toBe(1);
    expect(t.tallies.map((x) => [x.key, x.label, x.count])).toEqual([
      ["water supply", "Water supply", 3],
      ["hydropower", "Hydropower", 2],
    ]);
    expect(t.tallies[0].items).toHaveLength(3);
  });
});

describe("tallyKeyword on the real sites", () => {
  it("reproduces the documented sediment release methods", () => {
    const t = tallyKeyword(sites, "sediment_release");
    expect(t.total).toBe(978);
    expect(t.withValue).toBe(154); // 824 sites carry only "Not Applicable"
    const by = Object.fromEntries(t.tallies.map((x) => [x.label, x.count]));
    expect(by["Diversion"]).toBe(77);
    expect(by["Dam Removal"]).toBe(8); // the parity baseline (exact tokens agree with the substring filter here)
    expect(by["Dredging"]).toBe(16); // exact: "Hydraulic Dredging" is its own keyword
  });
  it("merges site-type case variants under the common spelling", () => {
    const t = tallyKeyword(sites, "site_type");
    const ws = t.tallies.find((x) => x.key === "water supply")!;
    expect(ws.label).toBe("Water supply");
    expect(ws.count).toBeGreaterThan(200);
    expect(t.tallies.filter((x) => x.key === "water supply")).toHaveLength(1);
  });
});

describe("groupOther", () => {
  const tallies = [5, 4, 3, 2, 1].map((count, i) => ({
    key: `k${i}`,
    label: `K${i}`,
    count,
    items: Array.from({ length: count }, (_, j) => ({ id: `${i}-${j}` })),
  }));
  it("leaves a list alone when Other would hold one keyword", () => {
    expect(groupOther(tallies, 4, (x) => x.id)).toHaveLength(5);
  });
  it("merges the tail into one slice that keeps the mentions and dedupes the records", () => {
    const shared = { id: "shared" };
    tallies[3].items[0] = shared;
    tallies[4].items[0] = shared;
    const out = groupOther(tallies, 3, (x) => x.id);
    expect(out).toHaveLength(4);
    expect(out[3]).toMatchObject({ key: "other", label: "Other (2 keywords)", count: 3 });
    expect(out[3].items).toHaveLength(2);
  });
});
