// The ?diag=1 diagnostics page. Its whole point is to produce a usable report
// from a machine you cannot attach a debugger to, so the contract under test
// is that it always FINISHES and always reports something for every run —
// headless Chromium throttles WebGL, so "no frames rendered" is an expected
// outcome that must surface as text rather than a hang or a blank row.
import { expect, test } from "@playwright/test";
import { stubEsri, stubUsgsTiles } from "./helpers/esriStub";

// The reachability probe deliberately hits every third-party dependency. In CI
// those must be intercepted or the run waits on the real internet.
const REACH_HOSTS = [
  /carto\.nationalmap\.gov\/.*/,
  /services2\.arcgis\.com\/.*/,
  /services9\.arcgis\.com\/.*/,
  /api\.water\.usgs\.gov\/.*/,
  /sdmdataaccess\.sc\.egov\.usda\.gov\/.*/i,
];

test.beforeEach(async ({ page }) => {
  await stubEsri(page);
  await stubUsgsTiles(page);
  for (const route of REACH_HOSTS) {
    await page.route(route, (r) => r.fulfill({ status: 200, body: "{}", contentType: "application/json" }));
  }
});

test("renders a complete report and finishes", async ({ page }) => {
  await page.goto("?diag=1");

  await expect(page.getByRole("heading", { name: "RESST performance diagnostics" })).toBeVisible();
  // The benchmark is slow by construction (four camera circuits).
  await expect(page.getByTestId("diag-status")).toHaveText("Finished.", { timeout: 120_000 });

  await expect(page.getByTestId("diag-verdict").locator("li").first()).toBeVisible();

  // One row per benchmark leg, each either measured or explained.
  const rows = page.getByTestId("diag-bench-table").locator("tbody tr");
  await expect(rows).toHaveCount(4);
  for (const label of ["USGS raster basemap", "Esri vector basemap", "pixelRatio 1", "site circles"]) {
    await expect(rows.filter({ hasText: label }).first()).toBeVisible();
  }
  for (let i = 0; i < 4; i += 1) {
    // Never a blank row: either numbers or a stated reason.
    await expect(rows.nth(i)).not.toHaveText(/^\s*$/);
  }

  await expect(page.getByTestId("diag-copy")).toBeVisible();
  await expect(page.getByTestId("diag-markdown")).toContainText("# RESST diagnostics");
  await expect(page.getByTestId("diag-markdown")).toContainText("## Render benchmark");
  await expect(page.getByTestId("diag-markdown")).toContainText("## Host reachability");
});

test("reports a blocked Esri style as unavailable instead of failing the page", async ({ page }) => {
  await stubEsri(page, { failRoot: true });
  await page.goto("?diag=1");

  await expect(page.getByTestId("diag-status")).toHaveText("Finished.", { timeout: 120_000 });
  const rows = page.getByTestId("diag-bench-table").locator("tbody tr");
  await expect(rows).toHaveCount(4);
  await expect(rows.filter({ hasText: "Esri vector basemap" }).first()).toContainText("style unavailable");
  // The raster legs still measured, so the report stays useful.
  await expect(rows.filter({ hasText: "USGS raster basemap" }).first()).toBeVisible();
});

test("the query flag does not leak into the normal app path", async ({ page }) => {
  await page.goto("./");
  await expect(page.getByRole("heading", { name: "RESST performance diagnostics" })).toHaveCount(0);
  await page.waitForFunction(() => !!(window as unknown as { __resstMap?: unknown }).__resstMap);
});
