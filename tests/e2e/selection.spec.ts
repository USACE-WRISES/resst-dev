// The map Select toolkit: box, polygon draw, by-HUC basin click, and
// near-a-river with live distance refine. HUC containment and river courses
// resolve locally against the static overlay snapshots, so the specs stub
// the snapshot FILES (**/overlays/*.json) — CI never touches the real
// multi-MB copies, and there is no click-time service to mock any more.
//
// Fixtures anchor to real site coordinates (verified against
// public/data/sites.json): the test basin [-96.9,-96.3]×[39.0,39.5] holds
// EXACTLY Tuttle Creek (-96.5943, 39.2562), Milford Dam (-96.8978, 39.0833),
// and Kansas River (-96.3056, 39.1977). The test river runs down lon -96.55
// from lat 39.8 to 38.5 — 1 site within 10 mi (Tuttle Creek @ 2.4), 4 within
// 25 (adds Kansas River @ 13.1, Milford @ 18.7, Lake Wabaunsee @ 19.0 —
// the 4th proves the corridor uses the river's whole course, not a viewport
// slice).
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { stubEsri, waitForBasemap } from "./helpers/esriStub";
import { waitForMapIdle } from "./helpers/mapReady";
import { KANSAS_BASIN_FC, TEST_RIVER_FC } from "./helpers/overlayFixtures";

interface StubFlags {
  /** While true, every HUC snapshot request fails at the network level. */
  failHuc: boolean;
}

async function stubOverlayFiles(page: Page, flags: StubFlags): Promise<void> {
  await page.route("**/overlays/*.json", (route) => {
    if (/huc\d[^/]*\.json$/.test(route.request().url())) {
      if (flags.failHuc) return route.abort("failed");
      return route.fulfill({ json: KANSAS_BASIN_FC });
    }
    return route.fulfill({ json: TEST_RIVER_FC }); // rivers.json
  });
}

async function openApp(page: Page, flags: StubFlags = { failHuc: false }): Promise<void> {
  await stubEsri(page);
  await stubOverlayFiles(page, flags);
  await page.goto("./");
  await page.getByRole("button", { name: "OK" }).click(); // welcome dialog
  await waitForBasemap(page, true);
}

/** Jump the camera so the Kansas fixture cluster is comfortably clickable. */
async function jumpToFixtureArea(page: Page): Promise<void> {
  await page.evaluate(() => (window as any).__resstMapInfo.jumpTo(-96.6, 39.25, 8));
  await waitForMapIdle(page);
}

const screenPt = (page: Page, lon: number, lat: number) =>
  page.evaluate(
    ([ln, lt]) => {
      const w = window as any;
      const p = w.__resstMapInfo.project(ln, lt);
      const r = w.__resstMap.getContainer().getBoundingClientRect();
      return { x: r.left + p.x, y: r.top + p.y };
    },
    [lon, lat],
  );

const clickAt = async (page: Page, lon: number, lat: number, opts: { shift?: boolean } = {}) => {
  const p = await screenPt(page, lon, lat);
  if (opts.shift) await page.keyboard.down("Shift");
  await page.mouse.click(p.x, p.y);
  if (opts.shift) await page.keyboard.up("Shift");
};

const selectBtn = (page: Page) => page.locator(".map-toolbar").getByRole("button", { name: /^Select/ });
const hintBar = (page: Page) => page.locator(".map-hint-bar");
const selectedCount = (page: Page, n: number) =>
  expect(page.locator(".details-panel")).toContainText(`Selected Sites: ${n}`);
const highlightCount = (page: Page) => page.evaluate(() => (window as any).__resstMapInfo.counts().highlight);
// Clicks REQUIRE the resident snapshot (containment/courses run locally), so
// every HUC- or river-clicking test waits for the layer's data to land.
const overlayReady = (page: Page, key: string) =>
  page.waitForFunction((k) => ((window as any).__resstMapInfo.counts().overlays[k] ?? 0) > 0, key);

const armTool = async (page: Page, item: string | RegExp) => {
  await selectBtn(page).click();
  await page.locator(".select-menu").getByRole("button", { name: item }).click();
};

