// National screening, the docked panel (owner decision 2026-09-25): opening
// it switches the national layer on, the four questions show what each
// would find and filter the map, Refine composes on top, the results bar
// counts / zooms / exports, and the panel stays open while the map is used
// (✕ or an Escape from inside closes it). Fixture pcts: Tuttle Creek Dam 17%
// (documented, terminal) · Upstream Dam 50% (undocumented) · Lone Reservoir
// 10% (undocumented, terminal).
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
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
const question = (page: Page, title: string) => page.getByRole("button", { name: new RegExp(`^${title}`) });

test("opening screening enables the layer; a question filters and counts", async ({ page }) => {
  await openScreening(page);
  // Auto-enabled the national layer.
  await expect.poll(() => page.evaluate(() => (window as any).__resstMapInfo.nationalVisible())).toBe(true);
  // The intro is short and factual; the research-use disclaimer lives on the
  // welcome dialog (smoke.spec) and the guardrail phrasing in Help (helpContent.test).
  await expect(page.locator(".screen-intro")).toContainText("with transparent criteria");
  await expect(page.locator(".screen-intro")).toHaveAttribute("title", "3 modeled reservoirs"); // fixture dam count, mouths excluded
  await expect(page.locator(".screen-count")).toContainText("Choose a question");

  // Each question shows what it would find before it is chosen.
  await expect(question(page, "Potential case studies")).toHaveAccessibleName("Potential case studies 0");
  await expect(question(page, "Potential opportunities")).toHaveAccessibleName("Potential opportunities 1");
  await expect(question(page, "Potential opportunities")).toHaveAccessibleDescription(/Not documented/);

  await question(page, "Potential opportunities").click();
  await expect(question(page, "Potential opportunities")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".screen-count")).toContainText("1 of 3 modeled reservoirs match");
  // The map hides the dots that fail the criteria: 1 of the 3 fixture dams stays.
  await expect.poll(() => masked(page)).toBe(true);
  await expect.poll(() => page.evaluate(() => (window as any).__resstMapInfo.counts().national)).toBe(1);
  await expect(page.getByRole("button", { name: /^Screening \(active/ })).toBeVisible();

  await question(page, "Possibly proactive").click();
  await expect(page.locator(".screen-count")).toContainText("1 of 3");
  await expect(question(page, "Potential opportunities")).toHaveAttribute("aria-pressed", "false");

  // Choosing the selected question again un-chooses it: nothing filters.
  await question(page, "Possibly proactive").click();
  await expect(page.locator(".screen-count")).toContainText("Choose a question");
  await expect.poll(() => masked(page)).toBe(false);

  await question(page, "Potential opportunities").click();
  await page.getByRole("button", { name: "Clear screening" }).click();
  await expect(page.locator(".screen-count")).toContainText("Choose a question");
  await expect.poll(() => masked(page)).toBe(false);
});

test("refinements compose with the question and every count follows", async ({ page }) => {
  await openScreening(page);
  const refine = page.locator(".screen-refine");
  await refine.locator("summary").click();
  await refine.getByRole("checkbox", { name: "Terminal dams only" }).check();
  await expect(page.locator(".screen-count")).toContainText("2 of 3 modeled reservoirs match");
  await expect(refine.locator("summary")).toContainText("(1 active)");
  // Upstream Dam is not terminal, so the opportunities question now finds nothing.
  await expect(question(page, "Potential opportunities")).toHaveAccessibleName("Potential opportunities 0");
  await question(page, "Lower current priority").click();
  await expect(page.locator(".screen-count")).toContainText("1 of 3"); // Lone Reservoir
  // A custom 2025-loss choice replaces the question (no longer selected).
  await refine.getByLabel("Capacity lost by 2025").selectOption({ label: "50% or more" });
  await expect(question(page, "Lower current priority")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".screen-count")).toContainText("0 of 3");
});

