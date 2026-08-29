// Reference-overlay pipeline: a static snapshot loads ONCE on first
// toggle-on (no per-viewport refetch), status is surfaced per layer, and a
// failure is retryable. The snapshot files are mocked with route
// interception — the app must never depend on the real multi-MB files (or
// any network) in CI.
import { test, expect, type Page } from "@playwright/test";
import { stubEsri, waitForBasemap } from "./helpers/esriStub";
import { HUC2_FC } from "./helpers/overlayFixtures";

async function openApp(page: Page): Promise<void> {
  await stubEsri(page); // the default basemap boots from Esri endpoints — keep CI hermetic
  await page.goto("./");
  await page.getByRole("button", { name: "OK" }).click(); // welcome dialog
  await waitForBasemap(page, true); // settled on the Esri default
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

test("toggling HUC2 loads the static snapshot once — panning never refetches", async ({ page }) => {
  let calls = 0;
  await page.route("**/overlays/huc2.json", (route) => {
    calls += 1;
    return route.fulfill({ json: HUC2_FC });
  });
  await openApp(page);
  await page.getByRole("button", { name: "Layers" }).click();
  const row = hucRow(page);
  await row.locator(".value-option input").check();
  await expect(row.locator(".ov-status")).toHaveAttribute("data-status", "ready", { timeout: 10_000 });
  expect(await sourceFeatureCount(page)).toBeGreaterThan(0);
  expect(calls).toBe(1);
  // The fetch-once contract: move the camera, outlast the moveend refresh
  // debounce (250 ms), and the snapshot must NOT have been re-requested.
  await page.evaluate(() => (window as any).__resstMap.jumpTo({ center: [-80, 35], zoom: 5 }));
  await page.waitForFunction(() => !(window as any).__resstMap.isMoving());
  await page.waitForTimeout(600);
  expect(calls).toBe(1);
  await expect(row.locator(".ov-status")).toHaveAttribute("data-status", "ready");
});

test("a failed snapshot download shows an error and Retry recovers", async ({ page }) => {
  let calls = 0;
  await page.route("**/overlays/huc2.json", (route) => {
    calls += 1;
    if (calls === 1) return route.abort("failed");
    return route.fulfill({ json: HUC2_FC });
  });
  await openApp(page);
  await page.getByRole("button", { name: "Layers" }).click();
  const row = hucRow(page);
  await row.locator(".value-option input").check();
  await expect(row.locator(".ov-status")).toHaveAttribute("data-status", "error", { timeout: 10_000 });
  await row.getByRole("button", { name: /retry/i }).click();
  await expect(row.locator(".ov-status")).toHaveAttribute("data-status", "ready", { timeout: 10_000 });
  expect(await sourceFeatureCount(page)).toBeGreaterThan(0);
  expect(calls).toBe(2);
});

test("a zoom-gated overlay says so instead of silently doing nothing", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "Layers" }).click();
  const row = page.locator(".layers-list .layer-row", { hasText: "SSURGO" });
  await row.locator(".value-option input").check();
  await expect(row.locator(".ov-status")).toHaveAttribute("data-status", "gated");
  await expect(row.locator(".ov-status")).toHaveText("zoom in to load");
});
