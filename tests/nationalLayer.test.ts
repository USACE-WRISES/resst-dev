// National-layer pure helpers (src/map/nationalLayer.ts): the per-row metric
// values, the colour a row gets under each metric (step ramps + the evidence
// pair), the storage radius scale, and the zoom-driven canvas style. The
// inventory below hits every percent-lost step (below 0 = unknown, 0, 10, 25,
// 50, 75) and a spread of storage buckets.
import { describe, expect, it } from "vitest";
import {
  EV_MEASURED,
  EV_MODELED,
  NATIONAL_METRICS,
  NAT_UNKNOWN,
  RAMP,
  colorForRow,
  metricValue,
  natOpacity,
  natRadius,
  natStrokeWidth,
  radiusScale,
} from "../src/map/nationalLayer";
import { decodeCore } from "../src/sediment/decode";
import { M3_PER_ACFT } from "../src/sediment/types";
import type { NationalMetric } from "../src/state/store";

const BUCKET_INVENTORY = {
  _meta: { trajSpan: 3, trajChunks: 1 },
  n: 10,
  dicts: { state: ["Kansas"], owner: ["Federal"], purpose: ["Flood Control"], storSrc: ["NID"] },
  cols: {
    id: [-5, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    name: ["Mouth", "D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9"],
    nid: ["MOUTH", "N1", "N2", "N3", "N4", "N5", "N6", "N7", "N8", "N9"],
    lon: [-96, -96.1, -96.2, -96.3, -96.4, -96.5, -96.6, -96.7, -96.8, -96.9],
    lat: [39, 39.1, 39.2, 39.3, 39.4, 39.5, 39.6, 39.7, 39.8, 39.9],
    state: [-1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    owner: [-1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    purpose: [-1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    storSrc: [-1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    yrc: [0, 1950, 1950, 1950, 1950, 1950, 1950, 1950, 1950, 1950],
    flags: [1, 512, 512 | 16, 512, 512 | 2, 512, 512 | 16, 512, 512, 64],
    to: [-1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
    deltaTag: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    maxStor: [null, 1e5, 1e6, 1e7, 1e8, 1e9, 1e10, 5e9, 2e9, null],
    da: [1000, 100, 100, 100, 100, 100, 100, 100, 100, 100],
    sca: [800, 80, 80, 80, 80, 80, 80, 80, 80, null],
    capOrig: [null, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, null],
    cap2025: [null, 1000, 901, 900, 751, 750, 500, 250, 100, 0],
    cap2050: [null, 1000, 900, 750, 500, 250, 1, 0, 0, 0],
    sed2015: [null, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    sed2025: [null, 0, 99, 100, 249, 250, 500, 750, 900, 0],
    sed2050: [null, 0, 100, 250, 500, 750, 999, 1000, 1000, 0],
    evd: [0, 1, 2, 1, 2, 0, 1, 2, 1, 2],
  },
};

// Rows: 0 = mouth, 1..9 = D1..D9 (decodeCore keeps the inventory order).
const core = decodeCore(BUCKET_INVENTORY);

describe("metricValue", () => {
  it("rounds percent lost to a tenth and uses -1 when the original capacity is unknown", () => {
    expect(metricValue(core, 2, "pctLost2025")).toBe(9.9);
    expect(metricValue(core, 3, "pctLost2025")).toBe(10);
    expect(metricValue(core, 9, "pctLost2025")).toBe(-1);
    expect(metricValue(core, 3, "pctLost2050")).toBe(25);
  });

  it("converts rate and storage to acre-feet, with -1 for missing storage", () => {
    expect(metricValue(core, 8, "rate")).toBe(Math.round((900 / 10 / M3_PER_ACFT) * 10) / 10);
    expect(metricValue(core, 1, "storage")).toBe(Math.round(1e5 / M3_PER_ACFT));
    expect(metricValue(core, 9, "storage")).toBe(-1);
  });

  it("passes the evidence class through", () => {
    expect(metricValue(core, 1, "evidence")).toBe(1);
    expect(metricValue(core, 2, "evidence")).toBe(2);
  });
});

describe("colorForRow", () => {
  it("steps the percent-lost ramp at 0, 10, 25, 50 and 75, with unknown below", () => {
    const expected = [RAMP[0], RAMP[0], RAMP[1], RAMP[1], RAMP[2], RAMP[3], RAMP[4], RAMP[4], NAT_UNKNOWN];
    expected.forEach((color, i) => expect(colorForRow(core, i + 1, "pctLost2025")).toBe(color));
  });

  it("steps storage by decades of acre-feet", () => {
    expect(colorForRow(core, 1, "storage")).toBe(RAMP[0]); // 81 ac-ft
    expect(colorForRow(core, 3, "storage")).toBe(RAMP[1]); // 8.1k
    expect(colorForRow(core, 4, "storage")).toBe(RAMP[2]); // 81k
    expect(colorForRow(core, 5, "storage")).toBe(RAMP[3]); // 811k
    expect(colorForRow(core, 6, "storage")).toBe(RAMP[4]); // 8.1M
    expect(colorForRow(core, 9, "storage")).toBe(NAT_UNKNOWN);
  });

  it("pairs the evidence class: survey-constrained vs everything else", () => {
    expect(colorForRow(core, 1, "evidence")).toBe(EV_MEASURED);
    expect(colorForRow(core, 2, "evidence")).toBe(EV_MODELED);
    expect(colorForRow(core, 5, "evidence")).toBe(EV_MODELED); // class 0 (unknown) is not "measured"
  });

  it("reaches every ramp step plus the unknown colour across the fixture", () => {
    const seen = new Set<string>();
    for (let row = 1; row <= 9; row++) seen.add(colorForRow(core, row, "pctLost2025"));
    expect(seen.size).toBe(6);
  });

  it("legend rows exist for every metric", () => {
    for (const def of Object.values(NATIONAL_METRICS)) {
      expect(def.legend.length).toBeGreaterThanOrEqual(2);
      for (const row of def.legend) expect(row.color).toMatch(/^#/);
    }
    for (const metric of Object.keys(NATIONAL_METRICS) as NationalMetric[]) {
      expect(colorForRow(core, 1, metric)).toMatch(/^#/);
    }
  });
});

describe("radiusScale", () => {
  it("grows with the log of storage, clamped to 0.75–1.9, and defaults to 0.75", () => {
    expect(radiusScale(core, 1)).toBeCloseTo(0.75, 10); // 1e5 m³ → 0.75 exactly
    expect(radiusScale(core, 4)).toBeCloseTo(1.8, 10); // 1e8 m³
    expect(radiusScale(core, 6)).toBeCloseTo(1.9, 10); // 1e10 m³, clamped
    expect(radiusScale(core, 9)).toBe(0.75); // no storage
  });
});

describe("canvas style helpers", () => {
  it("interpolate the circle radius and opacity by zoom, clamped at the stops", () => {
    expect(natRadius(1, 3)).toBeCloseTo(1.6, 10);
    expect(natRadius(1, 9)).toBeCloseTo(5, 10);
    expect(natRadius(1, 6)).toBeCloseTo(3.3, 10);
    expect(natRadius(2, 12)).toBeCloseTo(10, 10);
    expect(natRadius(1, 0)).toBeCloseTo(1.6, 10);
    expect(natOpacity(3)).toBeCloseTo(0.55, 10);
    expect(natOpacity(8)).toBeCloseTo(0.85, 10);
    expect(natOpacity(5.5)).toBeCloseTo(0.7, 10);
    expect(natOpacity(1)).toBeCloseTo(0.55, 10);
    expect(natStrokeWidth(5.9)).toBe(0);
    expect(natStrokeWidth(6)).toBe(0.75);
  });
});