test("criteria compose and export downloads the matching rows", async ({ page }) => {
  await openScreening(page);
  await question(page, "Potential opportunities").click();
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export matches (CSV)" }).click();
  const download = await dl;
  expect(download.suggestedFilename()).toMatch(/^resst-screening-\d{4}-\d{2}-\d{2}\.csv$/);
  await page.getByRole("button", { name: "Zoom to matches" }).click(); // must not throw
});

test("the panel stays open while the map is used; ✕ and a focused Escape close it", async ({ page }) => {
  await openScreening(page);
  await question(page, "Potential opportunities").click();
  // A click on the map (well clear of the panel) leaves it open.
  const box = (await page.locator(".map-panel").boundingBox())!;
  await page.mouse.click(box.x + box.width - 80, box.y + box.height - 60);
  await expect(page.locator(".screening-panel")).toBeVisible();

  // An Escape meant for something else (disarming a Select tool) leaves it open.
  await page.locator(".map-toolbar").getByRole("button", { name: /^Select/ }).click();
  await page.locator(".select-menu").getByRole("button", { name: /^Box/ }).click();
  await expect(page.locator(".map-hint-bar")).toBeVisible();
  await page.locator(".map-panel").hover();
  await page.keyboard.press("Escape");
  await expect(page.locator(".map-hint-bar")).toHaveCount(0);
  await expect(page.locator(".screening-panel")).toBeVisible();

  // Escape from inside closes it and hands focus back to the toggle.
  await question(page, "Potential opportunities").focus();
  await page.keyboard.press("Escape");
  await expect(page.locator(".screening-panel")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Screening/ })).toBeFocused();

  // ✕ closes it too; the criteria survive the close.
  await page.getByRole("button", { name: /^Screening/ }).click();
  await expect(page.locator(".screen-count")).toContainText("1 of 3");
  await page.getByRole("button", { name: "Close screening" }).click();
  await expect(page.locator(".screening-panel")).toHaveCount(0);
});

test("map search suggestions stay usable above the open panel", async ({ page }) => {
  // Places come from the USGS gazetteer: answer empty so only site matches list.
  await page.route(/carto\.nationalmap\.gov\/arcgis\/rest\/services\/geonames\//, (route) =>
    route.fulfill({ json: { features: [] } }),
  );
  await openScreening(page);
  await page.getByRole("combobox", { name: "Find a site or place by name" }).fill("Tuttle");
  const option = page.getByRole("option", { name: /Tuttle Creek/ }).first();
  await expect(option).toBeVisible();
  await option.click();
  await expect(page.locator(".details-panel .site-name")).toHaveText("Tuttle Creek");
  await expect(page.locator(".screening-panel")).toBeVisible();
});

test("turning the national layer off ends the session and closes the panel", async ({ page }) => {
  await openScreening(page);
  await question(page, "Potential opportunities").click();
  await expect(page.locator(".screen-count")).toContainText("1 of 3");
  await page.getByRole("button", { name: "Layers" }).click();
  await page.getByRole("checkbox", { name: /All modeled reservoirs/ }).uncheck();
  await page.keyboard.press("Escape");
  await expect.poll(() => masked(page)).toBe(false);
  await expect(page.locator(".screening-panel")).toHaveCount(0);
  // The layer stays off (the closed panel does not switch it back on)…
  await expect.poll(() => page.evaluate(() => (window as any).__resstMapInfo.nationalVisible())).toBe(false);
  // …and reopening screening re-enables it with a fresh (inactive) session.
  await page.getByRole("button", { name: /^Screening/ }).click();
  await expect(page.locator(".screen-count")).toContainText("Choose a question");
  await expect.poll(() => page.evaluate(() => (window as any).__resstMapInfo.nationalVisible())).toBe(true);
});

test("the open Screening panel is axe-clean", async ({ page }) => {
  await openScreening(page);
  await question(page, "Potential opportunities").click();
  await page.locator(".screen-refine summary").click();
  const results = await new AxeBuilder({ page })
    .exclude(".leaflet-tile-pane")
    .exclude(".leaflet-pane svg")
    .exclude(".leaflet-pane canvas")
    .exclude(".leaflet-tooltip-pane")
    .analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes.length} nodes`)).toEqual([]);
});
