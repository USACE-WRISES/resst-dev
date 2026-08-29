// The live-points fetcher (src/map/esriPoints.ts) — the surviving path of
// the old quantized module after the boundary/line overlays went static.
import { describe, expect, it, vi } from "vitest";
import { clampBounds, fetchGeojsonPoints } from "../src/map/esriPoints";

const bounds = { west: -125, south: 24, east: -66, north: 50 };
const signal = new AbortController().signal;
const feature = (n: number) => ({
  type: "Feature",
  properties: { id: n },
  geometry: { type: "Point", coordinates: [n, n] },
});

describe("clampBounds", () => {
  it("clamps out-of-range world bounds", () => {
    expect(clampBounds({ west: -260, south: -88, east: 260, north: 88 })).toEqual({
      west: -180,
      south: -85,
      east: 180,
      north: 85,
    });
    expect(clampBounds(bounds)).toEqual(bounds);
  });
});

describe("fetchGeojsonPoints", () => {
  it("pages sequentially by resultOffset until a short page and concatenates", async () => {
    // Server clamps to 2 per page despite the requested 4 — offsets must
    // advance by the ACTUAL counts: 0, 2, 3.
    const pageFor = (offset: number) =>
      offset === 0
        ? { type: "FeatureCollection", features: [feature(1), feature(2)], exceededTransferLimit: true }
        : offset === 2
          ? { type: "FeatureCollection", features: [feature(3)], exceededTransferLimit: false }
          : { type: "FeatureCollection", features: [] };
    const fetchImpl = vi.fn(async (url: unknown) => {
      const qs = new URLSearchParams(String(url).split("?")[1]);
      expect(qs.get("f")).toBe("geojson");
      expect(qs.get("geometryType")).toBe("esriGeometryEnvelope");
      return { ok: true, json: async () => pageFor(Number(qs.get("resultOffset"))) };
    }) as unknown as typeof fetch;
    const fc = await fetchGeojsonPoints("https://x/FeatureServer/0", "id", bounds, signal, fetchImpl, 4);
    expect(fc.features).toHaveLength(3);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("sends clamped bounds in the query envelope", async () => {
    const fetchImpl = vi.fn(async (url: unknown) => {
      const qs = new URLSearchParams(String(url).split("?")[1]);
      expect(qs.get("geometry")).toBe("-180,-85,180,85");
      return { ok: true, json: async () => ({ type: "FeatureCollection", features: [] }) };
    }) as unknown as typeof fetch;
    await fetchGeojsonPoints("https://x/f/0", "*", { west: -260, south: -88, east: 260, north: 88 }, signal, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("throws on ArcGIS 200-with-error bodies and on HTTP failures", async () => {
    const errBody = vi.fn(async () => ({ ok: true, json: async () => ({ error: { message: "bad field" } }) })) as unknown as typeof fetch;
    await expect(fetchGeojsonPoints("https://x/f/0", "*", bounds, signal, errBody)).rejects.toThrow(/ArcGIS: bad field/);
    const http500 = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })) as unknown as typeof fetch;
    await expect(fetchGeojsonPoints("https://x/f/0", "*", bounds, signal, http500)).rejects.toThrow(/HTTP 500/);
  });
});
