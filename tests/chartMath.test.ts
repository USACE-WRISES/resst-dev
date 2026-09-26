// Donut geometry and the chart palette (src/dashboard/charts/chartMath.ts).
import { describe, expect, it } from "vitest";
import {
  CATEGORICAL,
  OTHER_COLOR,
  TAU,
  arcPath,
  explodeOffset,
  rampStep,
  share,
  sliceAngles,
  sliceColor,
} from "../src/dashboard/charts/chartMath";

describe("sliceAngles", () => {
  it("shares the full turn in proportion, in order", () => {
    const a = sliceAngles([1, 1, 2]);
    expect(a[0]).toEqual({ a0: 0, a1: TAU / 4 });
    expect(a[1].a1).toBeCloseTo(TAU / 2);
    expect(a[2].a1).toBeCloseTo(TAU);
  });
  it("gives zero and negative values no span, and an empty total no angles", () => {
    const a = sliceAngles([0, 3, -1]);
    expect(a[0].a1 - a[0].a0).toBe(0);
    expect(a[2].a1 - a[2].a0).toBe(0);
    expect(a[1].a1).toBeCloseTo(TAU);
    expect(sliceAngles([0, 0]).every((s) => s.a0 === 0 && s.a1 === 0)).toBe(true);
  });
});

describe("arcPath", () => {
  it("starts a sector at 12 o'clock and flags large arcs", () => {
    const quarter = arcPath(100, 100, 62, 90, 0, TAU / 4);
    expect(quarter.startsWith("M100 10 A90 90 0 0 1 190 100")).toBe(true);
    expect(quarter.endsWith("Z")).toBe(true);
    const threeQuarters = arcPath(100, 100, 62, 90, 0, (3 * TAU) / 4);
    expect(threeQuarters).toContain("A90 90 0 1 1");
  });
  it("draws a full turn as two rings and nothing for a zero span", () => {
    const full = arcPath(100, 100, 62, 90, 0, TAU);
    expect(full.match(/A90 90/g)).toHaveLength(2);
    expect(full.match(/A62 62/g)).toHaveLength(2);
    expect(arcPath(100, 100, 62, 90, 1, 1)).toBe("");
  });
});

describe("explodeOffset / share / rampStep / sliceColor", () => {
  it("moves a slice outward along its middle angle", () => {
    expect(explodeOffset(0, 6)).toEqual({ dx: 0, dy: -6 });
    expect(explodeOffset(TAU / 4, 6)).toEqual({ dx: 6, dy: 0 });
  });
  it("shares are percents, null without a total", () => {
    expect(share(25, 100)).toBe(25);
    expect(share(1, 0)).toBeNull();
  });
  it("steps a percent into five ramp bins", () => {
    expect([0, 19.9, 20, 59, 80, 100].map(rampStep)).toEqual([0, 0, 1, 2, 4, 4]);
  });
  it("colours Other with its own grey and wraps the palette", () => {
    expect(sliceColor(3, "other")).toBe(OTHER_COLOR);
    expect(sliceColor(0, "a")).toBe(CATEGORICAL[0]);
    expect(sliceColor(CATEGORICAL.length, "b")).toBe(CATEGORICAL[0]);
  });
});
