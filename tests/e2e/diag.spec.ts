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
  for (const label of ["USGS raster basemap", "Esri vector basemap", "half resolution", "site circles"]) {
    await expect(rows.filter({ hasText: label }).first()).toBeVisible();
  }
  for (let i = 0; i < 4; i += 1) {
    // Never a blank row: either numbers or a stated reason.
    await expect(rows.nth(i)).not.toHaveText(/^\s*$/);
  }

  // The context matrix must enumerate every configuration, not silently skip any.
  await expect(page.getByTestId("diag-context-table").locator("tbody tr")).toHaveCount(8);
  await expect(page.getByTestId("diag-context-table")).toContainText("webgl2 / high-performance");
  await expect(page.getByTestId("diag-context-table")).toContainText("webgl / high-performance");

  await expect(page.getByTestId("diag-copy")).toBeVisible();
  await expect(page.getByTestId("diag-markdown")).toContainText("# RESST diagnostics");
  await expect(page.getByTestId("diag-markdown")).toContainText("## WebGL context matrix");
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

test("DOM map trial mounts Leaflet and records the judgment", async ({ page }) => {
  // The automatic run (30-40 s) has to finish before the trial is offered.
  test.slow();
  await page.goto("?diag=1");
  await expect(page.getByTestId("diag-status")).toHaveText("Finished.", { timeout: 120_000 });
  await expect(page.getByTestId("diag-markdown")).toContainText("## DOM map trial");
  await expect(page.getByTestId("diag-markdown")).toContainText("Not run");

  await page.getByTestId("diag-domtrial-start").click();
  const map = page.getByTestId("diag-domtrial-map");
  await expect(map).toHaveClass(/leaflet-container/);
  // Every marker is an SVG path, on screen or not.
  await expect
    .poll(() => page.locator(".leaflet-overlay-pane path").count(), { timeout: 15_000 })
    .toBeGreaterThanOrEqual(900);

  await map.scrollIntoViewIfNeeded();
  const b = (await map.boundingBox())!;
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  const stats = page.getByTestId("diag-domtrial-stats");
  for (let i = 1; i <= 3; i += 1) {
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    // Past Leaflet's 3 px click tolerance; alternate so the map stays near CONUS.
    await page.mouse.move(cx + (i % 2 ? 120 : -120), cy + 30, { steps: 12 });
    // Pause longer than Leaflet's 50 ms inertia window so moveend fires on mouseup.
    await page.waitForTimeout(80);
    await page.mouse.up();
    await expect(stats).toContainText(`Gestures: ${i}`, { timeout: 10_000 });
  }

  await page.getByTestId("diag-domtrial-smooth").click();
  await expect(page.getByTestId("diag-domtrial-result")).toContainText("DOM map trial: GO");
  // The judgment reaches the verdict list and the copyable report. Never
  // assert bare "GO": "NO-GO" contains it.
  await expect(page.getByTestId("diag-verdict")).toContainText("DOM map trial: GO");
  await expect(page.getByTestId("diag-markdown")).toContainText("DOM map trial: GO");

  // Switching renderers rebuilds the markers on one canvas and drops the SVG paths.
  await page.getByTestId("diag-domtrial-renderer-canvas").click();
  await expect(page.locator(".leaflet-overlay-pane canvas")).toHaveCount(1);
  await expect(page.locator(".leaflet-overlay-pane path")).toHaveCount(0);
  await expect(stats).toContainText("Gestures: 0");
});
