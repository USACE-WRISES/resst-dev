// Basemap machinery (src/map/basemaps.ts): the fix-ups that make Esri's
// published style loadable by MapLibre, the merge that carries app layers
// across a style swap, and the fetch cache/failure behavior. NOTE: the
// module keeps a style cache, so the applyBasemap failure test must run
// BEFORE anything caches a successful fetch — the `it` blocks in this file
// are order-dependent by design.
import { describe, expect, it, vi } from "vitest";
import type { StyleSpecification } from "maplibre-gl";
import {
  applyBasemap,
  buildUsgsStyle,
  fetchEsriTopoStyle,
  fixupEsriStyle,
  mergeAppLayers,
} from "../src/map/basemaps";
import { actions, DEFAULT_BASEMAP, getState, parseBasemapId, subscribe } from "../src/state/store";

// Miniature stand-in for Esri's root.json: a VectorTileServer source `url`
// (not TileJSON), a sprite path containing "/../", and a layer id that
// collides with an app id.
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

const POINT = {
  type: "Feature" as const,
  geometry: { type: "Point" as const, coordinates: [-96.59, 39.26] },
  properties: { site_id: "1" },
};

const PREV_USGS_WITH_APP: StyleSpecification = {
  version: 8,
  glyphs: "self://fonts/{fontstack}/{range}.pbf",
  sources: {
    usgsTopo: { type: "raster", tiles: ["https://usgs.example.com/{z}/{y}/{x}"], tileSize: 256 },
    sites: { type: "geojson", data: { type: "FeatureCollection", features: [POINT] } },
    "ov-huc2": { type: "geojson", data: { type: "FeatureCollection", features: [POINT] } },
  },
  layers: [
    { id: "background", type: "background", paint: { "background-color": "#eee" } },
    { id: "usgs-topo", type: "raster", source: "usgsTopo" },
    { id: "ov-huc2-layer", type: "line", source: "ov-huc2" },
    { id: "sites-circles", type: "circle", source: "sites" },
    { id: "sites-selected", type: "circle", source: "sites" },
    { id: "sites-labels", type: "symbol", source: "sites", layout: {} },
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

describe("revertBasemap", () => {
  it("changes state without persisting and forgets the stored choice", () => {
    const ls = { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn() };
    vi.stubGlobal("localStorage", ls);
    expect(getState().basemap).toBe("esri"); // the boot default
    actions.revertBasemap("usgs");
    expect(getState().basemap).toBe("usgs");
    expect(ls.removeItem).toHaveBeenCalledWith("resst.basemap");
    expect(ls.setItem).not.toHaveBeenCalled(); // the revert is never persisted
    actions.setBasemap("esri"); // restore the default for later tests
    vi.unstubAllGlobals();
  });
});

describe("buildUsgsStyle", () => {
  it("builds the raster style with the given glyph endpoint", () => {
    const s = buildUsgsStyle("glyphs://x/{fontstack}/{range}.pbf");
    expect(s.glyphs).toBe("glyphs://x/{fontstack}/{range}.pbf");
    expect(Object.keys(s.sources)).toEqual(["usgsTopo"]);
    expect(s.layers.map((l) => l.id)).toEqual(["background", "usgs-topo"]);
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

  it("prepends background + hillshade and renames colliding layer ids", () => {
    expect(fixed.layers.map((l) => l.id)).toEqual([
      "background",
      "esri-hillshade",
      "Land/Not ice",
      "esri-basemap:sites-circles", // renamed OUT of the app-layer namespace
      "Cities",
    ]);
    expect(fixed.sources["esri-hillshade"]).toMatchObject({ type: "raster", tileSize: 256 });
  });

  it("does not mutate its input", () => {
    expect(RAW_ESRI.layers.map((l) => l.id)).toEqual(["Land/Not ice", "sites-circles", "Cities"]);
    expect(RAW_ESRI.sprite).toContain("/../");
    expect((RAW_ESRI.sources.esri as { url?: string }).url).toBe("https://tiles.example.com/VTS");
  });
});

describe("mergeAppLayers", () => {
  const fixed = fixupEsriStyle(RAW_ESRI);

  it("carries app sources (with data) and app layers onto the next style", () => {
    const merged = mergeAppLayers(PREV_USGS_WITH_APP, fixed);
    expect(Object.keys(merged.sources).sort()).toEqual(["already", "esri", "esri-hillshade", "ov-huc2", "sites"]);
    const sites = merged.sources.sites as { data: { features: unknown[] } };
    expect(sites.data.features).toHaveLength(1);
    expect(merged.layers.map((l) => l.id)).toEqual([
      ...fixed.layers.map((l) => l.id),
      "ov-huc2-layer",
      "sites-circles",
      "sites-selected",
      "sites-labels",
    ]);
    // The next style's glyphs/sprite win (Esri fonts serve Noto Sans Regular).
    expect(merged.glyphs).toBe(fixed.glyphs);
    expect(merged.sprite).toBe(fixed.sprite);
  });

  it("carries the network (nw-) and national (nat-) layers across swaps", () => {
    // The failure mode is silent — layers simply vanish on a basemap toggle —
    // so the prefix predicates get their own case.
    const prev: StyleSpecification = {
      ...PREV_USGS_WITH_APP,
      sources: {
        ...PREV_USGS_WITH_APP.sources,
        "nw-net": { type: "geojson", data: { type: "FeatureCollection", features: [POINT] } },
        "nat-reservoirs": { type: "geojson", data: { type: "FeatureCollection", features: [POINT] } },
      },
      layers: [
        ...PREV_USGS_WITH_APP.layers,
        { id: "nw-up", type: "circle", source: "nw-net" },
        { id: "nat-circles", type: "circle", source: "nat-reservoirs" },
      ],
    };
    const merged = mergeAppLayers(prev, fixed);
    expect(Object.keys(merged.sources)).toEqual(expect.arrayContaining(["nw-net", "nat-reservoirs"]));
    const ids = merged.layers.map((l) => l.id);
    expect(ids).toEqual(expect.arrayContaining(["nw-up", "nat-circles"]));
    // Relative order among app layers is preserved (nw/nat after the sites stack).
    expect(ids.indexOf("nw-up")).toBeGreaterThan(ids.indexOf("sites-labels"));
  });

  it("swaps back to a sprite-less style cleanly", () => {
    const onEsri = mergeAppLayers(PREV_USGS_WITH_APP, fixed);
    const back = mergeAppLayers(onEsri, buildUsgsStyle("self://fonts/{fontstack}/{range}.pbf"));
    expect(back.sprite).toBeUndefined();
    expect(Object.keys(back.sources).sort()).toEqual(["ov-huc2", "sites", "usgsTopo"]);
    expect(back.layers.map((l) => l.id)).toEqual([
      "background",
      "usgs-topo",
      "ov-huc2-layer",
      "sites-circles",
      "sites-selected",
      "sites-labels",
    ]);
  });

  it("returns the next style untouched when there is no previous style", () => {
    expect(mergeAppLayers(undefined, fixed)).toBe(fixed);
  });
});

describe("applyBasemap + fetchEsriTopoStyle (order-dependent: failure first)", () => {
  it("reverts to USGS un-persisted with an error status when the style cannot load", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const ls = { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn() };
    vi.stubGlobal("localStorage", ls);
    actions.setBasemap("esri"); // already the default — no-op, no storage write
    const setStyle = vi.fn();
    const bad = vi.fn(async () => ({ ok: false, status: 503 })) as unknown as typeof fetch;
    await applyBasemap({ setStyle } as unknown as Parameters<typeof applyBasemap>[0], "esri", bad);
    expect(setStyle).not.toHaveBeenCalled();
    expect(getState().basemap).toBe("usgs"); // reverted to the fallback…
    expect(ls.removeItem).toHaveBeenCalledWith("resst.basemap"); // …and the stored choice forgotten
    expect(ls.setItem).not.toHaveBeenCalled(); // a transient failure must not pin "usgs"
    expect(getState().basemapStatus).toBe("error");
    actions.setBasemapStatus(null);
    vi.unstubAllGlobals();
    warn.mockRestore();
  });

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

  it("applies the Esri style through the merge and clears the status", async () => {
    actions.setBasemap("esri");
    const setStyle = vi.fn();
    await applyBasemap({ setStyle } as unknown as Parameters<typeof applyBasemap>[0], "esri");
    expect(setStyle).toHaveBeenCalledTimes(1);
    const [style, opts] = setStyle.mock.calls[0] as [StyleSpecification, { transformStyle: unknown }];
    expect(style.layers[1].id).toBe("esri-hillshade");
    expect(opts.transformStyle).toBe(mergeAppLayers);
    expect(getState().basemapStatus).toBeNull();
    // The store ends on "esri" — the default — for any later block.
  });

  it("applies the USGS style synchronously", async () => {
    const setStyle = vi.fn();
    await applyBasemap({ setStyle } as unknown as Parameters<typeof applyBasemap>[0], "usgs");
    const [style, opts] = setStyle.mock.calls[0] as [StyleSpecification, { transformStyle: unknown }];
    expect(style.layers.map((l) => l.id)).toEqual(["background", "usgs-topo"]);
    expect(opts.transformStyle).toBe(mergeAppLayers);
  });
});
