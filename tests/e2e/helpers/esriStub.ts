// Shared Esri-endpoint interception + basemap readiness for the e2e suite.
// With Esri Topo as the DEFAULT basemap (src/map/basemaps.ts), every spec's
// boot requests raster World Topographic Map tiles from
// services.arcgisonline.com — the stub keeps CI hermetic. This file is not
// collected as a spec: the name matches neither Playwright's testMatch
// (*.spec.*) nor vitest's include (tests/**/*.test.ts).
import type { Page } from "@playwright/test";

// The Leaflet map's Esri basemap is the raster World Topographic Map.
const WORLD_TOPO_ROUTE = /services\.arcgisonline\.com\/.+\/World_Topo_Map\//;

export const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

/** Stub the Esri raster basemap tiles (uniform 1px tiles: fast and hermetic). */
export async function stubEsri(page: Page): Promise<void> {
  await page.route(WORLD_TOPO_ROUTE, (route) => route.fulfill({ body: PNG_1PX, contentType: "image/png" }));
}

/** Stub the USGS National Map raster tiles (the report's snapshot map uses
    buildUsgsStyle; uniform 1px tiles make its 'idle' fire fast and hermetic). */
export async function stubUsgsTiles(page: Page): Promise<void> {
  await page.route(/basemap\.nationalmap\.gov\/.+/, (route) =>
    route.fulfill({ body: PNG_1PX, contentType: "image/png" }),
  );
}

/** Wait until the requested basemap is the active tile layer and the map has
    settled: site markers drawn, tiles loaded, camera at rest.
    `waitForBasemap(page, true)` is the "finished booting onto the Esri
    default" wait every spec starts from. */
export const waitForBasemap = (page: Page, esri: boolean) =>
  page.waitForFunction(
    (wantEsri) => {
      const w = window as any;
      const info = w.__resstMapInfo;
      if (!w.__resstMap || !info) return false;
      const url: string = info.basemapUrl();
      const isEsri = url.includes("World_Topo_Map");
      return isEsri === wantEsri && info.counts().sites > 0 && info.tilesLoaded() && !info.isMoving();
    },
    esri,
    { timeout: 20_000 },
  );
