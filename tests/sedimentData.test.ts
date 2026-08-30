// Client-side sediment data layer: columnar decode (inventory / trajectory
// chunks / surveys) and the pure network traversal that runs on the decoded
// core — including the defensive cycle guard and the O(n) upstream counts.
import { describe, expect, it } from "vitest";
import { decodeCore, decodeSurveys, decodeTrajChunk } from "../src/sediment/decode";
import {
  buildNetworkSentences,
  downstreamChain,
  downstreamDamCount,
  mouthOf,
  networkStats,
  upstreamCounts,
  upstreamImmediate,
  upstreamSet,
} from "../src/sediment/network";
import { FLAG } from "../src/sediment/types";

// Six-row network: mouth ← terminal ← mid ← {two headwaters}; plus an
// isolated dam (both terminal and headwater, linked to nothing).
//   row:   0        1         2      3     4     5
//   id:   -5       10        20     30    40    50
//   to:   —      mouth   terminal  mid   mid    —
const M = FLAG.MOUTH;
const T = FLAG.TERMINAL;
const H = FLAG.HEADWATER;
const FIXTURE_FLAGS = [M, T, 0, H, H, T | H];

function makeInventory() {
  const n = 6;
  const fill = (v: number | null) => new Array(n).fill(v);
  return {
    _meta: { trajSpan: 3, trajChunks: 2 },
    n,
    dicts: { state: ["Kansas"], owner: ["Federal"], purpose: ["Flood Control"], storSrc: ["NID"] },
    cols: {
      id: [-5, 10, 20, 30, 40, 50],
      name: ["Big River", "Last Dam", "Mid Dam", "Head A", "Head B", "Lone Dam"],
      nid: ["MOUTH_BigR", "KS00001", "KS00002", "KS00003", "KS00004", "KS00005"],
      lon: [-96.1, -96.2, -96.3, -96.4, -96.5, -97],
      lat: [39.1, 39.2, 39.3, 39.4, 39.5, 38],
      state: [-1, 0, 0, 0, 0, 0],
      owner: [-1, 0, 0, 0, 0, 0],
      purpose: [-1, 0, 0, 0, 0, 0],
      storSrc: [-1, 0, 0, 0, 0, 0],
      yrc: [0, 1950, 1962, 1970, 0, 1980],
      flags: FIXTURE_FLAGS.map((f, i) => (i === 0 ? f : f | FLAG.HAS_TRAJ)),
      to: [-1, 0, 1, 2, 2, -1],
      deltaTag: fill(0),
      maxStor: [null, 5e6, 2e6, 1e6, 1e6, 3e5],
      da: [1000, 900, 700, 200, 150, 50],
      sca: [800, 700, 500, 200, 150, null],
      capOrig: [null, 5e6, 2e6, 1e6, 1e6, 3e5],
      cap2025: [null, 4e6, 1.5e6, 9e5, 9.5e5, 2.5e5],
      cap2050: [null, 3.5e6, 1.2e6, 8.5e5, 9e5, 2.2e5],
      sed2015: [null, 8e5, 4e5, 8e4, 4e4, 4e4],
      sed2025: [null, 1e6, 5e5, 1e5, 5e4, 5e4],
      sed2050: [null, 1.5e6, 8e5, 1.5e5, 1e5, 8e4],
      evd: fill(0),
    },
  };
}

describe("decodeCore", () => {
  const core = decodeCore(makeInventory());

  it("decodes columns into typed arrays with null → NaN and builds rowById", () => {
    expect(core.n).toBe(6);
    expect(core.rowById.get(-5)).toBe(0);
    expect(core.rowById.get(50)).toBe(5);
    expect(Number.isNaN(core.capOrig[0])).toBe(true);
    expect(core.capOrig[1]).toBe(5e6);
    expect(Number.isNaN(core.sca[5])).toBe(true);
    expect(core.dicts.state[core.state[1]]).toBe("Kansas");
    expect(core.state[0]).toBe(-1);
    expect(core.trajSpan).toBe(3);
  });

  it("inverts `to` into a CSR immediate-upstream index", () => {
    expect(upstreamImmediate(core, 0)).toEqual([1]);
    expect(upstreamImmediate(core, 1)).toEqual([2]);
    expect(upstreamImmediate(core, 2).sort()).toEqual([3, 4]);
    expect(upstreamImmediate(core, 5)).toEqual([]);
  });
});

describe("network traversal", () => {
  const core = decodeCore(makeInventory());

  it("downstreamChain walks to the mouth in order", () => {
    expect(downstreamChain(core, 3)).toEqual([2, 1, 0]);
    expect(downstreamChain(core, 1)).toEqual([0]);
    expect(downstreamChain(core, 5)).toEqual([]);
  });

  it("downstreamDamCount excludes the mouth node", () => {
    expect(downstreamDamCount(core, 3)).toBe(2);
    expect(downstreamDamCount(core, 1)).toBe(0);
  });

  it("mouthOf finds the outlet or reports an inland chain end", () => {
    expect(mouthOf(core, 3)).toBe(0);
    expect(mouthOf(core, 1)).toBe(0);
    expect(mouthOf(core, 5)).toBeNull();
  });

  it("upstreamSet collects the whole subtree, excluding self", () => {
    expect(upstreamSet(core, 0)).toEqual(new Set([1, 2, 3, 4]));
    expect(upstreamSet(core, 2)).toEqual(new Set([3, 4]));
    expect(upstreamSet(core, 3)).toEqual(new Set());
  });

  it("upstreamCounts matches upstreamSet sizes in one pass and memoizes", () => {
    const counts = upstreamCounts(core);
    for (let r = 0; r < core.n; r++) expect(counts[r]).toBe(upstreamSet(core, r).size);
    expect(upstreamCounts(core)).toBe(counts); // WeakMap-memoized
  });

  it("survives a data cycle without hanging (defensive guard)", () => {
    const cyclic = decodeCore(makeInventory());
    cyclic.to[1] = 2; // 1 → 2 → 1
    cyclic.to[2] = 1;
    expect(downstreamChain(cyclic, 3)).toEqual([2, 1]);
    expect(mouthOf(cyclic, 3)).toBeNull();
  });
});

