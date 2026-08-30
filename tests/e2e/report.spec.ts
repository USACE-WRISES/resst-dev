// The Dam Report modal (round 3): compile-once snapshot, section presence for
// both target kinds, the self-contained HTML download, and print isolation.
// Hermetic: sediment fixtures + Esri/USGS tile stubs + a window.print counter.
import { readFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { stubEsri, stubUsgsTiles } from "./helpers/esriStub";
import { stubSediment } from "./helpers/sedimentFixtures";

async function openApp(page: Page) {
  await stubEsri(page);
  await stubUsgsTiles(page);
  await stubSediment(page);
  await page.addInitScript(() => {
    (window as unknown as { __printCalls: number }).__printCalls = 0;
    window.print = () => {
      (window as unknown as { __printCalls: number }).__printCalls += 1;
    };
  });
  await page.goto("./");
  await page.getByRole("button", { name: "OK" }).click();
}

async function selectSite(page: Page, name: string) {
  await page.locator(".table-panel input").first().fill(name);
  await page.locator(".data-table tbody tr", { hasText: name }).first().click();
}

/** Click the map at a dam's lng/lat (zooming in first so points separate). */
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

test("a site report compiles every section and downloads a standalone file", async ({ page }) => {
  await openApp(page);
  await selectSite(page, "Tuttle Creek");
  await page.getByRole("button", { name: "Open the dam report" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator("#report-title")).toContainText("Tuttle Creek");
  const doc = dialog.locator(".report-doc");
  await expect(doc.locator(".rpt-kicker")).toHaveText("RESST Site Report");
  // The map figure resolves to a snapshot image (stubbed 1px tiles) or the honest fallback.
  await expect(doc.locator("img.report-map, .report-map-fallback").first()).toBeVisible({ timeout: 15000 });
  for (const h of [
    "Identity and location",
    "Sediment Management",
    "Site Literature",
    "Reservoir Sustainability",
    "Evidence",
    "Reservoir Network",
    "Comparable Reservoirs",
    "References and data sources",
  ]) {
    await expect(doc.locator("h2", { hasText: h }).first()).toBeVisible();
  }
  await expect(doc).toContainText("17%"); // fixture headline stat (2.0e8 / 1.2e9)
  await expect(doc.locator(".traj-chart svg")).toBeVisible();
  await expect(doc.locator(".chart-data table")).toBeVisible(); // tableOpen: serialized expanded
  await expect(doc).toContainText("This is the last dam before the river reaches its mouth (Big River).");
  await expect(doc).toContainText("RATTES");

  const dlPromise = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Download HTML" }).click();
  const download = await dlPromise;
  expect(download.suggestedFilename()).toMatch(/^resst-report-tuttle-creek-\d{4}-\d{2}-\d{2}\.html$/);
  const body = readFileSync((await download.path())!, "utf8");
  expect(body.startsWith("<!doctype html>")).toBe(true);
  expect(body).toContain("Tuttle Creek");
  expect(body).toContain("Reservoir Sustainability");
  expect(body).not.toContain("data-report-strip"); // the live map container never serializes

  await dialog.getByRole("button", { name: "Print / save as PDF" }).click();
  expect(await page.evaluate(() => (window as unknown as { __printCalls: number }).__printCalls)).toBe(1);
  expect(await page.evaluate(() => document.body.classList.contains("report-open"))).toBe(true);

  // Print isolation: under print media only the report article renders.
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("#root")).toBeHidden();
  await expect(doc).toBeVisible();
  await expect(dialog.locator(".report-head")).toBeHidden();
  await page.emulateMedia({ media: "screen" });

  const results = await new AxeBuilder({ page }).exclude(".maplibregl-canvas").analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await page.evaluate(() => document.body.classList.contains("report-open"))).toBe(false);
});

test("a national-reservoir report reads from the core and skips site sections", async ({ page }) => {
  await openApp(page);
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
  await clickDam(page, -96.45, 39.05); // Lone Reservoir — not crosswalked, no surveys
  await expect(page.locator(".details-panel")).toContainText("Lone Reservoir");
  await page.getByRole("button", { name: "Open the dam report" }).click();
  const doc = page.getByRole("dialog").locator(".report-doc");
  await expect(doc.locator(".rpt-kicker")).toHaveText("National Inventory Reservoir Report");
  await expect(doc.locator("h1")).toHaveText("Lone Reservoir");
  await expect(doc.locator("h2", { hasText: "Reservoir Sustainability" })).toBeVisible();
  await expect(doc.locator("h2", { hasText: "Reservoir Network" })).toBeVisible();
  await expect(doc.locator("h2", { hasText: "Sediment Management" })).toHaveCount(0);
  await expect(doc.locator("h2", { hasText: "Site Literature" })).toHaveCount(0);
  await expect(doc).toContainText("Modeled only");
  await expect(doc).toContainText("headwater dam");
});

test("a site without a crosswalk still reports its team-collected record", async ({ page }) => {
  await openApp(page);
  await selectSite(page, "Fall Creek"); // fixtures crosswalk only tuttle-creek
  await page.getByRole("button", { name: "Open the dam report" }).click();
  const doc = page.getByRole("dialog").locator(".report-doc");
  await expect(doc.locator(".rpt-kicker")).toHaveText("RESST Site Report");
  await expect(doc.locator("h2", { hasText: "Sediment Management" })).toBeVisible();
  await expect(doc).toContainText("not linked to a modeled reservoir");
  await expect(doc.locator("h2", { hasText: "Reservoir Sustainability" })).toHaveCount(0);
  await expect(doc.locator("h2", { hasText: "Comparable Reservoirs" })).toHaveCount(0);
});
