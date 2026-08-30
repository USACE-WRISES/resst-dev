// Geometry-level checks for the trajectory chart (src/sediment/chartGeom.ts):
// containment inside the plot box, the anchor at (yr0, capOrig), the
// solid/dashed split at nowYear, survey/whisker placement, degenerate-input
// safety, and the accessible summary's measured/modeled wording.
import { describe, expect, it } from "vitest";
import { buildTrajectoryGeometry, type TrajectoryChartInput } from "../src/sediment/chartGeom";
import { M3_PER_ACFT } from "../src/sediment/types";

const BASE: TrajectoryChartInput = {
  name: "Tuttle Creek Dam",
  yr0: 1962,
  years: [1970, 1980, 1990, 2000, 2010, 2020, 2025, 2030, 2040, 2050],
  sedimentM3: [2e7, 5e7, 8e7, 1.1e8, 1.5e8, 1.9e8, 2.0e8, 2.2e8, 2.9e8, 3.5e8],
  capacityM3: [1.18e9, 1.15e9, 1.12e9, 1.09e9, 1.05e9, 1.01e9, 1.0e9, 9.8e8, 9.1e8, 8.5e8],
  surveys: [
    { year: 1970, capM3: 1.15e9 },
    { year: 2000, capM3: 1.05e9 },
    { year: 1985, capM3: null }, // must be dropped
  ],
  ci: [
    { year: 2025, capHi: 1.04e9, capLo: 9.6e8 },
    { year: 2050, capHi: 9.2e8, capLo: 7.8e8 },
  ],
};

const pathPoints = (d: string): Array<[number, number]> =>
  d
    .replace(/^M/, "")
    .split(" L")
    .map((p) => p.split(" ").map(Number) as [number, number]);

describe("buildTrajectoryGeometry", () => {
  const g = buildTrajectoryGeometry(BASE)!;

  it("keeps every emitted coordinate inside the plot box", () => {
    expect(g).not.toBeNull();
    const inPlot = ([x, y]: [number, number]) => {
      expect(x).toBeGreaterThanOrEqual(g.plot.x - 0.01);
      expect(x).toBeLessThanOrEqual(g.plot.x + g.plot.w + 0.01);
      expect(y).toBeGreaterThanOrEqual(g.plot.y - 0.01);
      expect(y).toBeLessThanOrEqual(g.plot.y + g.plot.h + 0.01);
    };
    for (const d of [g.capSolid, g.capDashed, g.sedSolid, g.sedDashed]) pathPoints(d).forEach(inPlot);
    g.surveyPts.forEach((p) => inPlot([p.x, p.y]));
    g.whiskers.forEach((w) => {
      inPlot([w.x, w.yLo]);
      inPlot([w.x, w.yHi]);
    });
  });

  it("anchors the capacity series at (yr0, capOrig) and marks the original line there", () => {
    const first = pathPoints(g.capSolid)[0];
    expect(first[0]).toBeCloseTo(g.plot.x, 1); // 1962 = left edge (no earlier survey)
    expect(first[1]).toBeCloseTo(g.originalY!, 1);
    // capacity point count: anchor + 10 grid years, split 8 past (≤2025) / 4 future (≥2025)
    expect(pathPoints(g.capSolid)).toHaveLength(8);
    expect(pathPoints(g.capDashed)).toHaveLength(4);
  });

  it("splits at nowYear with the boundary point shared", () => {
    const lastSolid = pathPoints(g.capSolid).at(-1)!;
    const firstDashed = pathPoints(g.capDashed)[0];
    expect(lastSolid).toEqual(firstDashed);
    expect(g.projectedX).toBeCloseTo(lastSolid[0], 1);
  });

  it("places survey dots at their measured values and drops null capacities", () => {
    expect(g.surveyPts).toHaveLength(2);
    const s1970 = g.surveyPts.find((p) => p.year === 1970)!;
    expect(s1970.acft).toBeCloseTo(1.15e9 / M3_PER_ACFT, 3);
    // 1970 model capacity ≈ 1.18e9? No — grid 1970 = 1.18e9? capacity[0]=1.18e9 at 1970;
    // the survey at the same year measured 1.15e9 → the dot must sit BELOW the line (larger y).
    const capAt1970 = pathPoints(g.capSolid)[1]; // [anchor, 1970, …]
    expect(s1970.y).toBeGreaterThan(capAt1970[1]);
  });

  it("emits whiskers only for complete CI pairs, with yHi above yLo", () => {
    expect(g.whiskers).toHaveLength(2);
    for (const w of g.whiskers) expect(w.yHi).toBeLessThan(w.yLo); // higher value = smaller y
  });

  it("summary text names the site and speaks measured/modeled language", () => {
    expect(g.summaryText).toContain("Tuttle Creek Dam");
    expect(g.summaryText).toContain("original capacity");
    expect(g.summaryText.toLowerCase()).toContain("modeled");
    expect(g.summaryText).toContain("2 measured surveys");
    expect(g.summaryText).toContain("% lost");
  });

  it("survives degenerate inputs without throwing", () => {
    expect(buildTrajectoryGeometry({ ...BASE, years: [], capacityM3: [], sedimentM3: [] })).toBeNull();
    expect(
      buildTrajectoryGeometry({ ...BASE, years: [2025], capacityM3: [0], sedimentM3: [0], surveys: [], ci: [] }),
    ).toBeNull(); // yMax 0
    const single = buildTrajectoryGeometry({
      ...BASE,
      yr0: 2020,
      years: [2025],
      capacityM3: [5e6],
      sedimentM3: [1e6],
      surveys: [],
      ci: [],
    });
    expect(single).not.toBeNull();
    expect(single!.capDashed).toBe(""); // nothing beyond nowYear
  });

  it("widens the x-domain to include surveys older than the model anchor", () => {
    const early = buildTrajectoryGeometry({
      ...BASE,
      surveys: [{ year: 1940, capM3: 1.19e9 }],
    })!;
    const dot = early.surveyPts[0];
    expect(dot.x).toBeCloseTo(early.plot.x, 1); // 1940 becomes the left edge
    const anchor = pathPoints(early.capSolid)[0];
    expect(anchor[0]).toBeGreaterThan(early.plot.x); // 1962 now sits inside
  });

  it("without plottable surveys the summary says so", () => {
    const g2 = buildTrajectoryGeometry({ ...BASE, surveys: [] })!;
    expect(g2.summaryText).toContain("No measured capacity points");
  });
});
