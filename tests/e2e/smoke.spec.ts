// End-to-end smoke + parity checks against the production build.
// Baselines come from the live Experience Builder capture (assessment §4).
import { test, expect, type Page } from "@playwright/test";

async function openApp(page: Page): Promise<void> {
  await page.goto("./");
  await page.getByRole("button", { name: "OK" }).click(); // welcome dialog
}

test("loads with the verified counters and a rendered map", async ({ page }) => {
  await openApp(page);
  const counts = page.locator(".filtered-counts");
  await expect(counts).toContainText("Sites: 979");
  await expect(counts).toContainText("Site Literature: 1,192");
  await expect(counts).toContainText("General Literature: 214");

  // The map style must fully load and render site circles.
  await page.waitForFunction(() => {
    const m = (window as any).__resstMap;
    return m && m.isStyleLoaded() && m.loaded();
  }, undefined, { timeout: 30_000 });
  const rendered = await page.evaluate(() =>
    (window as any).__resstMap.queryRenderedFeatures({ layers: ["sites-circles"] }).length,
  );
  expect(rendered).toBeGreaterThan(50);
});

test("filter baselines reproduce through the UI: 8 → 77 → 42", async ({ page }) => {
  await openApp(page);
  const item = (label: string) => page.locator(".filter-item", { has: page.locator(`label:text-is("${label}")`) });
  const value = (label: string, v: string) => item(label).locator(".value-option", { hasText: v }).locator("input");

  await item("Sediment Release").locator(".expander").click();
  await value("Sediment Release", "Dam Removal").check();
  await item("Sediment Release").getByRole("switch").check();
  await expect(page.locator(".filtered-counts")).toContainText("Sites: 8");

  await value("Sediment Release", "Drawdown").check();
  await expect(page.locator(".filtered-counts")).toContainText("Sites: 77");

  await item("Site Type").locator(".expander").click();
  await value("Site Type", "Flood Control").check();
  await item("Site Type").getByRole("switch").check();
  await expect(page.locator(".filtered-counts")).toContainText("Sites: 42");
  await expect(page.locator(".table-footer")).toContainText("Total: 42");

  await page.getByRole("button", { name: "Clear all" }).click();
  await expect(page.locator(".filtered-counts")).toContainText("Sites: 979");
});

test("selecting Tuttle Creek shows its literature and NID record", async ({ page }) => {
  await openApp(page);
  await page.locator(".data-table tbody tr", { hasText: "Tuttle Creek" }).first().click();
  const details = page.locator(".details-panel");
  await expect(details).toContainText("Tuttle Creek");
  await expect(details).toContainText("Site Literature (6)");
  await expect(details).toContainText("Tuttle Creek Dam - Blue Rapids Levee");
  await expect(details).toContainText("Selected Sites: 1");
});

test("exports download the filtered rows", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "Actions" }).click();
  const dl = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Export CSV" }).click();
  const download = await dl;
  expect(download.suggestedFilename()).toMatch(/^resst-sites-\d{4}-\d{2}-\d{2}\.csv$/);
});

test("help overlay shows the five ported workflows", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "Help" }).click();
  const pills = page.locator(".help-pills .pill");
  await expect(pills).toHaveText(["About", "By Reservoir", "By HUC", "By River", "By Category"]);
  await pills.nth(1).click();
  await expect(page.locator(".help-text")).toContainText("Targeted Reservoir Analysis");
  await expect(page.locator(".help-image")).toBeVisible();
  await page.keyboard.press("Escape");
});

test("map views apply overlay sets", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "Views" }).click();
  await page.locator(".view-card", { hasText: "USGS HUC2" }).click();
  await page.getByRole("button", { name: "Layers" }).click();
  await expect(
    page.locator(".layers-list .value-option", { hasText: "HUC 2" }).locator("input"),
  ).toBeChecked();
});
