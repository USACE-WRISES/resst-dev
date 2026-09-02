// The box-select hit test shared by both map engines (src/map/sitesInScreenBox.ts).
// It replaces MapLibre's queryRenderedFeatures, so the cases pin the exact
// geometry that call had: disc distance to the box edge with the marker's
// outer radius, either corner order, and the ±360° longitude retry.
import { describe, expect, it } from "vitest";
import type { Site } from "../src/lib/types";
import { SITE_HIT_RADIUS_PX, sitesInScreenBox } from "../src/map/sitesInScreenBox";

// lon/lat used directly as pixels, so the numbers below are screen positions.
const project = ([x, y]: [number, number]) => ({ x, y });
const site = (site_id: string, longitude: number | null, latitude: number | null) =>
  ({ site_id, longitude, latitude }) as Site;
const box: [[number, number], [number, number]] = [
  [100, 100],
  [200, 200],
];

describe("sitesInScreenBox", () => {
  it("selects centres inside and within the outer radius of an edge, not beyond", () => {
    const sites = [site("in", 150, 150), site("edge", 206.5, 150), site("beyond", 206.6, 150), site("top", 150, 93.5)];
    expect(sitesInScreenBox(sites, project, ...box)).toEqual(["in", "edge", "top"]);
  });

  it("uses disc distance at the corners, not a grown box", () => {
    // 6.36 px diagonal vs 7.07 px diagonal from the (200,200) corner.
    const sites = [site("diag-in", 204.5, 204.5), site("diag-out", 205, 205)];
    expect(sitesInScreenBox(sites, project, ...box)).toEqual(["diag-in"]);
  });

  it("treats a zero-size box (a plain click) as hitting the marker under the pointer", () => {
    expect(sitesInScreenBox([site("a", 150, 150)], project, [153, 154], [153, 154])).toEqual(["a"]);
    expect(sitesInScreenBox([site("a", 150, 150)], project, [160, 150], [160, 150])).toEqual([]);
  });

  it("accepts either corner order", () => {
    expect(sitesInScreenBox([site("a", 150, 150)], project, [200, 200], [100, 100])).toEqual(["a"]);
  });

  it("skips sites without coordinates", () => {
    expect(sitesInScreenBox([site("n", null, 150), site("m", 150, null)], project, ...box)).toEqual([]);
  });

  it("retries at lon ± 360 for markers drawn on a wrapped world copy", () => {
    expect(sitesInScreenBox([site("ak", -170, 150)], project, [185, 145], [195, 155])).toEqual(["ak"]);
    expect(sitesInScreenBox([site("gu", 170, 150)], project, [-195, 145], [-185, 155])).toEqual(["gu"]);
  });

  it("returns ids in site order and honours a custom slack", () => {
    const sites = [site("b", 203, 150), site("a", 150, 150)];
    expect(sitesInScreenBox(sites, project, ...box, 0)).toEqual(["a"]);
    expect(sitesInScreenBox(sites, project, ...box, 3)).toEqual(["b", "a"]);
    expect(SITE_HIT_RADIUS_PX).toBe(6.5);
  });
});
