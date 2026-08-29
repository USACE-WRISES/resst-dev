// Basemap toggle: swaps to the original app's Esri Topographic basemap
// (style fixed up for MapLibre, hillshade underneath) while the sites and
// any loaded overlays ride across the swap — and back. Every Esri endpoint
// is route-intercepted, so CI never depends on Esri being reachable.
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const ROOT_ROUTE = /cdn\.arcgis\.com\/.+\/styles\/root\.json/;
const SPRITE_ROUTE = /cdn\.arcgis\.com\/.+\/sprites\/sprite/;
const ESRI_PBF_ROUTE = /basemaps\.arcgis\.com\/.+\.pbf/;
const HILLSHADE_ROUTE = /services\.arcgisonline\.com\/.+\/World_Hillshade\//;
const HUC_ROUTE = /https:\/\/services\.arcgis\.com\/.+\/FeatureServer\/\d+\/query/;

// Served as root.json — exercises the VectorTileServer url→tiles rewrite
// (the .pbf requests below prove it) and the "/../" sprite normalization.
const ESRI_STYLE_FIXTURE = {
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

const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

// Same 2°x2° HUC fixture the overlays spec uses (inside the CONUS viewport).
const FIXTURE_PAGE = {
  transform: { originPosition: "upperLeft", scale: [0.02, 0.02], translate: [-105, 42] },
  features: [
    {
      attributes: { huc2: "10", name: "Test basin" },
      geometry: { rings: [[[0, 0], [100, 0], [0, 100], [-100, 0], [0, -100]]] },
    },
  ],
  exceededTransferLimit: false,
};

async function stubEsri(page: Page, opts: { failRootCalls?: number } = {}): Promise<{ rootCalls: () => number }> {
  let root = 0;
  await page.route(ROOT_ROUTE, (route) => {
    root += 1;
    if (opts.failRootCalls && root <= opts.failRootCalls) return route.abort("failed");
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
  return { rootCalls: () => root };
}

async function openApp(page: Page): Promise<void> {
  await page.goto("./");
  await page.getByRole("button", { name: "OK" }).click(); // welcome dialog
  await page.waitForFunction(
    () => {
      const m = (window as any).__resstMap;
      return m && m.isStyleLoaded() && m.loaded();
    },
    undefined,
    { timeout: 30_000 },
  );
}

/** Wait until the requested basemap's layers are active and tiles settled. */
const waitForBasemap = (page: Page, esri: boolean) =>
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

const hucRow = (page: Page) => page.locator(".layers-list .layer-row", { hasText: "HUC 2 boundaries" });

const sourceFeatureCount = (page: Page) =>
  page.evaluate(() => {
    const data = (window as any).__resstMap.getSource("ov-huc2")?.serialize?.().data;
    return data && typeof data === "object" && Array.isArray(data.features) ? data.features.length : 0;
  });

const renderedSites = (page: Page) =>
  page.evaluate(
    () => (window as any).__resstMap.queryRenderedFeatures({ layers: ["sites-circles"] }).length,
  );

test("toggling reproduces the Esri basemap and carries app layers across (and back)", async ({ page }) => {
  let hucCalls = 0;
  await page.route(HUC_ROUTE, (route) => {
    hucCalls += 1;
    return route.fulfill({ json: FIXTURE_PAGE });
  });
  await stubEsri(page);
  await openApp(page);

  // Load an overlay first so the swap has app data to carry.
  await page.getByRole("button", { name: "Layers" }).click();
  const row = hucRow(page);
  await row.locator(".value-option input").check();
  await expect(row.locator(".ov-status")).toHaveAttribute("data-status", "ready", { timeout: 10_000 });
  const hucCallsBeforeSwap = hucCalls;

  await page.getByRole("button", { name: /^Switch basemap to Topographic/ }).click();
  await waitForBasemap(page, true);
  // The fixture's own layer arrived with the swap…
  expect(await page.evaluate(() => !!(window as any).__resstMap.getLayer("Land/Not ice"))).toBe(true);
  // …sites still render on top…
  await expect.poll(() => renderedSites(page), { timeout: 10_000 }).toBeGreaterThan(50);
  // …and the loaded overlay rode across WITHOUT a refetch.
  expect(await sourceFeatureCount(page)).toBeGreaterThan(0);
  expect(hucCalls).toBe(hucCallsBeforeSwap);
  await expect(page.locator(".app-footer")).toContainText("Esri World Topographic Map");
  expect(await page.evaluate(() => localStorage.getItem("resst.basemap"))).toBe("esri");

  await page.getByRole("button", { name: /^Switch basemap to USGS/ }).click();
  await waitForBasemap(page, false);
  await expect.poll(() => renderedSites(page), { timeout: 10_000 }).toBeGreaterThan(50);
  expect(await sourceFeatureCount(page)).toBeGreaterThan(0);
  await expect(page.locator(".app-footer")).toContainText("USGS The National Map");
  expect(await page.evaluate(() => localStorage.getItem("resst.basemap"))).toBe("usgs");
});

test("a persisted Esri choice applies on load", async ({ page }) => {
  await stubEsri(page);
  await page.addInitScript(() => {
    try {
      localStorage.setItem("resst.basemap", "esri");
    } catch {
      /* ignore */
    }
  });
  await openApp(page);
  await waitForBasemap(page, true);
  await expect(page.locator(".app-footer")).toContainText("Esri World Topographic Map");
});

test("a failed style fetch reverts to USGS and the next attempt succeeds", async ({ page }) => {
  const stub = await stubEsri(page, { failRootCalls: 1 });
  await openApp(page);
  const toggle = page.getByRole("button", { name: /^Switch basemap to Topographic/ });
  await toggle.click();
  await expect(page.locator(".basemap-toggle")).toHaveAttribute("data-status", "error", { timeout: 10_000 });
  // The map never left USGS, and the broken choice was un-persisted.
  expect(await page.evaluate(() => !!(window as any).__resstMap.getLayer("usgs-topo"))).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem("resst.basemap"))).toBe("usgs");
  // The failure must not poison the style cache — the retry goes to network.
  await toggle.click();
  await waitForBasemap(page, true);
  expect(stub.rootCalls()).toBe(2);
});

test("the toggle control is accessible", async ({ page }) => {
  await stubEsri(page);
  await openApp(page);
  await expect(page.getByRole("button", { name: /^Switch basemap to/ })).toBeVisible();
  const results = await new AxeBuilder({ page }).exclude(".maplibregl-canvas").analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes.length} nodes`)).toEqual([]);
});