test("the Select menu lists every mode and stays axe-clean open and armed", async ({ page }) => {
  await openApp(page);
  await selectBtn(page).click();
  const menu = page.locator(".select-menu");
  for (const name of [/^Box/, /^Polygon/, "HUC-2", "HUC-4", "HUC-6", "HUC-8", /^Near a river/]) {
    await expect(menu.getByRole("button", { name })).toBeVisible();
  }
  await expect(menu.getByRole("button", { name: "Clear selection" })).toBeDisabled(); // nothing selected yet
  const openScan = await new AxeBuilder({ page }).exclude(".leaflet-tile-pane").exclude(".leaflet-pane svg").exclude(".leaflet-pane canvas").exclude(".leaflet-tooltip-pane").analyze();
  expect(
    openScan.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id),
  ).toEqual([]);
  // Arm the river mode: hint bar with the labeled distance input appears.
  await menu.getByRole("button", { name: /^Near a river/ }).click();
  await expect(hintBar(page)).toBeVisible();
  await expect(page.getByRole("spinbutton", { name: "Distance from the river in miles" })).toBeVisible();
  const armedScan = await new AxeBuilder({ page }).exclude(".leaflet-tile-pane").exclude(".leaflet-pane svg").exclude(".leaflet-pane canvas").exclude(".leaflet-tooltip-pane").analyze();
  expect(
    armedScan.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id),
  ).toEqual([]);
});

test("box mode selects the dragged sites and disarms", async ({ page }) => {
  await openApp(page);
  await jumpToFixtureArea(page);
  await armTool(page, /^Box/);
  // Drag from the BOTTOM corner upward: only the mousedown must land on the
  // canvas (move/up listen on window), and the top corner projects under the
  // armed-mode hint bar.
  const start = await screenPt(page, -96.95, 38.95);
  const end = await screenPt(page, -96.25, 39.55);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 6 });
  await page.mouse.up();
  await selectedCount(page, 3);
  await expect(selectBtn(page)).toHaveText(/^Select ▾$/); // one-shot: disarmed
  await expect(hintBar(page)).toHaveCount(0);
});

test("an empty box keeps the tool armed with a hint; Esc disarms", async ({ page }) => {
  await openApp(page);
  await jumpToFixtureArea(page);
  await armTool(page, /^Box/);
  const start = await screenPt(page, -96.4, 39.45); // empty ground between sites
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 8, start.y + 8, { steps: 2 });
  await page.mouse.up();
  await expect(hintBar(page)).toContainText("No sites in that box");
  await expect(hintBar(page)).toBeVisible(); // still armed
  await page.keyboard.press("Escape");
  await expect(hintBar(page)).toHaveCount(0);
  await selectedCount(page, 0);
});

test("polygon draw selects on Enter; Escape cancels a draw in progress", async ({ page }) => {
  await openApp(page);
  await jumpToFixtureArea(page);
  await armTool(page, /^Polygon/);
  // A triangle around Tuttle Creek only.
  await clickAt(page, -96.7, 39.35);
  await clickAt(page, -96.45, 39.35);
  await clickAt(page, -96.58, 39.15);
  await page.keyboard.press("Enter");
  await selectedCount(page, 1);
  await expect(page.locator(".details-panel")).toContainText("Tuttle Creek");
  await expect(hintBar(page)).toHaveCount(0); // one-shot
  expect(await highlightCount(page)).toBe(1); // the polygon outline stays as the highlight
  // Cancel mid-draw: two corners, then Escape.
  await armTool(page, /^Polygon/);
  await clickAt(page, -96.7, 39.35);
  await clickAt(page, -96.45, 39.35);
  await page.keyboard.press("Escape");
  await expect(hintBar(page)).toHaveCount(0);
  const drawCount = await page.evaluate(() => (window as any).__resstMapInfo.counts().sketch);
  expect(drawCount).toBe(0); // the sketch is gone
  await selectedCount(page, 1); // Esc never reverts an applied selection
});

test("HUC mode auto-enables the boundary layer and selects the clicked basin's sites", async ({ page }) => {
  await openApp(page);
  await jumpToFixtureArea(page);
  await armTool(page, "HUC-2");
  await expect(hintBar(page)).toContainText("Click a HUC-2 basin");
  // Arming switched the boundary overlay on.
  await page.locator(".map-toolbar").getByRole("button", { name: "Layers" }).click();
  await expect(
    page.locator(".layers-list .value-option", { hasText: "HUC 2 boundaries" }).locator("input"),
  ).toBeChecked();
  await page.locator(".map-toolbar").getByRole("button", { name: "Layers" }).click(); // close the popover
  await overlayReady(page, "huc2");
  await clickAt(page, -96.6, 39.25);
  await selectedCount(page, 3);
  await expect(selectBtn(page)).toHaveText(/^Select ▾$/); // one-shot
  expect(await highlightCount(page)).toBeGreaterThanOrEqual(1); // basin outline drawn
});

