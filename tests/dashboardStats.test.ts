// The Dashboard's national statistics (src/dashboard/stats.ts) against a
// small inventory: the loss classes bucket exactly as the map colours rows,
// the quadrants equal the Screening panel's counts, states follow the
// Screening rule with blanks as unknown, and mouth rows never count.
import { describe, expect, it } from "vitest";
import { decodeCore } from "../src/sediment/decode";
import { colorForRow } from "../src/map/nationalLayer";
import { EMPTY_SCREENING, quadrantCounts } from "../src/sediment/screen";
import type { Site } from "../src/lib/types";
import type { SiteSedimentLink } from "../src/sediment/types";
import {
  byState,
  damRows,
  linkedLoss,
  lossClasses,
  median,
  nationalHeadline,
  quadrantStats,
  reservoirName,
  sitesByShortId,
  topByStorage,
} from "../src/dashboard/stats";

// mouth · documented 16.7% (Kansas) · undocumented 50% (Kansas) · no-capacity, no state · exactly 25% (Oregon)
const INVENTORY = {
  _meta: { trajSpan: 5, trajChunks: 1 },
  n: 5,
  dicts: { state: ["Kansas", "Oregon"], owner: ["Federal"], purpose: ["Flood Control"], storSrc: ["NID"] },
  cols: {
    id: [-5, 10, 20, 30, 40],
    name: ["Big River", "Doc Dam", "Gap Dam", "", "Edge Dam"],
    nid: ["MOUTH_BigR", "KS00001", "KS00002", "OR00001", "OR00002"],
    lon: [-96.1, -96.2, -96.3, -120, -121],
    lat: [39.1, 39.2, 39.3, 44, 45],
    state: [-1, 0, 0, -1, 1],
    owner: [-1, 0, 0, 0, 0],
    purpose: [-1, 0, 0, 0, 0],
    storSrc: [-1, 0, 0, 0, 0],
    yrc: [0, 1950, 1960, 1970, 1980],
    flags: [1, 2 | 16 | 512, 512, 512 | 256, 512],
    to: [-1, 0, 1, -1, -1],
    deltaTag: [0, 0, 0, 0, 0],
    maxStor: [null, 1.2e9, 6e8, 1e6, 500],
    da: [1000, 900, 700, 10, 5],
    sca: [800, 700, 500, 10, 5],
    capOrig: [null, 1.2e9, 6e8, null, 400],
    cap2025: [null, 1.0e9, 3e8, 0, 300],
    cap2050: [null, 8.5e8, 2e8, 0, 250],
    sed2015: [null, 1.7e8, 2.6e8, 0, 80],
    sed2025: [null, 2.0e8, 3.0e8, 0, 100],
    sed2050: [null, 3.5e8, 4.0e8, 0, 150],
    evd: [0, 1, 2, 2, 2],
  },
};
const core = decodeCore(INVENTORY);
const DOCUMENTED = new Set([10]);

describe("damRows / median", () => {
  it("skips the mouth row", () => {
    expect(damRows(core)).toEqual([1, 2, 3, 4]);
  });
  it("takes the middle value, averaging an even count", () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});

describe("lossClasses", () => {
  it("buckets each reservoir exactly as the map legend colours it", () => {
    const classes = lossClasses(core);
    expect(classes.map((c) => c.count)).toEqual([0, 1, 1, 1, 0, 1]); // 16.7% · 25% · 50% · unknown
    expect(classes[5].key).toBe("unknown");
    for (const c of classes) for (const r of c.rows) expect(colorForRow(core, r, "pctLost2025")).toBe(c.color);
    expect(classes.reduce((s, c) => s + c.count, 0)).toBe(4);
  });
});

describe("quadrantStats", () => {
  it("equals the Screening panel's counts and reports the unknown and boundary reservoirs", () => {
    const q = quadrantStats(core, DOCUMENTED);
    const counts = Object.fromEntries(q.list.map((x) => [x.preset.key, x.count]));
    expect(counts).toEqual(quadrantCounts(core, DOCUMENTED, EMPTY_SCREENING));
    expect(counts).toEqual({ "managed-high": 0, "gap-high": 2, "managed-low": 1, "gap-low": 1 });
    expect(q.dams).toBe(4);
    expect(q.unknown).toBe(1); // no original capacity
    expect(q.overlap).toBe(1); // exactly 25% sits in both loss columns
    expect(q.list.find((x) => x.preset.key === "gap-high")!.rows).toEqual([2, 4]);
  });
});

describe("byState", () => {
  it("counts reservoirs and the Screening rule's high-loss ones per state, blanks as unknown", () => {
    const s = byState(core);
    expect(s.blank).toBe(1);
    expect(s.states.map((x) => [x.code, x.dams, x.high])).toEqual([
      ["KS", 2, 1],
      ["OR", 1, 1], // 25% counts (inclusive, unrounded)
    ]);
    expect(s.states[0].rows).toEqual([1, 2]);
  });
});

describe("nationalHeadline", () => {
  it("sums modeled volumes, takes the per-reservoir median, and splits out the documented dams", () => {
    const h = nationalHeadline(core, DOCUMENTED);
    expect(h.dams).toBe(4);
    expect(h.capOrig).toBeCloseTo(1.8e9 + 400, 0);
    expect(h.sed2025).toBeCloseTo(5e8 + 100, 0);
    expect(h.pctVolume).toBeCloseTo(27.78, 1);
    expect(h.median).toBeCloseTo(25, 5);
    expect(h.documented).toMatchObject({ dams: 1, capOrig: 1.2e9, sed2025: 2e8 });
  });
});

const link = (site_id: string, short_id: number, cap: number | null, sed: number | null): SiteSedimentLink => ({
  site_id,
  short_id,
  nid: "",
  method: "manual",
  confidence: "high",
  cap_orig_m3: cap,
  cap2025_m3: null,
  sed2025_m3: sed,
  sed2015_m3: null,
  cap2050_m3: null,
  sed2050_m3: null,
  has_surveys: false,
  latest_survey_year: null,
});
const site = (site_id: string): Site => ({
  site_id,
  site_name: site_id,
  nid_id: "",
  responsible_districtagency: "",
  address: "",
  city: "",
  site_type: "",
  sediment_release: "",
  ecological_concern: "",
  analysis: "",
  longitude: null,
  latitude: null,
});

describe("sites and reservoirs", () => {
  const links = new Map([
    ["a", link("a", 10, 1000, 100)],
    ["b", link("b", 10, 1000, 400)],
    ["c", link("c", 20, 1000, 500)],
    ["d", link("d", 30, 0, 0)],
  ]);
  it("keeps every site a shared dam links to", () => {
    const by = sitesByShortId(links);
    expect(by.get(10)).toEqual(["a", "b"]);
    expect(by.get(20)).toEqual(["c"]);
  });
  it("summarizes the modeled loss across a set of sites, ignoring unlinked and unmodeled ones", () => {
    const l = linkedLoss(["a", "b", "c", "d", "e"].map(site), links);
    expect(l).toEqual({ linked: 3, median: 40, high: 2 });
    expect(linkedLoss([site("e")], links)).toEqual({ linked: 0, median: null, high: 0 });
  });
  it("ranks reservoirs by original capacity, storage when unmodeled, and names blank ones by NID", () => {
    expect(topByStorage(core, damRows(core), 3)).toEqual([1, 2, 3]);
    expect(reservoirName(core, 3)).toBe("NID OR00001");
    expect(reservoirName(core, 1)).toBe("Doc Dam");
  });
});
