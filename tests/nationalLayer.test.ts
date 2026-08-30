// National-layer pure builders (src/map/nationalLayer.ts): the metric paint
// expressions (step ramps + the evidence match), and the 57k-point GeoJSON
// build — mouth exclusion, precomputed screening props, unknown sentinels.
import { describe, expect, it } from "vitest";
import { NATIONAL_METRICS, NAT_UNKNOWN, buildNationalGeoJSON, paintForMetric } from "../src/map/nationalLayer";
import { decodeCore } from "../src/sediment/decode";
import { M3_PER_ACFT } from "../src/sediment/types";
import type { NationalMetric } from "../src/state/store";

// Reuse the sedimentData fixture shape via a local minimal inventory.
const INVENTORY = {
  _meta: { trajSpan: 3, trajChunks: 2 },
  n: 3,
  dicts: { state: ["Kansas"], owner: ["Federal"], purpose: ["Flood Control"], storSrc: ["NID"] },
  cols: {
    id: [-5, 10, 20],
    name: ["Big River", "Dam A", "Dam B"],
    nid: ["MOUTH_BigR", "KS00001", "KS00002"],
    lon: [-96.1, -96.2, -96.3],
    lat: [39.1, 39.2, 39.3],
    state: [-1, 0, 0],
    owner: [-1, 0, 0],
    purpose: [-1, 0, 0],
    storSrc: [-1, 0, 0],
    yrc: [0, 1950, 0],
    flags: [1, 2 | 16 | 512, 512 | 64], // mouth · terminal+surveys+traj · traj+no-storage
    to: [-1, 0, 1],
    deltaTag: [0, 0, 0],
    maxStor: [null, 1.2e9, 5e5],
    da: [1000, 900, 10],
    sca: [800, 700, null],
    capOrig: [null, 1.2e9, null],
    cap2025: [null, 1.0e9, 0],
    cap2050: [null, 8.5e8, 0],
    sed2015: [null, 1.7e8, 0],
    sed2025: [null, 2.0e8, 0],
    sed2050: [null, 3.5e8, 0],
    evd: [0, 0, 0],
  },
};

describe("buildNationalGeoJSON", () => {
  const core = decodeCore(INVENTORY);
  const fc = buildNationalGeoJSON(core, new Map([[10, "site-a"]]));

  it("excludes mouth nodes and keeps every dam", () => {
    expect(fc.features).toHaveLength(2);
    expect(fc.features.map((f) => f.properties!.shortId)).toEqual([10, 20]);
  });

  it("precomputes metric + screening properties", () => {
    const a = fc.features[0].properties!;
    expect(a.pl25).toBeCloseTo(16.7, 1); // 2.0e8 / 1.2e9
    expect(a.pl50).toBeCloseTo(29.2, 1);
    expect(a.rateAf).toBeCloseTo((2.0e8 - 1.7e8) / 10 / M3_PER_ACFT, 0);
    expect(a.storAf).toBe(Math.round(1.2e9 / M3_PER_ACFT));
    expect(a).toMatchObject({ ev: 1, doc: 1, term: 1, st: 0 });
    expect(a.rs).toBeGreaterThan(1); // big reservoir draws larger
  });

  it("uses -1 sentinels for unknowable metrics (no-storage rows)", () => {
    const b = fc.features[1].properties!;
    expect(b.pl25).toBe(-1); // capOrig null → unknown, never 0%
    expect(b).toMatchObject({ ev: 0, doc: 0, term: 0 });
  });
});

describe("paintForMetric", () => {
  it("step ramps lead with the unknown color and pair every stop", () => {
    for (const metric of ["pctLost2025", "pctLost2050", "rate", "storage"] as NationalMetric[]) {
      const expr = paintForMetric(metric) as unknown[];
      expect(expr[0]).toBe("step");
      expect(expr[2]).toBe(NAT_UNKNOWN);
      const stops = NATIONAL_METRICS[metric].stops!;
      expect(expr).toHaveLength(3 + stops.length * 2);
      // Stops ascend; colors are drawn from the ramp.
      for (let i = 0; i < stops.length; i++) expect(expr[3 + i * 2]).toBe(stops[i]);
    }
  });

  it("evidence uses a categorical match", () => {
    const expr = paintForMetric("evidence") as unknown[];
    expect(expr[0]).toBe("match");
    expect(expr).toContain(1);
  });

  it("legend rows exist for every metric", () => {
    for (const def of Object.values(NATIONAL_METRICS)) {
      expect(def.legend.length).toBeGreaterThanOrEqual(2);
      for (const row of def.legend) expect(row.color).toMatch(/^#/);
    }
  });
});
