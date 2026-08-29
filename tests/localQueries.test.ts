// Local snapshot lookups for the Select tools (src/map/localQueries.ts).
import { describe, expect, it } from "vitest";
import type { Feature, FeatureCollection } from "geojson";
import { buildHucIndex, findHucAt, ringsOfFeature, riverPartsByName, wrapLon } from "../src/map/localQueries";

const OUTER = [
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 10],
  [0, 0],
];
const HOLE = [
  [4, 4],
  [6, 4],
  [6, 6],
  [4, 6],
  [4, 4],
];

const polygon = (props: Record<string, unknown>, coords: number[][][]): Feature => ({
  type: "Feature",
  properties: props,
  geometry: { type: "Polygon", coordinates: coords as never },
});

describe("ringsOfFeature", () => {
  it("passes Polygon rings through and flattens MultiPolygon parts", () => {
    expect(ringsOfFeature(polygon({}, [OUTER, HOLE]))).toHaveLength(2);
    const multi: Feature = {
      type: "Feature",
      properties: {},
      geometry: {
        type: "MultiPolygon",
        coordinates: [[OUTER], [HOLE.map(([x, y]) => [x + 20, y])]] as never,
      },
    };
    expect(ringsOfFeature(multi)).toHaveLength(2);
  });

  it("returns no rings for non-polygon geometry", () => {
    const line: Feature = {
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: [[0, 0], [1, 1]] },
    };
    expect(ringsOfFeature(line)).toEqual([]);
  });
});

describe("buildHucIndex / findHucAt", () => {
  const fc: FeatureCollection = {
    type: "FeatureCollection",
    features: [
      polygon({ huc4: "1027", name: "Kansas" }, [OUTER, HOLE]),
      polygon({ huc4: "1028", name: "Neighbor" }, [OUTER.map(([x, y]) => [x + 20, y])]),
    ],
  };
  const index = buildHucIndex(fc, "huc4");

  it("carries id, name, rings, and bbox per feature", () => {
    expect(index).toHaveLength(2);
    expect(index[0]).toMatchObject({ id: "1027", name: "Kansas" });
    expect(index[0].rings).toHaveLength(2);
    expect(index[0].bbox).toEqual([0, 0, 10, 10]);
  });

  it("skips features without polygon geometry", () => {
    const withLine: FeatureCollection = {
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: { huc4: "x" }, geometry: { type: "Point", coordinates: [0, 0] } },
        ...fc.features,
      ],
    };
    expect(buildHucIndex(withLine, "huc4")).toHaveLength(2);
  });

  it("finds the containing basin, honoring holes and the bbox precheck", () => {
    expect(findHucAt(index, [2, 2])!.id).toBe("1027");
    expect(findHucAt(index, [22, 5])!.id).toBe("1028");
    expect(findHucAt(index, [5, 5])).toBeNull(); // inside the hole
    expect(findHucAt(index, [50, 50])).toBeNull(); // outside everything
  });

  it("bbox precheck must not over-accept (inside bbox, outside polygon)", () => {
    const triangle = polygon({ huc4: "tri", name: "Triangle" }, [
      [
        [0, 0],
        [10, 0],
        [0, 10],
        [0, 0],
      ],
    ]);
    const idx = buildHucIndex({ type: "FeatureCollection", features: [triangle] }, "huc4");
    expect(findHucAt(idx, [9, 9])).toBeNull(); // in the bbox corner, not the triangle
    expect(findHucAt(idx, [2, 2])!.id).toBe("tri");
  });

  it("first entry wins on overlap (shared-edge rule)", () => {
    const twice: FeatureCollection = {
      type: "FeatureCollection",
      features: [polygon({ huc4: "first" }, [OUTER]), polygon({ huc4: "second" }, [OUTER])],
    };
    expect(findHucAt(buildHucIndex(twice, "huc4"), [2, 2])!.id).toBe("first");
  });
});

describe("riverPartsByName", () => {
  const fc: FeatureCollection = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { NameEn: "Test River" },
        geometry: { type: "MultiLineString", coordinates: [[[0, 0], [1, 0]], [[2, 0], [3, 0]]] },
      },
      {
        type: "Feature",
        properties: { NameEn: " Test River " }, // padded — trimmed match
        geometry: { type: "LineString", coordinates: [[4, 0], [5, 0]] },
      },
      {
        type: "Feature",
        properties: { NameEn: "Other" },
        geometry: { type: "MultiLineString", coordinates: [[[9, 9], [9, 8]]] },
      },
    ],
  };

  it("flattens every matching feature's parts", () => {
    expect(riverPartsByName(fc, "Test River")).toHaveLength(3);
  });

  it("returns nothing for an unknown name", () => {
    expect(riverPartsByName(fc, "Nope")).toEqual([]);
  });
});

describe("wrapLon", () => {
  it("normalizes wrapped-world longitudes into [-180, 180)", () => {
    expect(wrapLon(185)).toBe(-175);
    expect(wrapLon(-190)).toBe(170);
    expect(wrapLon(0)).toBe(0);
    expect(wrapLon(-96.55 + 360)).toBeCloseTo(-96.55, 10);
  });
});
