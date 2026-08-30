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

const PHONE = { width: 390, height: 844 };

async function openPhone(page: Page) {
  await page.setViewportSize(PHONE);
  await stubEsri(page);
  await stubSediment(page);
  await page.goto("./");
  await page.getByRole("button", { name: "OK" }).click();
}

async function clickDam(page: Page, lon: number, lat: number) {
  await page.evaluate(([ln, lt]) => (window as any).__resstMap.jumpTo({ center: [ln, lt], zoom: 10 }), [lon, lat]);
  await page.waitForTimeout(400);
  const pt = await page.evaluate(([ln, lt]) => {
    const p = (window as any).__resstMap.project([ln, lt]);
    return { x: p.x, y: p.y };
  }, [lon, lat]);
  const box = (await page.locator(".maplibregl-canvas").boundingBox())!;
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
  const results = await new AxeBuilder({ page }).exclude(".maplibregl-canvas").analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
});

test("phone: tapping a national reservoir counts on the bar and opens ReservoirDetails", async ({ page }) => {
  await openPhone(page);
  await page.getByRole("button", { name: "Layers" }).click();
  await page.getByRole("checkbox", { name: /All modeled reservoirs/ }).check();
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const src = (window as any).__resstMap.getSource("nat-reservoirs");
        return src ? (await src.getData()).features.length : 0;
      }),
    )
    .toBe(3);
  await page.keyboard.press("Escape");
  await clickDam(page, -96.45, 39.05); // Lone Reservoir — not crosswalked
  const bar = page.locator(".mobile-bar").getByRole("button", { name: "Selected (1)" });
  await expect(bar).toBeVisible(); // the bar now acknowledges reservoir selections
  await bar.click();
  const details = page.locator(".details-panel");
  await expect(details).toContainText("Lone Reservoir");
  await expect(details).toContainText("no documented RESST sediment-management record");
});

test("phone: the screening popover pins inside the viewport and works", async ({ page }) => {
  await openPhone(page);
  await page.getByRole("button", { name: /^Screening/ }).click();
  const panel = page.locator(".screening-panel");
  await expect(panel).toBeVisible();
  const box = (await panel.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(PHONE.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(PHONE.height + 1);
  await page.getByRole("button", { name: "Undocumented + high sedimentation" }).click();
  await expect(page.locator(".screen-count")).toContainText("1 of 3");
});
