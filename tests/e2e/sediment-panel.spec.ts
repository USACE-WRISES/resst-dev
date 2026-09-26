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
import { showPanels } from "./helpers/panels";

async function openApp(page: Page, options?: SedimentRouteOptions) {
  await stubEsri(page);
  const routes = await stubSediment(page, options);
  await page.goto("./");
  await page.getByRole("button", { name: "OK" }).click();
  await showPanels(page);
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
  // Summary line, then the surveys as a Year | Capacity | Sediment table.
  await expect(ev.locator(".card-lead")).toContainText("2 measured surveys");
  await expect(ev.locator(".card-lead")).toContainText("1970 to 2000");
  await expect(ev.locator(".survey-table tbody tr")).toHaveCount(2);
  await expect(ev.locator(".survey-table thead")).toContainText("Capacity");
  await expect(ev).toContainText("RESSED");
  // Round-3 enrichment behind the methods disclosure: codes spelled out,
  // month from the full date, free-text note.
  await ev.locator(".survey-details summary").click();
  const first = ev.locator(".survey-details li").first();
  await expect(first).toBeVisible();
  await expect(first).toContainText("(Jul)");
  await expect(first).toContainText("range and contour survey, detailed");
  await expect(first).toContainText("sediment pool");
  await expect(ev.locator(".survey-details li").nth(1)).toContainText("hydrographic & field surveys");
  // The glossary popover opens and stays honest about undocumented codes.
  await ev.getByRole("button", { name: "About survey codes" }).click();
  await expect(ev.locator(".codes-pop")).toContainText("total pool");
  await expect(ev.locator(".codes-pop")).toContainText("not defined in the public documentation");
  await page.keyboard.press("Escape");
  await expect(ev.locator(".codes-pop")).toHaveCount(0);
  // Original records: fixture id 32003 is a legacy dsnum → the scanned datasheet links.
  const dsLink = ev.getByRole("link", { name: "Original datasheet (PDF)" });
  await expect(dsLink).toHaveAttribute("href", "https://water.usgs.gov/osw/ressed/datasheets/32-3.pdf");
  await expect(ev.getByRole("link", { name: "All RESSED datasheets" })).toBeVisible();
  await expect(ev.locator(".evidence-agency")).toContainText("Surveys by USACE Kansas City District");
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

test("all cards start collapsed; one opens at a time and stays open across sites (store-backed)", async ({ page }) => {
  await openApp(page);
  await selectSite(page, "Tuttle Creek");
  const details = page.locator(".details-panel");
  for (const title of ["Sediment Management", "Site Literature", "Reservoir Sustainability", "Evidence", "Reservoir Network", "Comparable Reservoirs", "National Inventory of Dams"]) {
    await expect(details.locator(".detail-sec-head", { hasText: title })).toHaveAttribute("aria-expanded", "false");
  }
  // The collapsed headers still summarize: the Sustainability peek and the badges.
  await expect(details.locator(".detail-sec-head", { hasText: "Reservoir Sustainability" }).locator(".sec-peek")).toHaveText("17% lost");

  // One card at a time (owner decision 2026-09-25): opening Evidence closes Sustainability.
  const sustHead = details.locator(".detail-sec-head", { hasText: "Reservoir Sustainability" });
  const evHead = details.locator(".detail-sec-head", { hasText: "Evidence" });
  await sustHead.click();
  await expect(sustHead).toHaveAttribute("aria-expanded", "true");
  await evHead.click();
  await expect(evHead).toHaveAttribute("aria-expanded", "true");
  await expect(sustHead).toHaveAttribute("aria-expanded", "false");
  await expect(details.locator("#detail-sec-sust")).toBeHidden();

  const mgmt = details.locator(".detail-sec-head", { hasText: "Sediment Management" });
  await mgmt.click();
  await expect(mgmt).toHaveAttribute("aria-expanded", "true");
  await expect(evHead).toHaveAttribute("aria-expanded", "false");
  await selectSite(page, "Fall Creek");
  await expect(details.locator(".detail-sec-head", { hasText: "Sediment Management" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
});

test("the open card is marked, and its header stays pinned while the card scrolls", async ({ page }) => {
  await openApp(page);
  await selectSite(page, "Tuttle Creek");
  const details = page.locator(".details-panel");
  const head = details.locator(".detail-sec-head", { hasText: "Reservoir Sustainability" });
  await head.click();
  await expect(page.locator(".traj-chart svg")).toBeVisible();

  // One marked card: the tinted header band over an accent edge, and the pin.
  await expect(details.locator(".detail-section.is-open")).toHaveCount(1);
  await expect(head).toHaveCSS("background-color", "rgb(238, 245, 248)");
  await expect(details.locator(".detail-section.is-open > .sec-h")).toHaveCSS("position", "sticky");

  // Scrolled past where the header would sit, it is still at the panel's top.
  const naturalTop = await details.evaluate((panel) => (panel.querySelector(".detail-section.is-open > .sec-h") as HTMLElement).offsetTop);
  const scrolled = await details.evaluate((panel) => {
    panel.scrollTop = panel.scrollHeight;
    return panel.scrollTop;
  });
  expect(scrolled).toBeGreaterThan(naturalTop); // a plain header would now be above the fold
  await expect
    .poll(async () => Math.abs((await head.boundingBox())!.y - (await details.boundingBox())!.y))
    .toBeLessThan(2);

  // The pinned header still collapses its card.
  await head.click();
  await expect(head).toHaveAttribute("aria-expanded", "false");
  await expect(details.locator("#detail-sec-sust")).toBeHidden();
  await expect(details.locator(".detail-section.is-open")).toHaveCount(0);
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

test("the expanded sedimentation cards are axe-clean", async ({ page }) => {
  await openApp(page);
  await selectSite(page, "Tuttle Creek");
  const scan = async () => {
    const results = await new AxeBuilder({ page })
      .exclude(".leaflet-tile-pane")
      .exclude(".leaflet-pane svg")
      .exclude(".leaflet-pane canvas")
      .exclude(".leaflet-tooltip-pane")
      .analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${v.id}: ${v.nodes.length} nodes`)).toEqual([]);
  };
  // One card at a time, so each card gets its own scan.
  await openDetailSection(page, "Reservoir Sustainability");
  await expect(page.locator(".traj-chart svg")).toBeVisible();
  await page.locator(".chart-data summary").click();
  await scan();
  await openDetailSection(page, "Evidence");
  await page.locator("#detail-sec-evid .survey-details summary").click();
  await scan();
  await openDetailSection(page, "National Inventory of Dams");
  await scan();
});
