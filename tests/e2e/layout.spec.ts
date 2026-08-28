// Layout-integrity and camera-geometry regression tests. These exist because
// the launch-day bug — the table's intrinsic width inflating the center grid
// column until the map canvas painted over the details panel — was invisible
// to locator-based assertions: every element existed and was clickable while
// the page looked completely wrong.
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const TUTTLE: [number, number] = [-96.5943465450358, 39.2562232982835];

async function openApp(page: Page): Promise<void> {
  await page.goto("./");
  await page.getByRole("button", { name: "OK" }).click(); // welcome dialog
}

const waitForMapReady = (page: Page) =>
  page.waitForFunction(
    () => {
      const m = (window as any).__resstMap;
      return m && m.isStyleLoaded() && m.loaded();
    },
    undefined,
    { timeout: 30_000 },
  );

test("the grid contains the map and table, and the details panel is visible on top", async ({ page }) => {
  await openApp(page);
  await waitForMapReady(page);

  const geom = await page.evaluate(() => {
    const w = (sel: string) => (document.querySelector(sel) as HTMLElement | null)?.clientWidth ?? -1;
    return {
      centerStack: w(".center-stack"),
      mapContainer: w(".map-panel"),
      canvas: w(".maplibregl-canvas"),
      tablePanel: w(".table-panel"),
      docScrollW: document.documentElement.scrollWidth,
      docClientW: document.documentElement.clientWidth,
    };
  });
  expect(geom.centerStack).toBeGreaterThan(0);
  expect(geom.canvas).toBe(geom.mapContainer);
  expect(geom.mapContainer).toBe(geom.centerStack);
  expect(geom.tablePanel).toBe(geom.centerStack);
  expect(geom.docScrollW).toBe(geom.docClientW);

  const details = page.locator(".details-panel");
  await expect(details).toBeVisible();
  await expect(details).toContainText("Selected Sites: 0");
  const box = await details.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x + box!.width).toBeLessThanOrEqual(1440);
  // The discriminating check: in the broken state this point hit the canvas.
  const hit = await page.evaluate(
    () => !!document.elementFromPoint(1440 - 160, 400)?.closest(".details-panel"),
  );
  expect(hit).toBe(true);
});

test("initial view is the Default CONUS extent", async ({ page }) => {
  await openApp(page);
  await waitForMapReady(page);
  const c = await page.evaluate(() => (window as any).__resstMap.getCenter());
  // Bounds [-116.7544, 30.8881, -79.9282, 46.6079]; the fitted (mercator)
  // center sits at ≈ (-98.34, 39.20) — keep the tolerance ≥ 0.6°.
  expect(Math.abs(c.lng - -98.3413)).toBeLessThan(1);
  expect(Math.abs(c.lat - 38.748)).toBeLessThan(1);
});

test("selecting a site centers the camera on that site", async ({ page }) => {
  await openApp(page);
  await waitForMapReady(page);
  await page.locator(".data-table tbody tr", { hasText: "Tuttle Creek" }).first().click();

  // Wait for the fly animation to land near the site (avoids the idle race).
  await page.waitForFunction(
    (lng) => {
      const m = (window as any).__resstMap;
      return m && !m.isMoving() && Math.abs(m.getCenter().lng - lng) < 0.05;
    },
    TUTTLE[0],
    { timeout: 15_000 },
  );

  const off = await page.evaluate(([lng, lat]) => {
    const m = (window as any).__resstMap;
    const p = m.project([lng, lat]);
    const el = m.getContainer() as HTMLElement;
    return { dx: p.x - el.clientWidth / 2, dy: p.y - el.clientHeight / 2 };
  }, TUTTLE);
  expect(Math.abs(off.dx)).toBeLessThan(40);
  expect(Math.abs(off.dy)).toBeLessThan(40);
});

test("tables are virtualized: full totals with a bounded DOM", async ({ page }) => {
  await openApp(page);
  await expect(page.locator(".table-footer")).toContainText("Total: 979");
  await expect(page.locator(".data-table tbody tr").first()).toContainText("Tuttle Creek");
  const siteRows = await page.locator(".data-table tbody tr").count();
  expect(siteRows).toBeGreaterThan(5);
  expect(siteRows).toBeLessThan(200);

  await page.getByRole("tab", { name: "Site Literature" }).click();
  await expect(page.locator(".table-footer")).toContainText("Total: 1,192");
  const litRows = await page.locator(".data-table tbody tr").count();
  expect(litRows).toBeGreaterThan(5);
  expect(litRows).toBeLessThan(200);
});

test("side panels collapse to rails and expand back", async ({ page }) => {
  await openApp(page);
  await waitForMapReady(page);
  const mapWidth = () =>
    page.evaluate(() => (document.querySelector(".map-panel") as HTMLElement).clientWidth);
  const before = await mapWidth();

  await page.getByRole("button", { name: "Collapse Data Filters panel" }).click();
  await page.getByRole("button", { name: "Collapse Selected Data panel" }).click();
  const cols = await page.evaluate(
    () => getComputedStyle(document.querySelector(".app-main")!).gridTemplateColumns,
  );
  expect(cols).toMatch(/^28px .+px 28px$/);
  await expect.poll(mapWidth).toBeGreaterThan(before + 400);

  await page.getByRole("button", { name: "Expand Data Filters panel" }).click();
  await page.getByRole("button", { name: "Expand Selected Data panel" }).click();
  await expect.poll(mapWidth).toBe(before);
});

test("no serious/critical violations with a panel collapsed", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "Collapse Selected Data panel" }).click();
  const results = await new AxeBuilder({ page }).exclude(".maplibregl-canvas").analyze();
  const serious = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(serious.map((v) => `${v.id}: ${v.nodes.length} nodes`)).toEqual([]);
});
