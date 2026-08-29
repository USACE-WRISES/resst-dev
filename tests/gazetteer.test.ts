// GNIS gazetteer machinery (src/map/gazetteer.ts): URL building, response
// parsing (point AND multipoint geometries, ArcGIS 200-with-error bodies),
// cross-layer merge/dedupe, and the prefix-then-contains search rounds with
// an injectable fetch (style of esriQuantized.test.ts).
import { describe, expect, it, vi } from "vitest";
import {
  buildPlaceQueryUrl,
  GNIS_LAYERS,
  mergePlaces,
  parsePlacesResponse,
  searchPlaces,
  type GazetteerPlace,
} from "../src/map/gazetteer";

const place = (id: number, name: string, over: Partial<GazetteerPlace> = {}): GazetteerPlace => ({
  id,
  name,
  featureClass: "Stream",
  classLabel: "Stream",
  state: "NE",
  county: "Platte",
  lon: -96,
  lat: 41,
  zoom: 10,
  ...over,
});

describe("buildPlaceQueryUrl", () => {
  it("builds a bounded prefix query with the expected params", () => {
    const url = new URL(buildPlaceQueryUrl(6, "platte", "prefix"));
    expect(url.pathname).toContain("/geonames/MapServer/6/query");
    const p = url.searchParams;
    expect(p.get("where")).toBe("UPPER(gaz_name) LIKE UPPER('platte%')");
    expect(p.get("outFields")).toBe("gaz_id,gaz_name,gaz_featureclass,state_alpha,county_name");
    expect(p.get("returnGeometry")).toBe("true");
    expect(p.get("outSR")).toBe("4326");
    expect(p.get("orderByFields")).toBe("gaz_name");
    expect(p.get("resultRecordCount")).toBe("6");
    expect(p.get("f")).toBe("json");
  });

  it("wraps contains queries in both wildcards and doubles apostrophes", () => {
    const p = new URL(buildPlaceQueryUrl(1, "O'Brien", "contains")).searchParams;
    expect(p.get("where")).toBe("UPPER(gaz_name) LIKE UPPER('%O''Brien%')");
  });
});

describe("parsePlacesResponse", () => {
  it("parses point and multipoint geometries and maps feature classes", () => {
    const parsed = parsePlacesResponse({
      features: [
        {
          attributes: { gaz_id: 1, gaz_name: "Platte City", gaz_featureclass: "Civil", state_alpha: "MO", county_name: "Platte" },
          geometry: { x: -94.79, y: 39.37 },
        },
        {
          attributes: { gaz_id: 2, gaz_name: "Platte River", gaz_featureclass: "Stream", state_alpha: "NE", county_name: "" },
          geometry: { points: [[-95.88, 41.05], [-96.0, 41.0]] },
        },
        {
          attributes: { gaz_id: 3, gaz_name: "Nowhere", gaz_featureclass: "Locale", state_alpha: "KS", county_name: "" },
          geometry: {},
        },
        {
          attributes: { gaz_id: 4, gaz_name: "Odd Place", gaz_featureclass: "Locale", state_alpha: "KS", county_name: "" },
          geometry: { x: -99.5, y: 38.5 },
        },
      ],
    });
    expect(parsed.map((p) => p.id)).toEqual([1, 2, 4]); // geometry-less feature skipped
    expect(parsed[0]).toMatchObject({ classLabel: "City", zoom: 11, state: "MO", county: "Platte" });
    expect(parsed[1]).toMatchObject({ classLabel: "Stream", zoom: 10, lon: -95.88, lat: 41.05 }); // first multipoint vertex
    expect(parsed[2]).toMatchObject({ classLabel: "Locale", zoom: 10 }); // unknown class → raw label, default zoom
  });

  it("throws on an ArcGIS 200-with-error body", () => {
    expect(() => parsePlacesResponse({ error: { code: 400, message: "Unable to complete operation." } })).toThrow(
      /ArcGIS error 400/,
    );
  });
});

describe("mergePlaces", () => {
  it("dedupes by gaz_id with layer priority, sorts by name, and caps", () => {
    const merged = mergePlaces(
      [
        [place(1, "Bravo", { classLabel: "City" })],
        [place(1, "Bravo", { classLabel: "Community" }), place(2, "alpha")],
        [place(3, "Charlie"), place(4, "Delta"), place(5, "Echo"), place(6, "Foxtrot"), place(7, "Golf")],
      ],
      6,
    );
    expect(merged.map((p) => p.name)).toEqual(["alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot"]);
    expect(merged.find((p) => p.id === 1)?.classLabel).toBe("City"); // earlier layer won
  });
});

describe("searchPlaces", () => {
  const ok = (features: unknown[]) => ({ ok: true, json: async () => ({ features }) });
  const feature = (id: number, name: string) => ({
    attributes: { gaz_id: id, gaz_name: name, gaz_featureclass: "Stream", state_alpha: "NE", county_name: "" },
    geometry: { x: -96, y: 41 },
  });

  it("fans out to every layer once when the prefix round hits", async () => {
    const impl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      return url.includes("/6/query") ? ok([feature(10, "Platte River")]) : ok([]);
    }) as unknown as typeof fetch;
    const out = await searchPlaces("platte", new AbortController().signal, impl);
    expect(out.map((p) => p.id)).toEqual([10]);
    expect(vi.mocked(impl)).toHaveBeenCalledTimes(GNIS_LAYERS.length);
    for (const call of vi.mocked(impl).mock.calls) {
      expect(String(call[0])).toContain("platte%25"); // encoded 'platte%' — prefix round only
    }
  });

  it("runs one contains round only when the prefix round is empty", async () => {
    const impl = vi.fn(async (input: RequestInfo | URL) => {
      const url = decodeURIComponent(String(input));
      return url.includes("'%big%'") ? ok([feature(20, "The Big River")]) : ok([]);
    }) as unknown as typeof fetch;
    const out = await searchPlaces("big", new AbortController().signal, impl);
    expect(out.map((p) => p.id)).toEqual([20]);
    expect(vi.mocked(impl)).toHaveBeenCalledTimes(GNIS_LAYERS.length * 2);
  });

  it("degrades on partial layer failure and rejects only when every layer fails", async () => {
    const partial = vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes("/1/query") ? Promise.reject(new Error("boom")) : ok([feature(30, "Salt Creek")]),
    ) as unknown as typeof fetch;
    const out = await searchPlaces("salt", new AbortController().signal, partial);
    expect(out.map((p) => p.id)).toEqual([30]);

    const allBad = vi.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    await expect(searchPlaces("salt", new AbortController().signal, allBad)).rejects.toThrow("offline");
  });

  it("rejects with AbortError when the signal aborts mid-flight", async () => {
    const controller = new AbortController();
    const impl = vi.fn(async () => {
      controller.abort();
      return ok([]);
    }) as unknown as typeof fetch;
    await expect(searchPlaces("x", controller.signal, impl)).rejects.toMatchObject({ name: "AbortError" });
  });
});
