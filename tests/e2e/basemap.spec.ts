// Basemaps: Esri World Topographic Map (raster tiles) is the DEFAULT, USGS
// The National Map the alternative; a swap replaces the tile layer while the
// sites and any loaded overlays stay put. Every Esri endpoint is
// route-intercepted (helpers/esriStub), so CI never depends on Esri.
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { stubEsri, waitForBasemap } from "./helpers/esriStub";
import { mapCounts, waitForMapIdle } from "./helpers/mapReady";
import { HUC2_FC } from "./helpers/overlayFixtures";

async function openApp(page: Page, opts: { settled?: boolean } = {}): Promise<void> {
  await page.goto("./");
  await page.getByRole("button", { name: "OK" }).click(); // welcome dialog
  await waitForMapIdle(page);
  if (opts.settled !== false) await waitForBasemap(page, true);
}

const hucRow = (page: Page) => page.locator(".layers-list .layer-row", { hasText: "HUC 2 boundaries" });
const basemapUrl = (page: Page) => page.evaluate(() => (window as any).__resstMapInfo.basemapUrl() as string);
const trigger = (page: Page) => page.getByRole("button", { name: /^Basemap:/ });
const option = (page: Page, name: "USGS Topo" | "Esri Topo") => page.getByRole("radio", { name });

/** Open the picker if it is closed, then choose a basemap by name. */
async function pickBasemap(page: Page, name: "USGS Topo" | "Esri Topo"): Promise<void> {
  const t = trigger(page);
  if ((await t.getAttribute("aria-expanded")) !== "true") await t.click();
  await option(page, name).click();
}

test("the Esri default boots, and sites plus loaded overlays stay across a swap to USGS (and back)", async ({ page }) => {
  let hucCalls = 0;
  await page.route("**/overlays/huc2.json", (route) => {
    hucCalls += 1;
    return route.fulfill({ json: HUC2_FC });
  });
  await stubEsri(page);
  await openApp(page); // settled on the Esri default

  await expect(trigger(page)).toHaveAccessibleName("Basemap: Esri Topo");
  expect(await basemapUrl(page)).toContain("World_Topo_Map");
  await expect(page.locator(".app-footer")).toContainText("Esri World Topographic Map");

  // Load an overlay so the swap has app data to keep.
  await page.getByRole("button", { name: "Layers" }).click();
  const row = hucRow(page);
  await row.locator(".value-option input").check();
  await expect(row.locator(".ov-status")).toHaveAttribute("data-status", "ready", { timeout: 10_000 });
  const hucCallsBeforeSwap = hucCalls;
  await page.keyboard.press("Escape"); // close the Layers popover deterministically

  await pickBasemap(page, "USGS Topo");
  await waitForBasemap(page, false);
  expect(await basemapUrl(page)).toContain("basemap.nationalmap.gov");
  // …sites still render…
  expect((await mapCounts(page)).sites).toBe(963);
  // …and the loaded overlay stayed WITHOUT a refetch.
  expect((await mapCounts(page)).overlays.huc2).toBeGreaterThan(0);
  expect(hucCalls).toBe(hucCallsBeforeSwap);
  await expect(page.locator(".app-footer")).toContainText("USGS The National Map");
  await expect(trigger(page)).toHaveAccessibleName("Basemap: USGS Topo");
  // Picking the non-default is a real write.
  expect(await page.evaluate(() => localStorage.getItem("resst.basemap"))).toBe("usgs");

  await pickBasemap(page, "Esri Topo");
  await waitForBasemap(page, true);
  expect((await mapCounts(page)).sites).toBe(963);
  expect((await mapCounts(page)).overlays.huc2).toBeGreaterThan(0);
  await expect(page.locator(".app-footer")).toContainText("Esri World Topographic Map");
  expect(await page.evaluate(() => localStorage.getItem("resst.basemap"))).toBe("esri");
});