test("HUC mode reports snapshot failures, recovers via Retry, and misses honestly", async ({ page }) => {
  const flags: StubFlags = { failHuc: true };
  await openApp(page, flags);
  await jumpToFixtureArea(page);
  await armTool(page, "HUC-4"); // auto-enable → the download fails
  const layersBtn = page.locator(".map-toolbar").getByRole("button", { name: "Layers" });
  await layersBtn.click();
  const row = page.locator(".layers-list .layer-row", { hasText: "HUC 4 boundaries" });
  await expect(row.locator(".ov-status")).toHaveAttribute("data-status", "error", { timeout: 10_000 });
  flags.failHuc = false;
  await row.getByRole("button", { name: /retry/i }).click();
  await expect(row.locator(".ov-status")).toHaveAttribute("data-status", "ready", { timeout: 10_000 });
  await layersBtn.click(); // close the popover
  await overlayReady(page, "huc4");
  // A genuine containment miss needs no stub mode any more:
  await clickAt(page, -96.6, 38.95); // south of the fixture basin
  await expect(hintBar(page)).toContainText("outside every HUC-4 basin");
  await expect(hintBar(page)).toBeVisible(); // still armed
  await clickAt(page, -96.6, 39.25);
  await selectedCount(page, 3);
});

test("arming while the snapshot downloads shows the loading hint, then selects", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  await stubEsri(page);
  await page.route("**/overlays/*.json", async (route) => {
    if (/huc2\.json$/.test(route.request().url())) {
      await gate; // hold the huc2 snapshot until the test releases it
      return route.fulfill({ json: KANSAS_BASIN_FC });
    }
    return route.fulfill({ json: TEST_RIVER_FC });
  });
  await page.goto("./");
  await page.getByRole("button", { name: "OK" }).click();
  await waitForBasemap(page, true);
  await jumpToFixtureArea(page);
  await armTool(page, "HUC-2");
  // The passive hint-bar notice while the file is in flight…
  await expect(hintBar(page)).toContainText("Map data is downloading");
  // …and the click-time message when the user doesn't wait.
  await clickAt(page, -96.6, 39.25);
  await expect(hintBar(page)).toContainText("still loading");
  release();
  await overlayReady(page, "huc2");
  await clickAt(page, -96.6, 39.25);
  await selectedCount(page, 3);
});

test("river mode picks a corridor, recomputes live as the distance changes, and Done keeps it", async ({ page }) => {
  await openApp(page);
  await jumpToFixtureArea(page);
  await armTool(page, /^Near a river/);
  await overlayReady(page, "rivers");
  await clickAt(page, -96.55, 39.25);
  await expect(hintBar(page)).toContainText("1 site within 10 mi of Test River");
  await selectedCount(page, 1);
  // Type a bigger distance — the selection recomputes without another click,
  // and reaches sites beyond the viewport-fetched overlay slice.
  await page.getByRole("spinbutton", { name: "Distance from the river in miles" }).fill("25");
  await expect(hintBar(page)).toContainText("4 sites within 25 mi of Test River");
  await selectedCount(page, 4);
  await hintBar(page).getByRole("button", { name: "Done" }).click();
  await expect(hintBar(page)).toHaveCount(0);
  await selectedCount(page, 4); // Done keeps the selection
});

test("Shift adds to the selection with dedupe; a plain pick replaces", async ({ page }) => {
  await openApp(page);
  await jumpToFixtureArea(page);
  await armTool(page, "HUC-2");
  await overlayReady(page, "huc2");
  await clickAt(page, -96.6, 39.25);
  await selectedCount(page, 3);
  await armTool(page, /^Near a river/);
  await overlayReady(page, "rivers");
  // Shift-pick the river at 10 mi: its 1 site (Tuttle Creek) is already in
  // the basin selection — the union stays 3, proving the dedupe.
  await clickAt(page, -96.55, 39.25, { shift: true });
  await expect(hintBar(page)).toContainText("1 site within 10 mi");
  await selectedCount(page, 3);
  // A plain re-pick replaces the whole selection.
  await clickAt(page, -96.55, 39.25);
  await selectedCount(page, 1);
});

test("Escape disarms every mode", async ({ page }) => {
  await openApp(page);
  for (const item of [/^Box/, /^Polygon/, "HUC-6", /^Near a river/]) {
    await armTool(page, item);
    await expect(hintBar(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(hintBar(page)).toHaveCount(0);
    await expect(selectBtn(page)).toHaveText(/^Select ▾$/);
  }
});
