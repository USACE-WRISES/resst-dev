// Pure-geometry checks for the map Select tools (src/map/spatial.ts):
// even-odd containment over flat ring lists, local-equirectangular segment
// distance, the corridor test with its bbox fast path, and the namesake
// part-clustering filter.
import { describe, expect, it } from "vitest";
import {
  corridorOf,
  metersPerPixel,
  milesToMeters,
  partsNearSeed,
  pointInRing,
  pointInRings,
  pointToPartsMeters,
  pointToSegmentMeters,
  withinCorridor,
  type Pt,
} from "../src/map/spatial";

const SQUARE = [
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 10],
];
const SQUARE_CLOSED = [...SQUARE, [0, 0]];
const M_PER_DEG = 111_195; // spherical meters per degree of latitude

describe("pointInRing / pointInRings", () => {
  it("classifies inside vs outside, identically for open and pre-closed rings", () => {
    for (const ring of [SQUARE, SQUARE_CLOSED]) {
      expect(pointInRing([5, 5], ring)).toBe(true);
      expect(pointInRing([15, 5], ring)).toBe(false);
      expect(pointInRing([-1, -1], ring)).toBe(false);
    }
  });

  it("treats a hole ring as even-odd (donut)", () => {
    const hole = [
      [4, 4],
      [6, 4],
      [6, 6],
      [4, 6],
    ];
    expect(pointInRings([5, 5], [SQUARE, hole])).toBe(false); // in the hole
    expect(pointInRings([2, 2], [SQUARE, hole])).toBe(true); // between hole and outer
    expect(pointInRings([15, 15], [SQUARE, hole])).toBe(false);
  });

  it("counts any part of a multipart polygon", () => {
    const partB = [
      [20, 20],
      [30, 20],
      [30, 30],
      [20, 30],
    ];
    expect(pointInRings([25, 25], [SQUARE, partB])).toBe(true);
    expect(pointInRings([15, 15], [SQUARE, partB])).toBe(false);
  });
});

describe("pointToSegmentMeters", () => {
  it("measures perpendicular distance near the equator within 1%", () => {
    const d = pointToSegmentMeters([0, 0.1], [-1, 0], [1, 0]);
    expect(d).toBeGreaterThan(0.1 * M_PER_DEG * 0.99);
    expect(d).toBeLessThan(0.1 * M_PER_DEG * 1.01);
  });

  it("scales longitude by cos(latitude)", () => {
    // The same 0.1° lon offset against a meridian at 60°N is half the
    // equatorial ground distance.
    const d = pointToSegmentMeters([0.1, 60], [0, 59], [0, 61]);
    const expected = 0.1 * M_PER_DEG * Math.cos((60 * Math.PI) / 180);
    expect(d).toBeGreaterThan(expected * 0.99);
    expect(d).toBeLessThan(expected * 1.01);
  });

  it("clamps beyond the endpoints and handles zero-length segments", () => {
    const past = pointToSegmentMeters([2, 0], [0, 0], [1, 0]);
    expect(past).toBeGreaterThan(1 * M_PER_DEG * 0.99);
    expect(past).toBeLessThan(1 * M_PER_DEG * 1.01);
    const point = pointToSegmentMeters([0, 1], [0, 0], [0, 0]);
    expect(point).toBeGreaterThan(1 * M_PER_DEG * 0.99);
    expect(point).toBeLessThan(1 * M_PER_DEG * 1.01);
  });
});

describe("corridorOf / withinCorridor", () => {
  const corridor = corridorOf([
    [
      [0, 0],
      [1, 0],
    ],
  ]);

  it("computes the union bbox across parts", () => {
    const c = corridorOf([
      [
        [-3, 1],
        [2, 5],
      ],
      [
        [0, -2],
        [1, 0],
      ],
    ]);
    expect(c.bbox).toEqual([-3, -2, 2, 5]);
  });

  it("answers the distance threshold correctly on both sides", () => {
    const p: Pt = [0.5, 0.05]; // ≈ 5,560 m from the line
    expect(withinCorridor(p, corridor, 6000)).toBe(true);
    expect(withinCorridor(p, corridor, 5000)).toBe(false);
  });

  it("rejects far points via the bbox fast path (agreeing with brute force)", () => {
    const far: Pt = [10, 10];
    expect(withinCorridor(far, corridor, milesToMeters(25))).toBe(false);
    expect(pointToPartsMeters(far, corridor.parts) > milesToMeters(25)).toBe(true);
  });
});

describe("partsNearSeed", () => {
  const clusterA1 = [
    [0, 0],
    [0.2, 0],
  ];
  const clusterA2 = [
    [0.25, 0],
    [0.5, 0],
  ]; // ~5.5 km gap to A1 — same river
  const clusterB = [
    [3, 0],
    [3.2, 0],
  ]; // ~278 km away — a namesake

  it("keeps only the cluster chained to the seed at the default 50 km gap", () => {
    const kept = partsNearSeed([clusterA1, clusterA2, clusterB], [0.1, 0.01]);
    expect(kept).toEqual([clusterA1, clusterA2]);
  });

  it("seeding near the namesake keeps the namesake instead", () => {
    expect(partsNearSeed([clusterA1, clusterA2, clusterB], [3.1, 0.01])).toEqual([clusterB]);
  });

  it("honors a custom gap threshold", () => {
    const kept = partsNearSeed([clusterA1, clusterA2, clusterB], [0.1, 0.01], 300_000);
    expect(kept).toHaveLength(3);
  });

  it("passes single-part input through untouched", () => {
    expect(partsNearSeed([clusterA1], [50, 50])).toEqual([clusterA1]);
  });
});

describe("milesToMeters / metersPerPixel", () => {
  it("converts statute miles", () => {
    expect(milesToMeters(10)).toBeCloseTo(16093.44, 2);
  });

  it("scales ground resolution by zoom and latitude (512px world at z0)", () => {
    expect(metersPerPixel(0, 0)).toBeCloseTo(40075016.686 / 512, 0);
    expect(metersPerPixel(8, 39.25)).toBeCloseTo(236.7, 0);
    expect(metersPerPixel(8, 60)).toBeLessThan(metersPerPixel(8, 0));
  });
});