test("a persisted USGS choice applies on load", async ({ page }) => {
  await stubEsri(page);
  await page.addInitScript(() => {
    try {
      localStorage.setItem("resst.basemap", "usgs");
    } catch {
      /* ignore */
    }
  });
  await openApp(page, { settled: false });
  await waitForBasemap(page, false);
  expect(await basemapUrl(page)).toContain("basemap.nationalmap.gov");
  await expect(page.locator(".app-footer")).toContainText("USGS The National Map");
  await expect(trigger(page)).toHaveAccessibleName("Basemap: USGS Topo");
});

test("the picker opens, closes, and is keyboard operable", async ({ page }) => {
  await stubEsri(page);
  await openApp(page);
  const t = trigger(page);
  await expect(t).toHaveAttribute("aria-expanded", "false");
  // Icon-only at every width — pixel-matches the 30px zoom buttons above it.
  const triggerBox = (await t.boundingBox())!;
  expect(triggerBox.width).toBe(30);
  expect(triggerBox.height).toBe(30);
  await expect(page.locator(".basemap-panel")).toHaveCount(0);

  await t.click();
  await expect(t).toHaveAttribute("aria-expanded", "true");
  await expect(option(page, "Esri Topo")).toBeChecked();
  await expect(option(page, "Esri Topo")).toBeFocused(); // opening moves focus into the group

  await page.keyboard.press("Escape");
  await expect(page.locator(".basemap-panel")).toHaveCount(0);
  await expect(t).toBeFocused(); // Escape hands focus back

  // Outside click closes it. Never click the map here — that selects a site.
  await t.click();
  await expect(page.locator(".basemap-panel")).toBeVisible();
  await page.locator(".app-footer").click();
  await expect(page.locator(".basemap-panel")).toHaveCount(0);

  // Keyboard: open, then arrow to the next basemap (native radio behavior —
  // the default is first, so ArrowDown lands on USGS).
  await t.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".basemap-panel")).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await waitForBasemap(page, false);
  await expect(t).toHaveAccessibleName("Basemap: USGS Topo");
});

test("the picker is accessible closed and open", async ({ page }) => {
  const scan = async () => {
    const results = await new AxeBuilder({ page })
      .exclude(".leaflet-tile-pane")
      .exclude(".leaflet-pane svg")
      .exclude(".leaflet-pane canvas")
      .exclude(".leaflet-tooltip-pane")
      .analyze();
    return results.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => `${v.id}: ${v.nodes.length} nodes`);
  };
  await stubEsri(page);
  await openApp(page);
  await expect(trigger(page)).toBeVisible();
  expect(await scan()).toEqual([]);
  await trigger(page).click(); // the open panel exercises the radiogroup
  await expect(page.locator(".basemap-panel")).toBeVisible();
  expect(await scan()).toEqual([]);
});

test("the icon trigger fits phone widths without covering the toolbar", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await stubEsri(page);
  await openApp(page);
  // The trigger is a 30px icon square at every width; aria-label carries the
  // accessible name.
  await expect(trigger(page)).toHaveAccessibleName("Basemap: Esri Topo");
  const boxes = await page.evaluate(() => {
    const t = document.querySelector(".basemap-trigger")!.getBoundingClientRect();
    // The toolbar wraps to extra rows at phone widths, so compare hit-testing,
    // not bounding boxes: nothing may sit over the trigger's center (the
    // toolbar's own frame is pointer-events: none, and Leaflet's control
    // stack must stay beneath it).
    const hit = document.elementFromPoint(t.left + t.width / 2, t.top + t.height / 2);
    return { ctrlWidth: t.width, hitsTrigger: !!hit?.closest(".basemap-trigger") };
  });
  expect(boxes.ctrlWidth).toBeLessThanOrEqual(32);
  expect(boxes.hitsTrigger).toBe(true); // uncovered and clickable

  await trigger(page).click();
  const panel = await page.locator(".basemap-panel").boundingBox();
  expect(panel!.x).toBeGreaterThanOrEqual(0);
  expect(panel!.x + panel!.width).toBeLessThanOrEqual(390);
});
