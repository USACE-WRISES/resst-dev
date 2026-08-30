// Screening engine (src/sediment/screen.ts): the JS predicate and the
// MapLibre filter serializer are mirrored implementations — these tests hold
// them together and pin the unknown-value semantics (a reservoir with no
// original capacity can match neither a "high" nor a "low" loss criterion).
import { describe, expect, it } from "vitest";
import { EMPTY_SCREENING, GAP_PRESETS, buildScreenFilter, screenCore, type ScreeningState } from "../src/sediment/screen";
import { decodeCore } from "../src/sediment/decode";

// mouth · documented terminal dam 17% lost w/ surveys · undocumented 50% lost · no-storage row
const INVENTORY = {
  _meta: { trajSpan: 4, trajChunks: 1 },
  n: 4,
  dicts: { state: ["Kansas", "Oregon"], owner: ["Federal"], purpose: ["Flood Control"], storSrc: ["NID"] },
  cols: {
    id: [-5, 10, 20, 30],
    name: ["Big River", "Doc Dam", "Gap Dam", "Empty Dam"],
    nid: ["MOUTH_BigR", "KS00001", "KS00002", "OR00001"],
    lon: [-96.1, -96.2, -96.3, -120],
    lat: [39.1, 39.2, 39.3, 44],
    state: [-1, 0, 0, 1],
    owner: [-1, 0, 0, 0],
    purpose: [-1, 0, 0, 0],
    storSrc: [-1, 0, 0, 0],
    yrc: [0, 1950, 1960, 1970],
    flags: [1, 2 | 16 | 512, 512, 512 | 64], // mouth · terminal+surveys+traj · traj · traj+no-storage
    to: [-1, 0, 1, -1],
    deltaTag: [0, 0, 0, 0],
    maxStor: [null, 1.2e9, 6e8, 1e6],
    da: [1000, 900, 700, 10],
    sca: [800, 700, 500, 10],
    capOrig: [null, 1.2e9, 6e8, null],
    cap2025: [null, 1.0e9, 3e8, 0],
    cap2050: [null, 8.5e8, 2e8, 0],
    sed2015: [null, 1.7e8, 2.6e8, 0],
    sed2025: [null, 2.0e8, 3.0e8, 0],
    sed2050: [null, 3.5e8, 4.0e8, 0],
    evd: [0, 0, 0, 0],
  },
};
const core = decodeCore(INVENTORY);
const DOCUMENTED = new Set([10]);
const s = (partial: Partial<ScreeningState>): ScreeningState => ({ ...EMPTY_SCREENING, active: true, ...partial });

describe("matchesRow / screenCore", () => {
  it("counts dams only (mouths excluded) and matches everything when unconstrained", () => {
    const all = screenCore(core, DOCUMENTED, s({}));
    expect(all.total).toBe(3);
    expect(all.matches).toBe(3);
  });

  it("pct-lost thresholds exclude unknown-capacity rows in BOTH directions", () => {
    expect(screenCore(core, DOCUMENTED, s({ pctLost2025Min: 25 })).rows).toEqual([2]); // Gap Dam 50%
    const low = screenCore(core, DOCUMENTED, s({ pctLost2025Max: 25 }));
    expect(low.rows).toEqual([1]); // Doc Dam 17% — Empty Dam (unknown) must NOT read as "low"
  });

  it("documented / undocumented routes on the crosswalk set", () => {
    expect(screenCore(core, DOCUMENTED, s({ documented: "documented" })).rows).toEqual([1]);
    expect(screenCore(core, DOCUMENTED, s({ documented: "undocumented" })).rows).toEqual([2, 3]);
  });

  it("flag and dictionary criteria compose (AND)", () => {
    expect(screenCore(core, DOCUMENTED, s({ terminalOnly: true })).rows).toEqual([1]);
    expect(screenCore(core, DOCUMENTED, s({ surveyedOnly: true })).rows).toEqual([1]);
    expect(screenCore(core, DOCUMENTED, s({ state: 1 })).rows).toEqual([3]);
    expect(screenCore(core, DOCUMENTED, s({ state: 0, pctLost2025Min: 25 })).rows).toEqual([2]);
    expect(screenCore(core, DOCUMENTED, s({ storageMinAcFt: 100000 })).rows).toEqual([1, 2]);
  });

  it("gap presets reproduce the four quadrants", () => {
    const byKey = Object.fromEntries(GAP_PRESETS.map((p) => [p.key, p.apply]));
    expect(screenCore(core, DOCUMENTED, s(byKey["managed-high"])).rows).toEqual([]); // Doc Dam is only 17%
    expect(screenCore(core, DOCUMENTED, s(byKey["managed-low"])).rows).toEqual([1]);
    expect(screenCore(core, DOCUMENTED, s(byKey["gap-high"])).rows).toEqual([2]);
    expect(screenCore(core, DOCUMENTED, s(byKey["gap-low"])).rows).toEqual([]);
    for (const p of GAP_PRESETS) expect(p.hint).not.toMatch(/needs? intervention/i);
  });
});

describe("buildScreenFilter", () => {
  it("is null when inactive or unconstrained", () => {
    expect(buildScreenFilter(EMPTY_SCREENING)).toBeNull();
    expect(buildScreenFilter(s({}))).toBeNull();
  });

  it("serializes one clause per criterion, mirroring the predicate's fields", () => {
    const f = buildScreenFilter(
      s({ pctLost2025Min: 25, terminalOnly: true, documented: "undocumented", state: 1, storageMinAcFt: 1000 }),
    ) as unknown[];
    expect(f[0]).toBe("all");
    const flat = JSON.stringify(f);
    expect(flat).toContain('[">=",["get","pl25"],25]');
    expect(flat).toContain('["==",["get","term"],1]');
    expect(flat).toContain('["==",["get","doc"],0]');
    expect(flat).toContain('["==",["get","st"],1]');
    expect(flat).toContain('[">=",["get","storAf"],1000]');
  });

  it("a pct-lost MAX also guards out the -1 unknown sentinel", () => {
    const f = JSON.stringify(buildScreenFilter(s({ pctLost2025Max: 25 })));
    expect(f).toContain('[">=",["get","pl25"],0]');
    expect(f).toContain('["<=",["get","pl25"],25]');
  });
});
