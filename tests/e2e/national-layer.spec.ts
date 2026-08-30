// National inventory layer (Phase 4): Layers-panel toggle + metric picker,
// legend ramp, click routing (documented dam → site experience; undocumented
// dam → ReservoirDetails), the site/reservoir mutual-exclusivity invariant,
// and a11y. Hermetic via the sediment fixtures (3 dams + 1 mouth; Tuttle
// Creek Dam shares coordinates with the real tuttle-creek site).
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { stubEsri } from "./helpers/esriStub";
import { stubSediment } from "./helpers/sedimentFixtures";

async function openWithLayer(page: Page) {
  await stubEsri(page);
  await stubSediment(page);
  await page.goto("./");
  await page.getByRole("button", { name: "OK" }).click();
  await page.getByRole("button", { name: "Layers" }).click();
  await page.getByRole("checkbox", { name: /All modeled reservoirs/ }).check();
  // The fixture core is tiny — wait until the layer is fed and visible.
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const m = (window as any).__resstMap;
        const src = m.getSource("nat-reservoirs");
        if (!src || m.getLayoutProperty("nat-circles", "visibility") !== "visible") return 0;
        return (await src.getData()).features.length;
      }),
    )
    .toBe(3); // mouth node excluded
  await page.keyboard.press("Escape"); // close the popover
}

/** Click the map at a dam's lng/lat (zooming in first so points separate). */
async function clickDam(page: Page, lon: number, lat: number) {
  await page.evaluate(
    ([ln, lt]) => (window as any).__resstMap.jumpTo({ center: [ln, lt], zoom: 10 }),
    [lon, lat],
  );
  await page.waitForTimeout(400); // let the moved frame render before hit-testing
  const pt = await page.evaluate(([ln, lt]) => {
    const p = (window as any).__resstMap.project([ln, lt]);
    return { x: p.x, y: p.y };
  }, [lon, lat]);
  const canvas = page.locator(".maplibregl-canvas");
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + pt.x, box.y + pt.y);
}

test("toggle + metric picker style the layer and the legend follows", async ({ page }) => {
  await openWithLayer(page);
  await page.getByRole("button", { name: "Legend" }).click();
  await expect(page.locator(".legend-ramp-title")).toContainText("Percent capacity lost (2025)");
  await expect(page.locator(".legend-ramp")).toContainText("≥75% lost");
  await expect(page.locator(".legend-list")).toContainText("RESST documented site");
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Layers" }).click();
  await page.locator(".metric-select").selectOption("evidence");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Legend" }).click();
  await expect(page.locator(".legend-ramp-title")).toContainText("RATTES model class");
  await expect(page.locator(".legend-ramp")).toContainText("Survey-constrained");
  // The paint switched to the categorical match expression.
  const paint = await page.evaluate(() => (window as any).__resstMap.getPaintProperty("nat-circles", "circle-color"));
  expect(JSON.stringify(paint)).toContain("match");
});

test("clicking an undocumented dam opens ReservoirDetails; a documented dam routes to its site", async ({ page }) => {
  await openWithLayer(page);

  // Lone Reservoir (ShortID 30) — no crosswalk.
  await clickDam(page, -96.45, 39.05);
  const details = page.locator(".details-panel");
  await expect(details).toContainText("Lone Reservoir");
  await expect(details).toContainText("no documented RESST sediment-management record");
  await expect(details).toContainText("Reservoir Sustainability");
  await expect(details.locator("#detail-sec-sust")).toContainText("Est. capacity lost (2025)");
  await expect(details).toContainText("Reservoir Network");
  await expect(details.locator("#detail-sec-lit")).toHaveCount(0); // no literature section for reservoirs
  await expect(page.locator(".maplibregl-popup")).toContainText("Lone Reservoir");
  await expect(page.locator(".maplibregl-popup")).toContainText("Modeled only");

  // Tuttle Creek Dam (ShortID 10) shares coordinates with the documented site
  // — the site wins and the full site experience renders.
  await clickDam(page, -96.5943, 39.2562);
  await expect(details).toContainText("Site Literature (6)");
  await expect(details).toContainText("Sediment Management");
});

test("site and reservoir selection stay mutually exclusive through a full cycle", async ({ page }) => {
  await openWithLayer(page);
  const details = page.locator(".details-panel");

  // reservoir → site (via table) → reservoir → Clear.
  await clickDam(page, -96.45, 39.05);
  await expect(details).toContainText("Lone Reservoir");
  await page.locator(".table-panel input").first().fill("Fall Creek");
  await page.locator(".data-table tbody tr", { hasText: "Fall Creek" }).first().click();
  await expect(details).toContainText("Fall Creek");
  await expect(details).not.toContainText("Lone Reservoir");
  await clickDam(page, -96.45, 39.05);
  await expect(details).toContainText("Lone Reservoir");
  await expect(details).toContainText("Selected Sites: 0"); // no site selection alongside
  await details.getByRole("button", { name: "Clear" }).click();
  await expect(details).toContainText("Select a site on the map");
});

test("the reservoir panel is axe-clean", async ({ page }) => {
  await openWithLayer(page);
  await clickDam(page, -96.45, 39.05);
  await expect(page.locator(".details-panel")).toContainText("Lone Reservoir");
  const results = await new AxeBuilder({ page }).exclude(".maplibregl-canvas").analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes.length} nodes`)).toEqual([]);
});
