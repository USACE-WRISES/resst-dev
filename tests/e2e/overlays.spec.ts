// Reference-overlay pipeline: quantized fetch renders data for the CURRENT
// view without panning, status is surfaced per layer, and a failure is
// retryable. Services are mocked with route interception — the original bug
// (a self-poisoning fetch memo) was invisible to checkbox-only assertions.
import { test, expect, type Page } from "@playwright/test";

const HUC_ROUTE = /https:\/\/services\.arcgis\.com\/.+\/FeatureServer\/\d+\/query/;

// A 2°x2° box in the plains — inside the default CONUS viewport.
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

const hucRow = (page: Page) => page.locator(".layers-list .layer-row", { hasText: "HUC 2 boundaries" });

const sourceFeatureCount = (page: Page) =>
  page.evaluate(() => {
    const m = (window as any).__resstMap;
    const src = m.getSource("ov-huc2");
    const data = src?.serialize?.().data;
    if (data && typeof data === "object" && Array.isArray(data.features)) return data.features.length;
    return m.querySourceFeatures("ov-huc2").length;
  });

test("toggling HUC2 loads the current view through the quantized pipeline", async ({ page }) => {
  await page.route(HUC_ROUTE, (route) => route.fulfill({ json: FIXTURE_PAGE }));
  await openApp(page);
  await page.getByRole("button", { name: "Layers" }).click();
  const row = hucRow(page);
  await row.locator(".value-option input").check();
  await expect(row.locator(".ov-status")).toHaveAttribute("data-status", "ready", { timeout: 10_000 });
  expect(await sourceFeatureCount(page)).toBeGreaterThan(0);
});

test("a failed overlay fetch shows an error and Retry recovers", async ({ page }) => {
  let calls = 0;
  await page.route(HUC_ROUTE, (route) => {
    calls += 1;
    if (calls === 1) return route.abort("failed");
    return route.fulfill({ json: FIXTURE_PAGE });
  });
  await openApp(page);
  await page.getByRole("button", { name: "Layers" }).click();
  const row = hucRow(page);
  await row.locator(".value-option input").check();
  await expect(row.locator(".ov-status")).toHaveAttribute("data-status", "error", { timeout: 10_000 });
  await row.getByRole("button", { name: /retry/i }).click();
  await expect(row.locator(".ov-status")).toHaveAttribute("data-status", "ready", { timeout: 10_000 });
  expect(await sourceFeatureCount(page)).toBeGreaterThan(0);
});

test("a zoom-gated overlay says so instead of silently doing nothing", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "Layers" }).click();
  const row = page.locator(".layers-list .layer-row", { hasText: "SSURGO" });
  await row.locator(".value-option input").check();
  await expect(row.locator(".ov-status")).toHaveAttribute("data-status", "gated");
  await expect(row.locator(".ov-status")).toHaveText("zoom in to load");
});
