// Comparable-reservoir finder (src/sediment/similar.ts): documented-first
// partitioning, Gower reweighting when components are missing, exclusions
// (self, mouths, zero-storage), and deterministic ordering.
import { describe, expect, it } from "vitest";
import { findSimilar, scoreFromDistance } from "../src/sediment/similar";
import { decodeCore } from "../src/sediment/decode";

// Rows: mouth · target · twin (identical profile) · twin-in-another-state ·
// missing-age twin · very different dam · zero-storage row.
const INVENTORY = {
  _meta: { trajSpan: 8, trajChunks: 1 },
  n: 7,
  dicts: { state: ["Kansas", "Oregon"], owner: ["Federal"], purpose: ["Flood Control", "Irrigation"], storSrc: ["NID"] },
  cols: {
    id: [-5, 10, 20, 30, 40, 50, 60],
    name: ["Big River", "Target", "Twin", "Far Twin", "Ageless Twin", "Odd Dam", "Empty"],
    nid: ["MOUTH_BigR", "KS00001", "KS00002", "OR00001", "KS00003", "KS00004", "KS00005"],
    lon: [-96.1, -96.2, -96.3, -120, -96.4, -96.5, -96.6],
    lat: [39.1, 39.2, 39.3, 44, 39.4, 39.5, 39.6],
    state: [-1, 0, 0, 1, 0, 0, 0],
    owner: [-1, 0, 0, 0, 0, 0, 0],
    purpose: [-1, 0, 0, 0, 0, 1, 0],
    storSrc: [-1, 0, 0, 0, 0, 0, 0],
    yrc: [0, 1960, 1960, 1960, 0, 2015, 1960],
    flags: [1, 512, 512, 512, 512, 512, 512 | 64],
    to: [-1, 0, 0, -1, 0, 0, -1],
    deltaTag: [0, 0, 0, 0, 0, 0, 0],
    maxStor: [null, 1e9, 1e9, 1e9, 1e9, 1e4, 0],
    da: [1000, 900, 900, 900, 900, 2, null],
    sca: [800, 700, 700, 700, 700, 2, null],
    capOrig: [null, 1e9, 1e9, 1e9, 1e9, 1e4, null],
    cap2025: [null, 8e8, 8e8, 8e8, 8e8, 9.9e3, 0],
    cap2050: [null, 7e8, 7e8, 7e8, 7e8, 9.8e3, 0],
    sed2015: [null, 1.8e8, 1.8e8, 1.8e8, 1.8e8, 50, 0],
    sed2025: [null, 2e8, 2e8, 2e8, 2e8, 100, 0],
    sed2050: [null, 3e8, 3e8, 3e8, 3e8, 200, 0],
    evd: [0, 0, 0, 0, 0, 0, 0],
  },
};
const core = decodeCore(INVENTORY);
const TARGET = 1;

describe("findSimilar", () => {
  it("partitions documented-first, excludes self/mouths/zero-storage, ranks twins on top", () => {
    const r = findSimilar(core, TARGET, new Set([20])); // Twin is a documented site
    expect(r.documented.map((m) => m.row)).toEqual([2]);
    expect(r.documented[0].score).toBe(100); // identical profile, same state+purpose
    const overallRows = r.overall.map((m) => m.row);
    expect(overallRows).not.toContain(TARGET);
    expect(overallRows).not.toContain(0); // mouth
    expect(overallRows).not.toContain(6); // zero storage
    expect(overallRows[0]).toBe(4); // ageless twin outranks the far twin (state penalty > dropped-age effect)
  });

  it("missing components reweight instead of tanking the score", () => {
    const r = findSimilar(core, TARGET, new Set());
    const ageless = r.overall.find((m) => m.row === 4)!;
    expect(ageless.score).toBe(100); // age dropped pairwise; everything else identical
  });

  it("categorical mismatches apply bounded penalties", () => {
    const r = findSimilar(core, TARGET, new Set());
    const far = r.overall.find((m) => m.row === 3)!;
    expect(far.score).toBe(scoreFromDistance(0.05)); // state penalty only
    const odd = r.overall.find((m) => m.row === 5)!;
    expect(odd.score).toBeLessThan(far.score); // physically different + purpose mismatch
  });

  it("orders deterministically (score desc, then ShortID asc)", () => {
    const a = findSimilar(core, TARGET, new Set());
    const b = findSimilar(core, TARGET, new Set());
    expect(a.overall).toEqual(b.overall);
    // Twin (20) and Ageless Twin (40) both score 100 — the lower ShortID leads.
    expect(a.overall.slice(0, 2).map((m) => m.row)).toEqual([2, 4]);
  });
});
