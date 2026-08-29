// The quantized-query decoder is pure math ported from measured ArcGIS
// behavior (see src/map/esriQuantized.ts). The fixture coordinates encode the
// exact upperLeft/delta semantics verified against a live service response.
import { describe, expect, it, vi } from "vitest";
import {
  dequantizePage,
  fetchQuantizedMultiLine,
  quantizationTolerance,
  type EsriQuantizedPage,
} from "../src/map/esriQuantized";

const TRANSFORM = {
  originPosition: "upperLeft" as const,
  scale: [0.05, 0.05] as [number, number],
  translate: [-125, 50] as [number, number],
};

describe("dequantizePage", () => {
  it("decodes delta-encoded rings with the upperLeft y-flip and skips collapsed vertices", () => {
    const page: EsriQuantizedPage = {
      transform: TRANSFORM,
      features: [
        {
          attributes: { huc2: "10", name: "Missouri" },
          // vertex 0 absolute (100,20); then deltas, including a (0,0) collapsed one
          geometry: { rings: [[[100, 20], [10, 0], [0, 0], [0, 10], [-10, 0], [0, -10]]] },
        },
        {
          attributes: { huc2: "99" },
          // collapses to a single point -> the whole feature is dropped
          geometry: { rings: [[[5, 5], [0, 0]]] },
        },
      ],
    };
    const out = dequantizePage(page);
    expect(out).toHaveLength(1);
    expect(out[0].properties).toEqual({ huc2: "10", name: "Missouri" });
    // The expected latitudes (49 above 48.5) prove the minus in the y decode.
    expect(out[0].geometry.coordinates).toEqual([
      [
        [-120, 49],
        [-119.5, 49],
        [-119.5, 48.5],
        [-120, 48.5],
        [-120, 49],
      ],
    ]);
  });

  it("decodes paths without forcing closure", () => {
    const page: EsriQuantizedPage = {
      transform: TRANSFORM,
      features: [{ attributes: {}, geometry: { paths: [[[0, 0], [10, 0]]] } }],
    };
    const out = dequantizePage(page);
    expect(out[0].geometry.coordinates).toEqual([
      [
        [-125, 50],
        [-124.5, 50],
      ],
    ]);
  });

  it("treats a page without a transform as absolute coordinates", () => {
    const page: EsriQuantizedPage = {
      features: [{ attributes: {}, geometry: { paths: [[[1, 2], [3, 4]]] } }],
    };
    expect(dequantizePage(page)[0].geometry.coordinates).toEqual([
      [
        [1, 2],
        [3, 4],
      ],
    ]);
  });
});

describe("quantizationTolerance", () => {
  it("reproduces the measured-good tolerance at the CONUS fit", () => {
    // 0.05 was the verified value (202 KB vs 52 MB for HUC2 across CONUS).
    expect(quantizationTolerance(3.33, 46.6)).toBeGreaterThan(0.046);
    expect(quantizationTolerance(3.33, 46.6)).toBeLessThan(0.05);
  });
  it("tightens as zoom increases", () => {
    expect(quantizationTolerance(10, 40)).toBeLessThan(quantizationTolerance(3, 40));
  });
});

describe("fetchQuantizedMultiLine", () => {
  const bounds = { west: -125, south: 24, east: -66, north: 50 };
  const signal = new AbortController().signal;
  const feature = (n: number) => ({
    attributes: { id: n },
    geometry: { paths: [[[n, n], [1, 0]]] },
  });

  it("pages in parallel using the ACTUAL first-page count as the stride", async () => {
    // Simulates the HUC8 case: the server clamps below the requested page
    // size (2 instead of 4), so follow-up offsets must be 2,4,6,8 — not 4,8….
    const pageFor = (offset: number): EsriQuantizedPage =>
      offset === 0
        ? { transform: TRANSFORM, features: [feature(1), feature(2)], exceededTransferLimit: true }
        : offset === 2
          ? { transform: TRANSFORM, features: [feature(3)], exceededTransferLimit: false }
          : { features: [], exceededTransferLimit: false };
    const fetchImpl = vi.fn(async (url: unknown) => {
      const qs = new URLSearchParams(String(url).split("?")[1]);
      expect(qs.get("f")).toBe("json");
      expect(qs.get("quantizationParameters")).toContain("upperLeft");
      return { ok: true, json: async () => pageFor(Number(qs.get("resultOffset"))) };
    }) as unknown as typeof fetch;
    const fc = await fetchQuantizedMultiLine("https://x/FeatureServer/0", "id", bounds, 4, signal, fetchImpl, 4);
    expect(fc.features).toHaveLength(3);
    // 1 sequential first page + 4 parallel follow-ups (MAX_PAGES = 5).
    expect(fetchImpl).toHaveBeenCalledTimes(5);
    const offsets = (fetchImpl as unknown as { mock: { calls: [unknown][] } }).mock.calls
      .map((c) => Number(new URLSearchParams(String(c[0]).split("?")[1]).get("resultOffset")))
      .sort((a, b2) => a - b2);
    expect(offsets).toEqual([0, 2, 4, 6, 8]);
  });

  it("clamps out-of-range world bounds before querying", async () => {
    const fetchImpl = vi.fn(async (url: unknown) => {
      const qs = new URLSearchParams(String(url).split("?")[1]);
      expect(qs.get("geometry")).toBe("-180,-85,180,85");
      return { ok: true, json: async () => ({ features: [], exceededTransferLimit: false }) };
    }) as unknown as typeof fetch;
    await fetchQuantizedMultiLine(
      "https://x/FeatureServer/0",
      "*",
      { west: -260, south: -88, east: 260, north: 88 },
      2,
      signal,
      fetchImpl,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("throws on an ArcGIS 200-with-error body", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ error: { code: 400, message: "Invalid query" } }),
    })) as unknown as typeof fetch;
    await expect(
      fetchQuantizedMultiLine("https://x/FeatureServer/0", "*", bounds, 4, signal, fetchImpl),
    ).rejects.toThrow(/ArcGIS 400/);
  });
});
