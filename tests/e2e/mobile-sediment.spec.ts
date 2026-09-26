// Narrow-screen coverage for the sedimentation expansion (390×844): the
// details drawer carries the new sections and chart, the mobile bar counts a
// national-reservoir selection (it only knew about sites before), and the
// screening popover pins itself inside a phone viewport. Hermetic via the
// sediment fixtures.
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { stubEsri } from "./helpers/esriStub";
import { stubSediment } from "./helpers/sedimentFixtures";
import { openDetailSection } from "./helpers/sections";
import { waitForMapIdle } from "./helpers/mapReady";
import { showPanels } from "./helpers/panels";

const PHONE = { width: 390, height: 844 };

async function openPhone(page: Page) {
  await page.setViewportSize(PHONE);
  await stubEsri(page);
  await stubSediment(page);
  await page.goto("./");
  await page.getByRole("button", { name: "OK" }).click();
  await showPanels(page, { table: true }); // phones open clean too; the table's tab opens it
}

async function clickDam(page: Page, lon: number, lat: number) {
  await page.evaluate(([ln, lt]) => (window as any).__resstMapInfo.jumpTo(ln, lt, 10), [lon, lat]);
  await page.waitForTimeout(400);
  const pt = await page.evaluate(([ln, lt]) => (window as any).__resstMapInfo.project(ln, lt), [lon, lat]);
  const box = (await page.locator(".map-panel").boundingBox())!;
  await page.mouse.click(box.x + pt.x, box.y + pt.y);
}

test("phone: a site's sediment sections render inside the details drawer", async ({ page }) => {
  await openPhone(page);
  await page.locator(".table-panel input").first().fill("Tuttle");
  await page.locator(".data-table tbody tr", { hasText: "Tuttle Creek" }).first().click();
  await page.locator(".mobile-bar").getByRole("button", { name: "Selected (1)" }).click();
  const details = page.locator(".details-panel");
  await expect(details).toBeVisible();
  await expect(details).toContainText("Sediment Management");
  await expect(details).toContainText("Reservoir Sustainability");
  await openDetailSection(page, "Reservoir Sustainability");
  const svg = details.locator(".traj-chart svg");
  await svg.scrollIntoViewIfNeeded();
  await expect(svg).toBeVisible();
  const box = (await svg.boundingBox())!;
  expect(box.width).toBeGreaterThan(200); // the chart actually uses the drawer width
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(PHONE.width + 1);
  const results = await new AxeBuilder({ page }).exclude(".leaflet-tile-pane").exclude(".leaflet-pane svg").exclude(".leaflet-pane canvas").exclude(".leaflet-tooltip-pane").analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
});

test("phone: the card ⓘ popovers stay inside the details drawer", async ({ page }) => {
  await openPhone(page);
  await page.locator(".table-panel input").first().fill("Tuttle");
  await page.locator(".data-table tbody tr", { hasText: "Tuttle Creek" }).first().click();
  await page.locator(".mobile-bar").getByRole("button", { name: "Selected (1)" }).click();
  await openDetailSection(page, "Reservoir Network");
  const net = page.locator("#detail-sec-net");
  const btn = net.locator(".source-line .prov-info-btn");
  await btn.scrollIntoViewIfNeeded();
  await btn.click();
  const pop = net.locator(".prov-pop");
  await expect(pop).toBeVisible();
  const panel = (await page.locator(".details-panel").boundingBox())!;
  const b = (await pop.boundingBox())!;
  expect(b.x).toBeGreaterThanOrEqual(panel.x);
  expect(b.x + b.width).toBeLessThanOrEqual(panel.x + panel.width);
  expect(b.y + b.height).toBeLessThanOrEqual(PHONE.height); // scrolled into view, not clipped below
});

test("phone: tapping a national reservoir counts on the bar and opens ReservoirDetails", async ({ page }) => {
  await openPhone(page);
  await page.getByRole("button", { name: "Layers" }).click();
  await page.getByRole("checkbox", { name: /All modeled reservoirs/ }).check();
  await expect.poll(() => page.evaluate(() => (window as any).__resstMapInfo.counts().national)).toBe(3);
  await page.keyboard.press("Escape");
  await clickDam(page, -96.45, 39.05); // Lone Reservoir — not crosswalked
  const bar = page.locator(".mobile-bar").getByRole("button", { name: "Selected (1)" });
  await expect(bar).toBeVisible(); // the bar now acknowledges reservoir selections
  await bar.click();
  const details = page.locator(".details-panel");
  await expect(details).toContainText("Lone Reservoir");
  await expect(details).toContainText("No documented RESST sediment-management record");
});

test("phone: the screening panel pins inside the viewport, works, and closes on an outside tap", async ({ page }) => {
  await openPhone(page);
  await page.getByRole("button", { name: /^Screening/ }).click();
  const panel = page.locator(".screening-panel");
  await expect(panel).toBeVisible();
  const box = (await panel.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(PHONE.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(PHONE.height + 1);
  await page.getByRole("button", { name: /^Potential opportunities/ }).click();
  await expect(page.locator(".screen-count")).toContainText("1 of 3");
  // On a phone the panel covers the map, so a tap outside it closes it.
  await page.locator(".app-footer").click();
  await expect(panel).toHaveCount(0);
});

test("phone: the popup clears the two-row toolbar, and Show details opens the drawer", async ({ page }) => {
  await openPhone(page);
  await page.locator(".table-panel input").first().fill("Tuttle");
  await page.locator(".data-table tbody tr", { hasText: "Tuttle Creek" }).first().click();
  const more = page.locator(".leaflet-popup").getByRole("button", { name: "Show details" });
  await expect(more).toBeVisible();
  // The phone toolbar wraps onto two rows; the camera aims the site low enough
  // that the popup (with its Show details button) sits below them.
  await waitForMapIdle(page);
  const popup = (await page.locator(".leaflet-popup").boundingBox())!;
  const toolbar = (await page.locator(".map-toolbar").boundingBox())!;
  expect(popup.y).toBeGreaterThanOrEqual(toolbar.y + toolbar.height);
  await more.click();
  const details = page.locator(".details-panel");
  await expect(details).toBeInViewport();
  await expect(details.locator(".site-name")).toHaveText("Tuttle Creek");
  // The toggle under the drawer now offers to hide it.
  await expect(page.locator(".leaflet-popup").locator('[data-action="details"]')).toHaveAttribute("aria-expanded", "true");
});
