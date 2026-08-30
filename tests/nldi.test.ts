// USGS NLDI drainage-basin fetch: URL shapes, response parsing, and the bbox
// helper — fetch mocked, no network.
import { afterEach, describe, expect, it, vi } from "vitest";
import { basinBounds, fetchBasin, type BasinFeature } from "../src/sediment/nldi";

const square: BasinFeature = {
  type: "Feature",
  properties: {},
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [-97, 39],
        [-96, 39],
        [-96, 40],
        [-97, 40],
        [-97, 39],
      ],
    ],
  },
};

describe("fetchBasin", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("chains position lookup to comid to basin and returns the polygon feature", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", (url: unknown) => {
      calls.push(String(url));
      const body = String(url).includes("/position")
        ? { features: [{ properties: { comid: 2279311 } }] }
        : { features: [square] };
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
    });
    const feat = await fetchBasin(-96.6, 39.25);
    expect(feat.geometry.type).toBe("Polygon");
    expect(calls[0]).toBe("https://api.water.usgs.gov/nldi/linked-data/comid/position?coords=POINT(-96.6%2039.25)");
    expect(calls[1]).toBe("https://api.water.usgs.gov/nldi/linked-data/comid/2279311/basin?simplified=true");
  });

  it("throws on a position miss, a missing polygon, and a non-OK response", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(new Response(JSON.stringify({ features: [] }), { status: 200 })));
    await expect(fetchBasin(0, 0)).rejects.toThrow("no flowline");
    vi.stubGlobal("fetch", (url: unknown) => {
      const body = String(url).includes("/position")
        ? { features: [{ properties: { comid: 5 } }] }
        : { features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [0, 0] } }] };
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
    });
    await expect(fetchBasin(0, 0)).rejects.toThrow("no basin polygon");
    vi.stubGlobal("fetch", () => Promise.resolve(new Response("nope", { status: 503 })));
    await expect(fetchBasin(0, 0)).rejects.toThrow("NLDI 503");
  });
});

describe("basinBounds", () => {
  it("returns the [southwest, northeast] corners of a Polygon", () => {
    expect(basinBounds(square)).toEqual([
      [-97, 39],
      [-96, 40],
    ]);
  });

  it("spans every polygon of a MultiPolygon", () => {
    const multi: BasinFeature = {
      type: "Feature",
      properties: {},
      geometry: {
        type: "MultiPolygon",
        coordinates: [
          [
            [
              [-97, 39],
              [-96.5, 39],
              [-96.5, 39.5],
              [-97, 39],
            ],
          ],
          [
            [
              [-96.2, 39.8],
              [-96, 39.8],
              [-96, 40],
              [-96.2, 40],
            ],
          ],
        ],
      },
    };
    expect(basinBounds(multi)).toEqual([
      [-97, 39],
      [-96, 40],
    ]);
  });
});
