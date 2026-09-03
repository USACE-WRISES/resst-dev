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

/** Whether screening is masking the national dots on the map. */
const masked = (page: Page) => page.evaluate(() => (window as any).__resstMapInfo.screeningMasked() as boolean);

test("opening screening enables the layer; a gap preset filters and counts", async ({ page }) => {
  await openScreening(page);
  // Auto-enabled the national layer.
  await expect.poll(() => page.evaluate(() => (window as any).__resstMapInfo.nationalVisible())).toBe(true);
  // The intro is short and factual; the research-use disclaimer lives on the
  // welcome dialog now (smoke.spec) and the guardrail phrasing in Help (helpContent.test).
  await expect(page.locator(".screen-intro")).toContainText("with transparent criteria");
  await expect(page.locator(".screen-intro")).toContainText("3 modeled reservoirs"); // fixture dam count, mouths excluded

  await page.getByRole("button", { name: "Undocumented + high sedimentation" }).click();
  await expect(page.locator(".screen-count")).toContainText("1 of 3 modeled reservoirs match");
  // The map hides the dots that fail the criteria: 1 of the 3 fixture dams stays.
  await expect.poll(() => masked(page)).toBe(true);
  await expect.poll(() => page.evaluate(() => (window as any).__resstMapInfo.counts().national)).toBe(1);

  await page.getByRole("button", { name: "Documented + low sedimentation", exact: true }).click();
  await expect(page.locator(".screen-count")).toContainText("1 of 3");

  await page.getByRole("button", { name: "Clear screening" }).click();
  await expect(page.locator(".screen-count")).toContainText("Pick a preset or criterion");
  await expect.poll(() => masked(page)).toBe(false);
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
  await expect.poll(() => masked(page)).toBe(false);
  // Reopening screening re-enables the layer with a fresh (inactive) session.
  await page.getByRole("button", { name: /^Screening/ }).click();
  await expect(page.locator(".screen-count")).toContainText("Pick a preset or criterion");
});
