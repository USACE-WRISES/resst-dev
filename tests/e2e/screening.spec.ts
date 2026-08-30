// National screening (Phase 5): the popover auto-enables the layer, presets
// fill criteria, the count readout and map filter agree, export downloads,
// and clearing restores everything. Fixture pcts: Tuttle Creek Dam 17%
// (documented) · Upstream Dam 50% (undocumented) · Lone Reservoir 10%
// (undocumented).
import { test, expect, type Page } from "@playwright/test";
import { stubEsri } from "./helpers/esriStub";
import { stubSediment } from "./helpers/sedimentFixtures";

async function openScreening(page: Page) {
  await stubEsri(page);
  await stubSediment(page);
  await page.goto("./");
  await page.getByRole("button", { name: "OK" }).click();
  await page.getByRole("button", { name: /^Screening/ }).click();
  await expect(page.locator(".screening-panel")).toBeVisible();
}

const natFilter = (page: Page) => page.evaluate(() => (window as any).__resstMap.getFilter("nat-circles") ?? null);

test("opening screening enables the layer; a gap preset filters and counts", async ({ page }) => {
  await openScreening(page);
  // Auto-enabled the national layer.
  await expect
    .poll(() => page.evaluate(() => (window as any).__resstMap.getLayoutProperty("nat-circles", "visibility")))
    .toBe("visible");
  // Wording guardrails: opportunities language plus the explicit disclaimer.
  await expect(page.locator(".screen-intro")).toContainText("warranting further evaluation");
  await expect(page.locator(".screen-intro")).toContainText("not a statement that a reservoir needs intervention");
  await expect(page.locator(".screen-intro")).toContainText("3 modeled reservoirs"); // fixture dam count, mouths excluded

  await page.getByRole("button", { name: "Undocumented + high sedimentation" }).click();
  await expect(page.locator(".screen-count")).toContainText("1 of 3 modeled reservoirs match");
  const f = JSON.stringify(await natFilter(page));
  expect(f).toContain('"pl25"');
  expect(f).toContain('"doc"');

  await page.getByRole("button", { name: "Documented + low sedimentation", exact: true }).click();
  await expect(page.locator(".screen-count")).toContainText("1 of 3");

  await page.getByRole("button", { name: "Clear screening" }).click();
  await expect(page.locator(".screen-count")).toContainText("Pick a preset or criterion");
  expect(await natFilter(page)).toBeNull();
});

test("criteria compose and export downloads the matching rows", async ({ page }) => {
  await openScreening(page);
  await page.getByRole("button", { name: "Undocumented + high sedimentation" }).click();
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export matches (CSV)" }).click();
  const download = await dl;
  expect(download.suggestedFilename()).toMatch(/^resst-screening-\d{4}-\d{2}-\d{2}\.csv$/);
  await page.getByRole("button", { name: "Zoom to matches" }).click(); // must not throw
});

test("turning the national layer off ends the screening session", async ({ page }) => {
  await openScreening(page);
  await page.getByRole("button", { name: "Undocumented + high sedimentation" }).click();
  await expect(page.locator(".screen-count")).toContainText("1 of 3");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Layers" }).click();
  await page.getByRole("checkbox", { name: /All modeled reservoirs/ }).uncheck();
  await page.keyboard.press("Escape");
  expect(await natFilter(page)).toBeNull();
  // Reopening screening re-enables the layer with a fresh (inactive) session.
  await page.getByRole("button", { name: /^Screening/ }).click();
  await expect(page.locator(".screen-count")).toContainText("Pick a preset or criterion");
});
