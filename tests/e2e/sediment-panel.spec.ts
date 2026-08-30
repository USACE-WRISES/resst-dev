// Selected-dam sedimentation experience (Phase 2 of the decision-support
// expansion): the reorganized details panel with its Reservoir Sustainability
// (RATTES headline stats + trajectory chart) and Evidence (RESSED surveys)
// sections, provenance labeling, degraded states, retry, and a11y — all
// hermetic against the tiny fixtures in helpers/sedimentFixtures.ts.
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { stubEsri } from "./helpers/esriStub";
import { stubSediment, type SedimentRouteOptions } from "./helpers/sedimentFixtures";
import { openDetailSection } from "./helpers/sections";

async function openApp(page: Page, options?: SedimentRouteOptions) {
  await stubEsri(page);
  const routes = await stubSediment(page, options);
  await page.goto("./");
  await page.getByRole("button", { name: "OK" }).click();
  return routes;
}

async function selectSite(page: Page, name: string) {
  await page.locator(".table-panel input").first().fill(name);
  await page.locator(".data-table tbody tr", { hasText: name }).first().click();
}

test("a crosswalked site shows modeled sustainability stats and the trajectory chart", async ({ page }) => {
  await openApp(page);
  await selectSite(page, "Tuttle Creek");
  const details = page.locator(".details-panel");

  // Every card starts collapsed (round 3); the team sections still lead the order.
  await expect(details.locator(".detail-sec-head", { hasText: "Sediment Management" })).toHaveAttribute("aria-expanded", "false");
  await expect(details.locator(".detail-sec-head", { hasText: "Site Literature" })).toHaveAttribute("aria-expanded", "false");

  // Headline stats from the boot-loaded link (fixture: 2.0e8 / 1.2e9 = 17%).
  await openDetailSection(page, "Reservoir Sustainability");
  const sust = details.locator("#detail-sec-sust");
  await expect(details).toContainText("Reservoir Sustainability");
  await expect(sust).toContainText("Est. capacity lost (2025)");
  await expect(sust).toContainText("17%");
  await expect(sust).toContainText("29%"); // projected lost by 2050 = 3.5e8 / 1.2e9
  await expect(sust).toContainText("Original storage capacity");

  // Chart: modeled lines + the two measured fixture surveys as dots.
  const svg = sust.locator(".traj-chart svg");
  await expect(svg).toBeVisible();
  const label = await svg.getAttribute("aria-label");
  expect(label).toContain("Tuttle Creek");
  expect(label).toContain("2 measured surveys shown");
  await expect(sust.locator(".traj-survey")).toHaveCount(2);
  await expect(sust.locator(".chart-legend")).toContainText("Modeled capacity (RATTES)");
  await expect(sust.locator(".chart-legend")).toContainText("Measured survey (RESSED)");

  // Provenance: badges + the source note. The words are the contract.
  await expect(details.locator(".prov-badge[data-type='modeled']").first()).toContainText("Modeled");
  await expect(details.locator(".prov-badge[data-type='reported']").first()).toContainText("Reported");
  await expect(sust).toContainText("RATTES v1.2 · silt scenario · modeled estimate");

  // The accessible data table exposes the numbers.
  await sust.locator(".chart-data summary").click();
  await expect(sust.locator(".chart-data table")).toContainText("2050*");
  await expect(sust.locator(".chart-data")).toContainText("projected (RATTES v1.2, silt scenario)");
});

test("evidence section: badge from boot data, measured surveys after the lazy load", async ({ page }) => {
  await openApp(page);
  await selectSite(page, "Tuttle Creek");
  const details = page.locator(".details-panel");

  const evHead = details.locator(".detail-sec-head", { hasText: "Evidence" });
  await expect(evHead).toHaveAttribute("aria-expanded", "false"); // collapsed by default
  await expect(evHead.locator(".prov-badge")).toContainText("Measured · 2000"); // badge visible while collapsed

  await evHead.click();
  const ev = details.locator("#detail-sec-evid");
  await expect(ev.locator(".survey-list li")).toHaveCount(2);
  await expect(ev).toContainText("1970");
  await expect(ev).toContainText("measured capacity");
  await expect(ev).toContainText("RESSED");
  // The RATTES model-class line (fixture Tuttle is evd=1, survey-constrained).
  await expect(ev.locator(".rattes-class")).toContainText("calibrates this reservoir's estimate");
});

test("a site without a crosswalk degrades to one honest note", async ({ page }) => {
  await openApp(page);
  await selectSite(page, "Fall Creek"); // fixtures crosswalk only tuttle-creek
  const details = page.locator(".details-panel");
  await expect(details).toContainText("not linked to a modeled reservoir");
  await expect(details.locator("#detail-sec-sust")).toHaveCount(0);
  await expect(details.locator("#detail-sec-evid")).toHaveCount(0);
  // Team sections unaffected.
  await expect(details).toContainText("Sediment Management");
  await expect(details.locator(".detail-sec-head", { hasText: "National Inventory of Dams" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
});

test("all cards start collapsed; an opened section stays open across sites (store-backed)", async ({ page }) => {
  await openApp(page);
  await selectSite(page, "Tuttle Creek");
  const details = page.locator(".details-panel");
  for (const title of ["Sediment Management", "Site Literature", "Reservoir Sustainability", "Evidence", "Reservoir Network", "Comparable Reservoirs", "National Inventory of Dams"]) {
    await expect(details.locator(".detail-sec-head", { hasText: title })).toHaveAttribute("aria-expanded", "false");
  }
  const mgmt = details.locator(".detail-sec-head", { hasText: "Sediment Management" });
  await mgmt.click();
  await expect(mgmt).toHaveAttribute("aria-expanded", "true");
  await selectSite(page, "Fall Creek");
  await expect(details.locator(".detail-sec-head", { hasText: "Sediment Management" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
});

test("trajectory failure surfaces an error and Retry recovers", async ({ page }) => {
  const routes = await openApp(page, { failing: ["inventory", "trajectories"] });
  await selectSite(page, "Tuttle Creek");
  await openDetailSection(page, "Reservoir Sustainability");
  const sust = page.locator("#detail-sec-sust");
  // Headline stats still render (boot link data); the chart area reports the failure.
  await expect(sust).toContainText("Est. capacity lost (2025)");
  const status = sust.locator(".sec-status[data-status='error']");
  await expect(status).toContainText("Trajectory failed to load");
  routes.clearFailures();
  await status.getByRole("button", { name: "Retry" }).click();
  await expect(sust.locator(".traj-chart svg")).toBeVisible();
});

test("the expanded sedimentation panel is axe-clean", async ({ page }) => {
  await openApp(page);
  await selectSite(page, "Tuttle Creek");
  await openDetailSection(page, "Reservoir Sustainability");
  await page.locator(".detail-sec-head", { hasText: "Evidence" }).click();
  await expect(page.locator(".traj-chart svg")).toBeVisible();
  await page.locator(".chart-data summary").click();
  const results = await new AxeBuilder({ page }).exclude(".maplibregl-canvas").analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes.length} nodes`)).toEqual([]);
});
