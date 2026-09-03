// National-layer pure builders (src/map/nationalLayer.ts): the metric paint
// expressions (step ramps + the evidence match), and the 57k-point GeoJSON
// build — mouth exclusion, precomputed screening props, unknown sentinels.
import { describe, expect, it } from "vitest";
import { Color, expression } from "@maplibre/maplibre-gl-style-spec";
import {
  NATIONAL_METRICS,
  NAT_UNKNOWN,
  buildNationalGeoJSON,
  colorForRow,
  natOpacity,
  natRadius,
  natStrokeWidth,
  paintForMetric,
} from "../src/map/nationalLayer";
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
    evd: [0, 1, 2],
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
    expect(a).toMatchObject({ ev: 1, cls: 1, doc: 1, term: 1, st: 0 });
    expect(a.rs).toBeGreaterThan(1); // big reservoir draws larger
  });

  it("uses -1 sentinels for unknowable metrics (no-storage rows)", () => {
    const b = fc.features[1].properties!;
    expect(b.pl25).toBe(-1); // capOrig null → unknown, never 0%
    expect(b).toMatchObject({ ev: 0, cls: 2, doc: 0, term: 0 });
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

// The Leaflet canvas layer paints with colorForRow; MapLibre paints with the
// paintForMetric expression. Feed the same rows to both — through the real
// style-spec evaluator — so the two can never drift. The inventory below hits
// every percent-lost step (below 0 = unknown, 0, 10, 25, 50, 75) and a spread
// of storage buckets.
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

describe("colorForRow mirrors the MapLibre paint expression", () => {
  const core = decodeCore(BUCKET_INVENTORY);
  const fc = buildNationalGeoJSON(core, new Map());
  const colorSpec = {
    type: "color",
    "property-type": "data-driven",
    expression: { interpolated: false, parameters: ["zoom", "feature"] },
    transition: false,
  };
  for (const metric of Object.keys(NATIONAL_METRICS) as NationalMetric[]) {
    it(`agrees with paintForMetric for every fixture row under ${metric}`, () => {
      const res = expression.createExpression(paintForMetric(metric) as never, colorSpec as never);
      expect(res.result).toBe("success");
      if (res.result !== "success") return;
      const seen = new Set<string>();
      for (const f of fc.features) {
        const row = (f.properties as { row: number }).row;
        const fromExpr = String(res.value.evaluate({ zoom: 5 } as never, f as never));
        const mirrored = String(Color.parse(colorForRow(core, row, metric)));
        expect(mirrored).toBe(fromExpr);
        seen.add(mirrored);
      }
      // The percent metric reaches all five ramp steps plus the unknown colour.
      if (metric === "pctLost2025") expect(seen.size).toBe(6);
    });
  }
});

describe("canvas style helpers", () => {
  it("interpolate the MapLibre circle radius and opacity by zoom, clamped at the stops", () => {
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