describe("networkStats / buildNetworkSentences", () => {
  const core = decodeCore(makeInventory());

  it("stats for a mid-network dam name the immediate downstream and the mouth", () => {
    const s = networkStats(core, 3); // Head A → Mid Dam → Last Dam → mouth
    expect(s).toMatchObject({ upCount: 0, downCount: 2, immediateDownRow: 2, mouthRow: 0, headwater: true });
    expect(networkStats(core, 1).immediateDownRow).toBeNull(); // next hop is the mouth, not a dam
  });

  it("headwater + downstream chain wording ('would encounter', never delivery)", () => {
    const s = buildNetworkSentences(core, 3);
    expect(s[0]).toContain("No mapped reservoirs upstream");
    expect(s[1]).toBe("Sediment passing this dam would encounter 2 more reservoirs before the river reaches its mouth (Big River).");
  });

  it("terminal dam before the mouth", () => {
    const s = buildNetworkSentences(core, 1);
    expect(s[0]).toContain("3 upstream reservoirs influence sediment delivery");
    expect(s[1]).toBe("This is the last dam before the river reaches its mouth (Big River).");
  });

  it("isolated dam: chain ends inland", () => {
    const s = buildNetworkSentences(core, 5);
    expect(s[0]).toContain("No mapped reservoirs upstream");
    expect(s[1]).toContain("ends inland of any mapped river mouth");
  });
});

describe("decodeTrajChunk", () => {
  const chunk = {
    _meta: { grid: [1900, 1910, 1920, 1930] },
    rows: [2, 3, 4],
    yr0: [1905, 1922, null],
    start: [1, 2, -1],
    sed: [[0, 100, 200], [50, 3000], []],
    sedHi25: [220, 70, null],
    sedLo25: [180, 40, null],
    sedHi50: [260, 90, null],
    sedLo50: [200, 50, null],
    capHi25: [950, 460, null],
    capLo25: [850, 420, null],
    capHi50: [900, 440, null],
    capLo50: [780, 400, null],
    capX: { "3": [500, 400] },
  };
  const capOrigOf = (row: number) => (row === 2 ? 1000 : row === 3 ? 2000 : NaN);
  const decoded = decodeTrajChunk(chunk, capOrigOf);

  it("reconstructs capacity as capOrig − sediment on invariant rows", () => {
    const t = decoded.get(2)!;
    expect(t.years).toEqual([1910, 1920, 1930]);
    expect(t.capacityM3).toEqual([1000, 900, 800]);
    expect(t.yr0).toBe(1905);
    expect(t.ci[0]).toEqual({ year: 2025, capHi: 950, capLo: 850, sedHi: 220, sedLo: 180 });
  });

  it("prefers an explicit capX series over reconstruction, and clamps at 0", () => {
    const t = decoded.get(3)!;
    expect(t.capacityM3).toEqual([500, 400]); // capX, NOT 2000−50 / max(0, 2000−3000)
    const noX = decodeTrajChunk({ ...chunk, capX: {} }, capOrigOf).get(3)!;
    expect(noX.capacityM3).toEqual([1950, 0]); // reconstruction clamps the negative
  });

  it("yields an empty series for all-zero rows", () => {
    const t = decoded.get(4)!;
    expect(t.years).toEqual([]);
    expect(t.sedimentM3).toEqual([]);
    expect(t.yr0).toBeNull();
  });
});

describe("decodeSurveys", () => {
  it("groups converted observations by joined inventory row, skipping unjoined reservoirs", () => {
    const byRow = decodeSurveys({
      reservoirs: {
        id: ["7", "9"],
        name: ["A", "B"],
        nid: ["KS00001", null],
        row: [1, null],
        lon: [-96.2, null],
        lat: [39.2, null],
        state: ["KS", ""],
        began: [1950, null],
      },
      surveys: {
        rIdx: [0, 0, 1],
        year: [1960, 1980, 1970],
        pool: ["S", "CON", ""],
        cap: [1.2e6, 1.1e6, 5e5],
        area: [null, 4e6, null],
        sedTot: [8e4, 9e4, null],
        dryWt: [960, null, null],
      },
    });
    expect(byRow.get(1)).toHaveLength(2);
    expect(byRow.get(1)![0]).toEqual({ year: 1960, pool: "S", capM3: 1.2e6, areaM2: null, sedTotM3: 8e4, dryWtKgM3: 960 });
    expect([...byRow.keys()]).toEqual([1]); // reservoir B is unjoined — dropped
  });
});
