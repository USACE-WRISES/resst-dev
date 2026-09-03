// Basemap registry and the MapLibre styles kept for the diagnostics benchmark
// and the report figure (src/map/basemaps.ts): the persisted choice, the USGS
// style, the fix-ups that make Esri's published style loadable, and the
// style fetch cache. NOTE: the module keeps a style cache, so the fetch
// failure test must run BEFORE anything caches a successful fetch — the last
// block is order-dependent by design.
import { describe, expect, it, vi } from "vitest";
import type { StyleSpecification } from "maplibre-gl";
import {
  buildUsgsStyle,
  fetchEsriTopoStyle,
  fixupEsriStyle,
  USGS_TOPO_ATTRIBUTION,
  USGS_TOPO_TILES,
} from "../src/map/basemaps";
import { actions, DEFAULT_BASEMAP, parseBasemapId, subscribe } from "../src/state/store";

// Miniature stand-in for Esri's root.json: a VectorTileServer source `url`
// (not TileJSON), a sprite path containing "/../", and a layer named like one
// of the app's old MapLibre layers (kept as is: nothing composes over the
// diagnostics style any more).
const RAW_ESRI: StyleSpecification = {
  version: 8,
  sprite: "https://cdn.example.com/items/abc/resources/styles/../sprites/sprite",
  glyphs: "https://tiles.example.com/VTS/resources/fonts/{fontstack}/{range}.pbf",
  sources: {
    esri: { type: "vector", url: "https://tiles.example.com/VTS" },
    already: { type: "vector", url: "https://tiles.example.com/other", tiles: ["https://tiles.example.com/t/{z}"] },
  },
  layers: [
    { id: "Land/Not ice", type: "fill", source: "esri", "source-layer": "Land", paint: { "fill-opacity": 0.3 } },
    { id: "sites-circles", type: "fill", source: "esri", "source-layer": "B" },
    { id: "Cities", type: "symbol", source: "esri", "source-layer": "City", layout: {} },
  ],
};

describe("parseBasemapId", () => {
  it("accepts known ids and falls back to the esri default", () => {
    expect(DEFAULT_BASEMAP).toBe("esri");
    expect(parseBasemapId("esri")).toBe("esri");
    expect(parseBasemapId("usgs")).toBe("usgs");
    expect(parseBasemapId("mars")).toBe(DEFAULT_BASEMAP);
    expect(parseBasemapId(null)).toBe(DEFAULT_BASEMAP);
  });
});

describe("setBasemap", () => {
  it("ignores a set to the already-active id", () => {
    let emits = 0;
    const unsubscribe = subscribe(() => {
      emits += 1;
    });
    actions.setBasemap("esri"); // the boot default is already active — no emit, no storage write
    expect(emits).toBe(0);
    actions.setBasemap("usgs");
    expect(emits).toBe(1);
    actions.setBasemap("esri"); // leave the store on the default for later tests
    expect(emits).toBe(2);
    unsubscribe();
  });
});

describe("buildUsgsStyle", () => {
  it("builds the raster style with the given glyph endpoint", () => {
    const s = buildUsgsStyle("glyphs://x/{fontstack}/{range}.pbf");
    expect(s.glyphs).toBe("glyphs://x/{fontstack}/{range}.pbf");
    expect(Object.keys(s.sources)).toEqual(["usgsTopo"]);
    expect(s.layers.map((l) => l.id)).toEqual(["background", "usgs-topo"]);
  });

  it("draws its tiles from the shared USGS definition the diagnostics trial also uses", () => {
    const src = buildUsgsStyle("glyphs://x/{fontstack}/{range}.pbf").sources.usgsTopo as {
      tiles: string[];
      attribution: string;
    };
    expect(src.tiles).toEqual([USGS_TOPO_TILES]);
    expect(src.attribution).toBe(USGS_TOPO_ATTRIBUTION);
    expect(USGS_TOPO_TILES).toMatch(/^https:\/\/basemap\.nationalmap\.gov\/.*\{z\}\/\{y\}\/\{x\}$/);
  });
});

describe("fixupEsriStyle", () => {
  const fixed = fixupEsriStyle(RAW_ESRI);

  it("rewrites the VectorTileServer url to an explicit tiles template", () => {
    const esri = fixed.sources.esri;
    expect(esri).toMatchObject({
      type: "vector",
      tiles: ["https://tiles.example.com/VTS/tile/{z}/{y}/{x}.pbf"],
      maxzoom: 22,
    });
    expect("url" in esri).toBe(false);
    expect((esri as { attribution?: string }).attribution).toContain("Powered by Esri");
    // A source that already has tiles is left alone.
    expect(fixed.sources.already).toEqual(RAW_ESRI.sources.already);
  });

  it("normalizes the dot-segment sprite URL", () => {
    expect(fixed.sprite).toBe("https://cdn.example.com/items/abc/resources/sprites/sprite");
  });

  it("prepends background + hillshade and keeps the style's own layers", () => {
    expect(fixed.layers.map((l) => l.id)).toEqual(["background", "esri-hillshade", "Land/Not ice", "sites-circles", "Cities"]);
    expect(fixed.sources["esri-hillshade"]).toMatchObject({ type: "raster", tileSize: 256 });
  });

  it("does not mutate its input", () => {
    expect(RAW_ESRI.layers.map((l) => l.id)).toEqual(["Land/Not ice", "sites-circles", "Cities"]);
    expect(RAW_ESRI.sprite).toContain("/../");
    expect((RAW_ESRI.sources.esri as { url?: string }).url).toBe("https://tiles.example.com/VTS");
  });
});

describe("fetchEsriTopoStyle (order-dependent: failure first)", () => {
  it("clears a failed fetch from the cache so a retry can succeed, then caches", async () => {
    const bad = vi.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    await expect(fetchEsriTopoStyle(bad)).rejects.toThrow("offline");
    const good = vi.fn(async () => ({ ok: true, json: async () => RAW_ESRI })) as unknown as typeof fetch;
    const first = await fetchEsriTopoStyle(good);
    expect(first.layers[1].id).toBe("esri-hillshade");
    // Third call returns the cache — neither impl is consulted again.
    const second = await fetchEsriTopoStyle(bad);
    expect(second).toBe(first);
    expect(vi.mocked(bad)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(good)).toHaveBeenCalledTimes(1);
  });
});
