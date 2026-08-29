// Basemap machinery: Esri Topographic is the DEFAULT basemap (the boot path
// is USGS style → post-load swap; USGS stays the fallback), and the sites
// plus any loaded overlays ride across swaps — both ways. Every Esri endpoint
// is route-intercepted (helpers/esriStub), so CI never depends on Esri being
// reachable.
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { stubEsri, waitForBasemap } from "./helpers/esriStub";
import { HUC2_FC } from "./helpers/overlayFixtures";

async function openApp(page: Page, opts: { settled?: boolean } = {}): Promise<void> {
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
  // The bare wait can settle on the interim USGS boot style; settled (the
  // default) means "the Esri default has fully applied".
  if (opts.settled !== false) await waitForBasemap(page, true);
}

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

const trigger = (page: Page) => page.getByRole("button", { name: /^Basemap:/ });
const option = (page: Page, name: "USGS Topo" | "Esri Topo") => page.getByRole("radio", { name });

/** Open the picker if it is closed, then choose a basemap by name. */
async function pickBasemap(page: Page, name: "USGS Topo" | "Esri Topo"): Promise<void> {
  const t = trigger(page);
  if ((await t.getAttribute("aria-expanded")) !== "true") await t.click();
  // click(), not check(): the failure test reverts the choice, and check()
  // would assert `checked` before the revert lands.
  await option(page, name).click();
}

test("the Esri default boots, and app layers carry across to USGS (and back)", async ({ page }) => {
  let hucCalls = 0;
  await page.route("**/overlays/huc2.json", (route) => {
    hucCalls += 1;
    return route.fulfill({ json: HUC2_FC });
  });
  await stubEsri(page);
  await openApp(page); // settled on the Esri default

  await expect(trigger(page)).toHaveAccessibleName("Basemap: Esri Topo");
  // The fixture's own layer arrived with the boot swap.
  expect(await page.evaluate(() => !!(window as any).__resstMap.getLayer("Land/Not ice"))).toBe(true);
  await expect(page.locator(".app-footer")).toContainText("Esri World Topographic Map");

  // Load an overlay so the swap has app data to carry.
  await page.getByRole("button", { name: "Layers" }).click();
  const row = hucRow(page);
  await row.locator(".value-option input").check();
  await expect(row.locator(".ov-status")).toHaveAttribute("data-status", "ready", { timeout: 10_000 });
  const hucCallsBeforeSwap = hucCalls;
  await page.keyboard.press("Escape"); // close the Layers popover deterministically

  await pickBasemap(page, "USGS Topo");
  await waitForBasemap(page, false);
  // …sites still render on top…
  await expect.poll(() => renderedSites(page), { timeout: 10_000 }).toBeGreaterThan(50);
  // …and the loaded overlay rode across WITHOUT a refetch.
  expect(await sourceFeatureCount(page)).toBeGreaterThan(0);
  expect(hucCalls).toBe(hucCallsBeforeSwap);
  await expect(page.locator(".app-footer")).toContainText("USGS The National Map");
  await expect(trigger(page)).toHaveAccessibleName("Basemap: USGS Topo");
  // Picking the non-default is a real write.
  expect(await page.evaluate(() => localStorage.getItem("resst.basemap"))).toBe("usgs");

  await pickBasemap(page, "Esri Topo");
  await waitForBasemap(page, true);
  await expect.poll(() => renderedSites(page), { timeout: 10_000 }).toBeGreaterThan(50);
  expect(await sourceFeatureCount(page)).toBeGreaterThan(0);
  await expect(page.locator(".app-footer")).toContainText("Esri World Topographic Map");
  expect(await page.evaluate(() => localStorage.getItem("resst.basemap"))).toBe("esri");
});

