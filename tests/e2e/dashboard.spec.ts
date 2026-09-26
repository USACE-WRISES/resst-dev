// The Dashboard (src/dashboard/): four headline tiles are the tabs of one
// topic panel; the tiles and the site chart read the real generated data; the
// national topics read the sediment fixture (Tuttle Creek Dam 17% documented ·
// Upstream Dam 50% · Lone Reservoir 10%, all Kansas); slices, quadrants and
// states drill into their members, each tab keeps its own drill, and every
// way out (to the map, to Screening, to the Library) lands where it says.
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { stubEsri } from "./helpers/esriStub";
import { stubSediment } from "./helpers/sedimentFixtures";
import { showPanels } from "./helpers/panels";

async function openDashboard(page: Page): Promise<void> {
  await stubEsri(page); // the default basemap boots from Esri endpoints — keep CI hermetic
  await stubSediment(page);
  await page.goto("./#dashboard");
  await page.getByRole("button", { name: "OK", exact: true }).click();
  await expect(page.locator(".dash-page")).toBeVisible();
  // The national figures fill once the (fixture) inventory lands.
  await expect(page.locator("#dash-tab-capacity .dash-topic-value")).toHaveText(/%$/);
}

/** The one visible topic panel (hidden panels are not in the accessibility tree). */
const panel = (page: Page) => page.getByRole("tabpanel");
const tab = (page: Page, name: RegExp) => page.getByRole("tablist", { name: "Dashboard topics" }).getByRole("tab", { name });
const view = (page: Page, name: string) => page.locator(".view-switch").getByRole("button", { name, exact: true });
const serious = async (page: Page) => {
  // Mid fade-in a hint's text is lighter than at rest (axe reads ~3:1 then):
  // scan once every hint has settled.
  await page.waitForFunction(() => [...document.querySelectorAll(".dash-hint")].every((el) => el.getAnimations().length === 0));
  const results = await new AxeBuilder({ page })
    .exclude(".leaflet-tile-pane")
    .exclude(".leaflet-pane svg")
    .exclude(".leaflet-pane canvas")
    .exclude(".leaflet-tooltip-pane")
    .analyze();
  return results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.length} nodes`);
};

test("the headline tiles are the tabs, and the site keyword chart reads the data", async ({ page }) => {
  await openDashboard(page);
  await expect(page.getByRole("tablist", { name: "Dashboard topics" }).getByRole("tab")).toHaveCount(4);
  await expect(page.locator(".dash-topic-value")).toHaveText(["978", "465", "1", /%$/]);
  await expect(page.locator("#dash-tab-sites")).toContainText("154 record a sediment release method");
  await expect(page.locator("#dash-tab-literature")).toContainText("251 site-linked · 214 general");
  await expect(page.locator("#dash-tab-capacity")).toContainText("3 modeled reservoirs");
  await expect(tab(page, /^Sediment management 978 documented sites/)).toHaveAttribute("aria-selected", "true");
  await expect(panel(page)).toHaveCount(1);

  const legend = panel(page).locator(".dash-legend");
  await expect(legend.getByRole("button", { name: /^Diversion 77 sites/ })).toBeVisible();
  await expect(legend.getByRole("button", { name: /^Dam Removal 8 sites/ })).toBeVisible();
  await expect(panel(page)).toContainText("154 of 978 sites record a sediment release method");
  // The view switch sits centred above the chart, where the eye starts.
  const sw = (await page.getByRole("group", { name: "Site keyword" }).boundingBox())!;
  const donut = (await panel(page).locator(".dash-donut").boundingBox())!;
  const box = (await panel(page).boundingBox())!;
  expect(sw.y + sw.height).toBeLessThan(donut.y);
  expect(Math.abs(sw.x + sw.width / 2 - (box.x + box.width / 2))).toBeLessThan(4);

  await page.getByRole("group", { name: "Site keyword" }).getByRole("button", { name: "Site type" }).click();
  await expect(panel(page)).toContainText("sites record a site type");
  await expect(legend.getByRole("button", { name: /^Hydropower/ })).toBeVisible();
});

test("Data Filters on the map do not change the Dashboard; a notice says so", async ({ page }) => {
  await stubEsri(page);
  await stubSediment(page);
  await page.goto("./");
  await page.getByRole("button", { name: "OK", exact: true }).click();
  await showPanels(page, { filters: true });
  await page.getByRole("switch", { name: "Apply Sediment Release filter" }).check();
  await view(page, "Dashboard").click();
  await expect(page.locator(".dash-notice")).toContainText("Data Filters are active on the Map view");
  await expect(page.locator(".dash-topic-value").first()).toHaveText("978");
});

test("a slice drills into its sites and a site leads to the map", async ({ page }) => {
  await openDashboard(page);
  const legend = panel(page).locator(".dash-legend");
  await legend.getByRole("button", { name: /^Dam Removal 8 sites/ }).click();
  await expect(legend.getByRole("button", { name: /^Dam Removal 8 sites/ })).toHaveAttribute("aria-pressed", "true");
  const transform = await page.locator(".dash-slice.is-selected").first().evaluate((el) => (el as SVGElement).style.transform);
  expect(transform).not.toBe("translate(0px, 0px)"); // the slice has slid out

  const drill = page.getByRole("region", { name: "Dam Removal: details" });
  await expect(drill).toContainText("8 sites");
  await expect(drill.getByLabel("Break down by")).toHaveValue("ecological_concern");
  await expect(drill.getByRole("table", { name: "Dam Removal sites" }).locator("tbody tr")).toHaveCount(8);
  await expect(drill).toContainText(/\d of 8 sites are linked to a modeled reservoir|None of these sites/);
  await drill.getByLabel("Break down by").selectOption("analysis");
  await expect(drill.getByRole("list", { name: "Dam Removal sites by analysis" })).toBeVisible();

  const row = drill.getByRole("table", { name: "Dam Removal sites" }).locator("tbody tr").first();
  const name = (await row.locator("td").first().textContent())!.trim();
  await row.getByRole("button", { name: `Show ${name} on map` }).click();
  await expect(page.locator(".dash-page")).toBeHidden(); // parked, not unmounted
  await expect(view(page, "Map")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".details-panel")).toContainText(name);

  // Back on the Dashboard the drill is where it was.
  await view(page, "Dashboard").click();
  await expect(page.getByRole("region", { name: "Dam Removal: details" })).toBeVisible();
  await page.getByRole("button", { name: "Close details" }).click();
  await expect(page.getByRole("region", { name: "Dam Removal: details" })).toHaveCount(0);
});

test("the screening quadrants match the Screening panel and open it", async ({ page }) => {
  await openDashboard(page);
  await tab(page, /^Management and loss/).click();
  const tiles = page.getByRole("group", { name: "Screening questions" });
  await expect(tiles.getByRole("button", { name: "Potential case studies 0" })).toBeVisible();
  await expect(tiles.getByRole("button", { name: "Potential opportunities 1" })).toBeVisible();
  await expect(tiles.getByRole("button", { name: "Possibly proactive 1" })).toBeVisible();
  await expect(tiles.getByRole("button", { name: "Lower current priority 1" })).toBeVisible();
  await expect(panel(page)).toContainText("All 3 modeled reservoirs");

  await tiles.getByRole("button", { name: "Potential opportunities 1" }).click();
  const drill = page.getByRole("region", { name: "Potential opportunities: details" });
  await expect(drill).toContainText("1 of 3 modeled reservoirs");
  await expect(drill.getByRole("table").locator("tbody tr")).toHaveCount(1);
  await expect(drill).toContainText("Upstream Dam");

  await drill.getByRole("button", { name: "Open in Screening" }).click();
  await expect(page.locator(".screening-panel")).toBeVisible();
  await expect(page.locator(".screening-panel").getByRole("button", { name: /^Potential opportunities/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".screen-count")).toContainText("1 of 3 modeled reservoirs match");
  await expect.poll(() => page.evaluate(() => (window as any).__resstMapInfo.nationalVisible())).toBe(true);
});

test("loss classes and the state grid follow the inventory; a state goes to Screening", async ({ page }) => {
  await openDashboard(page);
  await tab(page, /^Capacity lost/).click();
  const loss = panel(page);
  const classes = loss.getByRole("list", { name: "Loss classes" });
  await expect(classes.getByRole("button", { name: /^10–25% 2 reservoirs/ })).toBeVisible();
  await expect(classes.getByRole("button", { name: /^50–75% 1 reservoirs/ })).toBeVisible();
  await expect(loss).toContainText("median lost");

  await classes.getByRole("button", { name: /^50–75% 1 reservoirs/ }).click();
  await expect(page.getByRole("region", { name: "50–75% of capacity lost: details" })).toContainText("Upstream Dam");

  const kansas = loss.getByRole("button", { name: /^Kansas: 33% of 3 modeled reservoirs/ });
  await kansas.click();
  const drill = page.getByRole("region", { name: "Kansas: details" });
  await expect(drill).toContainText("1 of 3 modeled reservoirs have lost 25% or more");
  await expect(drill.getByRole("table", { name: "Documented sites in Kansas" })).toContainText("Tuttle Creek");
  await expect(drill.getByRole("table", { name: "Largest reservoirs in Kansas" }).locator("tbody tr")).toHaveCount(3);
  // A reservoir row leads to the map: a documented dam opens its site.
  await drill.getByRole("button", { name: "Show Tuttle Creek Dam on map" }).click();
  await expect(page.locator(".details-panel .site-name")).toHaveText("Tuttle Creek");
  await view(page, "Dashboard").click(); // back on the same tab, with Kansas still open
  await expect(tab(page, /^Capacity lost/)).toHaveAttribute("aria-selected", "true");

  await page.getByRole("region", { name: "Kansas: details" }).getByRole("button", { name: "Screen this state on the map" }).click();
  await expect(page.locator(".screen-count")).toContainText("1 of 3 modeled reservoirs match");
  await expect(page.locator(".screening-panel").getByLabel("State")).toHaveValue("0");
});

test("the literature chart drills into publications and opens the Library on the keyword", async ({ page }) => {
  await openDashboard(page);
  await tab(page, /^Literature/).click();
  const lit = panel(page);
  await expect(lit.getByLabel("Keyword", { exact: true })).toHaveValue("purpose");
  await expect(lit.getByRole("group", { name: "Publications" }).getByRole("button", { name: /^All/ })).toHaveText("All 465");
  await lit.getByRole("group", { name: "Publications" }).getByRole("button", { name: /^General/ }).click();
  await expect(lit).toContainText("general publications record a purpose");
  await lit.locator(".dash-legend").getByRole("button", { name: /^Analysis \d/ }).click();
  const drill = page.getByRole("region", { name: "Analysis: details" });
  await expect(drill.getByRole("list", { name: "Analysis publications" }).getByRole("listitem").first()).toBeVisible();
  await drill.getByRole("button", { name: "Open in Library" }).click();
  await expect(page.locator(".lib-page")).toBeVisible();
  await expect(page.locator(".lib-chips")).toContainText("Purpose: Analysis");
  await expect(page.getByRole("group", { name: "Publications" }).getByRole("button", { name: /^General/ })).toHaveAttribute("aria-pressed", "true");
  // The filter group holding the keyword opens with its tick in view.
  await expect(page.locator(".lib-rail").getByRole("button", { name: /^Focus/ })).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("checkbox", { name: /^Analysis \d/ }).first()).toBeChecked();
});

test("the hints point at the tiles and each chart, leave once used, and return on the next load", async ({ page }) => {
  await openDashboard(page);
  const topicsHint = page.locator(".dash-head .dash-hint");
  const sitesHint = page.locator("#dash-panel-sites .dash-hint");
  await expect(topicsHint).toHaveText("Click a tile to switch topics");
  await expect(sitesHint).toHaveText("Click a slice or a keyword to see its sites");
  // Above the first tile, from its left edge; the data stamp keeps the row's right end.
  const hint = (await topicsHint.boundingBox())!;
  const first = (await page.locator("#dash-tab-sites").boundingBox())!;
  expect(Math.abs(hint.x - first.x)).toBeLessThan(2);
  expect(hint.y + hint.height).toBeLessThanOrEqual(first.y);
  expect(await serious(page)).toEqual([]);

  // A keyword (a slice's twin in the legend) retires this chart's hint, and
  // the chart does not move under the click.
  const donutY = async () => (await page.locator("#dash-panel-sites .dash-donut").boundingBox())!.y;
  const before = await donutY();
  await panel(page).locator(".dash-legend").getByRole("button", { name: /^Dam Removal 8 sites/ }).click();
  await expect(sitesHint).toBeHidden();
  expect(await donutY()).toBe(before);
  await expect(topicsHint).toBeVisible();

  // A tile retires the tiles' hint. Each topic keeps its own chart hint until
  // its own chart is used.
  await tab(page, /^Literature/).click();
  await expect(topicsHint).toBeHidden();
  const litHint = page.locator("#dash-panel-literature .dash-hint");
  await expect(litHint).toBeVisible();
  await expect(litHint).toHaveText("Click a slice or a keyword to see its publications");
  await panel(page).locator(".dash-legend").getByRole("button", { name: /^Analysis \d/ }).click();
  await expect(litHint).toBeHidden();
  await tab(page, /^Sediment management/).click();
  await expect(sitesHint).toBeHidden(); // still used

  // Nothing is remembered: a reload shows them again.
  await page.reload();
  await page.getByRole("button", { name: "OK", exact: true }).click();
  await expect(page.locator(".dash-page")).toBeVisible();
  await expect(topicsHint).toBeVisible();
  await expect(sitesHint).toBeVisible();
  await expect(sitesHint).toHaveText("Click a slice or a keyword to see its sites");
});

test("the tabs follow the tabs pattern and each topic keeps its own drill-down", async ({ page }) => {
  await openDashboard(page);
  await panel(page).locator(".dash-legend").getByRole("button", { name: /^Dam Removal 8 sites/ }).click();
  await expect(page.getByRole("region", { name: "Dam Removal: details" })).toBeVisible();

  const first = tab(page, /^Sediment management/);
  await first.focus();
  await page.keyboard.press("ArrowRight");
  await expect(tab(page, /^Literature/)).toBeFocused();
  await expect(tab(page, /^Literature/)).toHaveAttribute("aria-selected", "true");
  await expect(first).toHaveAttribute("tabindex", "-1"); // one tab in the tab order
  await expect(panel(page)).toHaveCount(1);
  await expect(panel(page)).toContainText("What the literature covers");
  await expect(page.getByRole("region", { name: "Dam Removal: details" })).toHaveCount(0); // hidden with its tab

  await page.keyboard.press("End");
  await expect(tab(page, /^Capacity lost/)).toHaveAttribute("aria-selected", "true");
  await panel(page).getByRole("button", { name: /^Kansas: / }).click();
  await expect(page.getByRole("region", { name: "Kansas: details" })).toBeVisible();

  await tab(page, /^Capacity lost/).focus();
  await page.keyboard.press("ArrowRight"); // wraps to the first tab
  await expect(first).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("region", { name: "Dam Removal: details" })).toBeVisible(); // kept
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("region", { name: "Kansas: details" })).toBeVisible(); // kept too
});

test("the Dashboard with a drill open is axe-clean at desktop and phone widths", async ({ page }) => {
  await openDashboard(page);
  await panel(page).locator(".dash-legend").getByRole("button", { name: /^Dam Removal 8 sites/ }).click();
  await expect(page.getByRole("region", { name: "Dam Removal: details" })).toBeVisible();
  expect(await serious(page)).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await serious(page)).toEqual([]);
});
