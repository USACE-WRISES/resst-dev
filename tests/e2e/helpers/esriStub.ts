// Shared Esri-endpoint interception + basemap readiness for the e2e suite.
// With Esri Topo as the DEFAULT basemap (src/map/basemaps.ts), every spec's
// boot reaches cdn.arcgis.com / basemaps.arcgis.com / services.arcgisonline.com
// — these stubs keep CI hermetic. This file is not collected as a spec: the
// name matches neither Playwright's testMatch (*.spec.*) nor vitest's include
// (tests/**/*.test.ts).
import type { Page } from "@playwright/test";

const ROOT_ROUTE = /cdn\.arcgis\.com\/.+\/styles\/root\.json/;
const SPRITE_ROUTE = /cdn\.arcgis\.com\/.+\/sprites\/sprite/;
const ESRI_PBF_ROUTE = /basemaps\.arcgis\.com\/.+\.pbf/;
const HILLSHADE_ROUTE = /services\.arcgisonline\.com\/.+\/World_Hillshade\//;

// Served as root.json — exercises the VectorTileServer url→tiles rewrite
// (the .pbf requests below prove it) and the "/../" sprite normalization.
export const ESRI_STYLE_FIXTURE = {
  version: 8,
  sprite:
    "https://cdn.arcgis.com/sharing/rest/content/items/27e89eb03c1e4341a1d75e597f0291e6/resources/styles/../sprites/sprite",
  glyphs:
    "https://basemaps.arcgis.com/arcgis/rest/services/World_Basemap_v2/VectorTileServer/resources/fonts/{fontstack}/{range}.pbf",
  sources: {
    esri: {
      type: "vector",
      url: "https://basemaps.arcgis.com/arcgis/rest/services/World_Basemap_v2/VectorTileServer",
    },
  },
  layers: [
    {
      id: "Land/Not ice",
      type: "fill",
      source: "esri",
      "source-layer": "Land",
      paint: { "fill-color": "#dfe8dc", "fill-opacity": 0.3 },
    },
  ],
};

export const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

export interface EsriStub {
  rootCalls(): number;
  /** Flip root.json between failing and succeeding mid-test. The app's
      mount-time style PREFETCH makes call COUNTS racy (it may or may not have
      burned a call before the post-load fetch), so failure is a flag, never a
      count. */
  setFailRoot(fail: boolean): void;
}

export async function stubEsri(page: Page, opts: { failRoot?: boolean } = {}): Promise<EsriStub> {
  let root = 0;
  let failRoot = !!opts.failRoot;
  await page.route(ROOT_ROUTE, (route) => {
    root += 1;
    if (failRoot) return route.abort("failed");
    return route.fulfill({ json: ESRI_STYLE_FIXTURE });
  });
  await page.route(SPRITE_ROUTE, (route) =>
    route.request().url().endsWith(".json")
      ? route.fulfill({ json: {} })
      : route.fulfill({ body: PNG_1PX, contentType: "image/png" }),
  );
  // A zero-byte body is a valid, empty vector tile (and empty glyph range) —
  // it parses cleanly, so map.loaded() settles instead of hanging.
  await page.route(ESRI_PBF_ROUTE, (route) =>
    route.fulfill({ body: Buffer.alloc(0), contentType: "application/x-protobuf" }),
  );
  await page.route(HILLSHADE_ROUTE, (route) => route.fulfill({ body: PNG_1PX, contentType: "image/png" }));
  return {
    rootCalls: () => root,
    setFailRoot: (f: boolean) => {
      failRoot = f;
    },
  };
}

/** Wait until the requested basemap's layers are active and tiles settled.
    With the Esri default the boot path is USGS style → post-load swap, so
    `waitForBasemap(page, true)` is the "finished booting onto the default"
    wait — the bare isStyleLoaded/loaded wait can settle on the interim USGS
    style. */
export const waitForBasemap = (page: Page, esri: boolean) =>
  page.waitForFunction(
    (wantEsri) => {
      const m = (window as any).__resstMap;
      if (!m) return false;
      const hasEsri = !!m.getLayer("esri-hillshade");
      const hasUsgs = !!m.getLayer("usgs-topo");
      return (wantEsri ? hasEsri && !hasUsgs : hasUsgs && !hasEsri) && m.isStyleLoaded() && m.loaded();
    },
    esri,
    { timeout: 20_000 },
  );