test("a persisted USGS choice applies on load without fetching Esri", async ({ page }) => {
  const stub = await stubEsri(page);
  await page.addInitScript(() => {
    try {
      localStorage.setItem("resst.basemap", "usgs");
    } catch {
      /* ignore */
    }
  });
  await openApp(page, { settled: false });
  await waitForBasemap(page, false);
  await expect(page.locator(".app-footer")).toContainText("USGS The National Map");
  await expect(trigger(page)).toHaveAccessibleName("Basemap: USGS Topo");
  // The style prefetch is gated on the esri default — a persisted USGS boot
  // must never touch Esri endpoints.
  expect(stub.rootCalls()).toBe(0);
});

test("an unreachable Esri style auto-reverts to USGS un-persisted, and Retry recovers", async ({ page }) => {
  const stub = await stubEsri(page, { failRoot: true });
  await page.addInitScript(() => {
    try {
      localStorage.setItem("resst.basemap", "esri"); // proves REMOVAL below, not mere absence
    } catch {
      /* ignore */
    }
  });
  await openApp(page, { settled: false });
  // The boot swap fails with no interaction: error status, map still on USGS.
  await expect(page.locator(".basemap-picker")).toHaveAttribute("data-status", "error", { timeout: 10_000 });
  expect(await page.evaluate(() => !!(window as any).__resstMap.getLayer("usgs-topo"))).toBe(true);
  // The broken choice was FORGOTTEN (removed), not overwritten with "usgs" —
  // a transient failure must not pin this browser off the default.
  expect(await page.evaluate(() => localStorage.getItem("resst.basemap"))).toBe(null);

  await trigger(page).click();
  await expect(page.locator(".basemap-error")).toContainText(/couldn.t load esri topo/i);
  await expect(option(page, "USGS Topo")).toBeChecked();
  await expect(option(page, "Esri Topo")).not.toBeChecked();

  // The failure must not poison the style cache — the retry goes to network.
  // (Scoped: the Layers panel has a "Retry" button too.)
  stub.setFailRoot(false);
  await page.locator(".basemap-panel").getByRole("button", { name: "Retry" }).click();
  await waitForBasemap(page, true);
  // ≥2, not an exact count: the mount prefetch and the boot swap may each
  // have burned a failed call before the retry.
  expect(stub.rootCalls()).toBeGreaterThanOrEqual(2);
  // An explicit Retry is a user choice — it persists.
  expect(await page.evaluate(() => localStorage.getItem("resst.basemap"))).toBe("esri");
});

test("the picker opens, closes, and is keyboard operable", async ({ page }) => {
  await stubEsri(page);
  await openApp(page);
  const t = trigger(page);
  await expect(t).toHaveAttribute("aria-expanded", "false");
  // Icon-only at every width — pixel-matches the 29px zoom buttons above it.
  const triggerBox = (await t.boundingBox())!;
  expect(triggerBox.width).toBe(29);
  expect(triggerBox.height).toBe(29);
  await expect(page.locator(".basemap-panel")).toHaveCount(0);

  await t.click();
  await expect(t).toHaveAttribute("aria-expanded", "true");
  await expect(option(page, "Esri Topo")).toBeChecked();
  await expect(option(page, "Esri Topo")).toBeFocused(); // opening moves focus into the group

  await page.keyboard.press("Escape");
  await expect(page.locator(".basemap-panel")).toHaveCount(0);
  await expect(t).toBeFocused(); // Escape hands focus back

  // Outside click closes it. Never click the canvas here — that selects a site.
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
    const results = await new AxeBuilder({ page }).exclude(".maplibregl-canvas").analyze();
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
  // The trigger is a 29px icon square at every width; aria-label carries the
  // accessible name.
  await expect(trigger(page)).toHaveAccessibleName("Basemap: Esri Topo");
  const boxes = await page.evaluate(() => {
    const t = document.querySelector(".basemap-trigger")!.getBoundingClientRect();
    // The toolbar wraps to extra rows at phone widths, so compare hit-testing,
    // not bounding boxes: nothing may sit over the trigger's center (the
    // toolbar's own frame is pointer-events: none).
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
