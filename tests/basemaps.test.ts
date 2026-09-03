// Basemap registry and the MapLibre style kept for the report figure
// (src/map/basemaps.ts): the persisted choice and the USGS style.
import { describe, expect, it } from "vitest";
import { buildUsgsStyle, USGS_TOPO_ATTRIBUTION, USGS_TOPO_TILES } from "../src/map/basemaps";
import { actions, DEFAULT_BASEMAP, parseBasemapId, subscribe } from "../src/state/store";

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

  it("draws its tiles from the shared USGS definition the Leaflet map also uses", () => {
    const src = buildUsgsStyle("glyphs://x/{fontstack}/{range}.pbf").sources.usgsTopo as {
      tiles: string[];
      attribution: string;
    };
    expect(src.tiles).toEqual([USGS_TOPO_TILES]);
    expect(src.attribution).toBe(USGS_TOPO_ATTRIBUTION);
    expect(USGS_TOPO_TILES).toMatch(/^https:\/\/basemap\.nationalmap\.gov\/.*\{z\}\/\{y\}\/\{x\}$/);
  });
});
