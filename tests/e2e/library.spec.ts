// The Library (src/library/): the filters open one group at a time; scopes,
// search and filters narrow the 465 publications with honest counts; the
// table sorts by column and walks with the arrow keys; a publication reads in
// the pane with its sites and keywords; a site leads to the map.
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { stubEsri } from "./helpers/esriStub";
import { stubSediment } from "./helpers/sedimentFixtures";
import { landed } from "./helpers/mapReady";

const TUTTLE: [number, number] = [-96.5943465450358, 39.2562232982835];

async function openLibrary(page: Page): Promise<void> {
  await stubEsri(page); // the default basemap boots from Esri endpoints — keep CI hermetic
  await stubSediment(page);
  await page.goto("./#library");
  // exact: the Library's rows can render under the welcome dialog, and three
  // titles contain "ok" ("evoke", "Handbook", "Schoklitsch").
  await page.getByRole("button", { name: "OK", exact: true }).click();
  await expect(page.locator(".lib-page")).toBeVisible();
}

const search = (page: Page) => page.getByRole("searchbox", { name: "Search publications" });
const scope = (page: Page, name: RegExp) => page.getByRole("group", { name: "Publications" }).getByRole("button", { name });
const count = (page: Page) => page.locator(".lib-count");
const countValue = async (page: Page) => Number((await count(page).locator("b").textContent())!.replace(/,/g, ""));
const group = (page: Page, name: RegExp | string) => page.locator(".lib-rail").getByRole("button", { name });
const rowButtons = (page: Page) => page.locator(".lib-row .lib-row-btn");
const detail = (page: Page) => page.getByRole("complementary", { name: "Publication details" });
const header = (page: Page, name: string) => page.locator(".lib-table thead th", { has: page.getByRole("button", { name, exact: true }) });

async function expectAxeClean(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .exclude(".leaflet-tile-pane")
    .exclude(".leaflet-pane svg")
    .exclude(".leaflet-pane canvas")
    .exclude(".leaflet-tooltip-pane")
    .analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes.length} nodes`)).toEqual([]);
}

test("scopes, search and filters narrow the list with honest counts; one filter group opens at a time", async ({ page }) => {
  await openLibrary(page);
  await expect(count(page)).toContainText("465 publications");
  await scope(page, /^Site literature/).click();
  await expect(count(page)).toContainText("251");
  await scope(page, /^General/).click();
  await expect(count(page)).toContainText("214");
  await scope(page, /^All/).click();

  await search(page).fill("Tuttle Creek");
  const n = await countValue(page);
  expect(n).toBeGreaterThanOrEqual(6);
  await expect(scope(page, /^All/)).toHaveText(`All ${n}`); // the scope counts follow the search
  await expect(page.locator(".lib-chips")).toContainText("“Tuttle Creek”");
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(count(page)).toContainText("465");

  // Document type starts open; a facet narrows the list; its siblings keep their counts.
  await expect(group(page, /^Document type/)).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("checkbox", { name: /^Journal Article/ }).check();
  await expect(count(page)).toContainText("168");
  await expect(page.getByRole("checkbox", { name: /^Book 33/ })).toBeVisible();
  await expect(page.locator(".lib-chips")).toContainText("Document type: Journal Article");

  // Opening Focus closes Document type, whose header keeps its tick count.
  await group(page, /^Focus/).click();
  await expect(group(page, /^Focus/)).toHaveAttribute("aria-expanded", "true");
  await expect(group(page, "Document type 1 selected")).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("checkbox", { name: /^Journal Article/ })).toBeHidden();
  // A second facet narrows further (AND across facets).
  await page.getByRole("checkbox", { name: /^Analysis \d/ }).first().check();
  expect(await countValue(page)).toBeLessThan(168);
  await expect(group(page, "Focus 1 selected")).toBeVisible();
  // Closing the open group leaves every group closed.
  await group(page, /^Focus/).click();
  await expect(page.locator('.lib-acc-head[aria-expanded="true"]')).toHaveCount(0);

  await page.getByRole("button", { name: "Remove Document type: Journal Article" }).click();
  await expect(page.locator(".lib-chips")).not.toContainText("Journal Article");
  await page.getByRole("button", { name: "Clear all" }).click();
  await expect(count(page)).toContainText("465");
  await expect(page.locator(".lib-chips")).toHaveCount(0);
});

test("the pane reads the first result until a row is chosen; a keyword filters; a site leads to the map", async ({ page }) => {
  await openLibrary(page);
  const first = rowButtons(page).first();
  await expect(first).toHaveAttribute("aria-current", "true");
  await expect(detail(page).locator(".lib-detail-title")).toHaveText((await first.textContent())!);

  await search(page).fill("Tuttle Creek");
  const row = page.locator(".lib-row", { has: page.locator(".lib-cell-site", { hasText: "Tuttle Creek" }) }).first();
  const title = (await row.locator(".lib-row-btn").textContent())!;
  await row.click();
  await expect(row.locator(".lib-row-btn")).toHaveAttribute("aria-current", "true");
  await expect(page.locator('.lib-row-btn[aria-current="true"]')).toHaveCount(1);
  await expect(detail(page).locator(".lib-detail-title")).toHaveText(title);

  // A keyword in the pane filters the list by it.
  const kw = detail(page).locator(".lib-kw").first();
  const label = (await kw.textContent())!.trim();
  await kw.click();
  await expect(kw).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".lib-chips")).toContainText(label);

  await detail(page).getByRole("button", { name: "Show Tuttle Creek on map" }).click();
  await expect(page.locator(".lib-page")).toBeHidden(); // parked while the Map shows
  await expect(page.locator(".details-panel .site-name")).toHaveText("Tuttle Creek");
  await landed(page, TUTTLE[0], TUTTLE[1]);

  // Back in the Library the search and the chosen publication are kept.
  await page.locator(".view-switch").getByRole("button", { name: "Library", exact: true }).click();
  await expect(search(page)).toHaveValue("Tuttle Creek");
  await expect(detail(page).locator(".lib-detail-title")).toHaveText(title);
});

test("columns sort and reverse; the arrow keys walk the rows and open each", async ({ page }) => {
  await openLibrary(page);
  await expect(header(page, "Year")).toHaveAttribute("aria-sort", "descending");
  const titles = async () => (await rowButtons(page).allTextContents()).slice(0, 6);

  await page.getByRole("button", { name: "Title", exact: true }).click();
  await expect(header(page, "Title")).toHaveAttribute("aria-sort", "ascending");
  expect(await header(page, "Year").getAttribute("aria-sort")).toBeNull();
  const asc = await titles();
  expect([...asc].sort((a, b) => a.localeCompare(b))).toEqual(asc);
  await page.getByRole("button", { name: "Title", exact: true }).click();
  await expect(header(page, "Title")).toHaveAttribute("aria-sort", "descending");
  const desc = await titles();
  expect([...desc].sort((a, b) => b.localeCompare(a))).toEqual(desc);

  // The Site column sorts by site name, general literature last.
  await page.getByRole("button", { name: "Site", exact: true }).click();
  await expect(header(page, "Site")).toHaveAttribute("aria-sort", "ascending");
  await expect(page.locator(".lib-row").first().locator(".lib-general")).toHaveCount(0);
  await expect(page.locator(".lib-row").last().locator(".lib-general")).toHaveCount(1);

  // Up and down (Home, End) move to a row and open it (End: once every row is built).
  await expect(page.locator(".lib-row")).toHaveCount(465);
  await rowButtons(page).nth(0).click();
  await page.keyboard.press("ArrowDown");
  await expect(rowButtons(page).nth(1)).toBeFocused();
  await expect(rowButtons(page).nth(1)).toHaveAttribute("aria-current", "true");
  await expect(detail(page).locator(".lib-detail-title")).toHaveText((await rowButtons(page).nth(1).textContent())!);
  await page.keyboard.press("ArrowUp");
  await expect(rowButtons(page).nth(0)).toHaveAttribute("aria-current", "true");
  await page.keyboard.press("End");
  await expect(rowButtons(page).last()).toBeFocused();
  await expect(rowButtons(page).last()).toHaveAttribute("aria-current", "true");
});

test("unticking a filter brings every row back, from the top of the table", async ({ page }) => {
  await openLibrary(page);
  const rows = page.locator(".lib-row");
  await expect(rows).toHaveCount(465);
  await page.getByRole("checkbox", { name: /^Journal Article/ }).check();
  await expect(rows).toHaveCount(168);
  await page.locator(".lib-table-wrap").evaluate((el) => {
    el.scrollTop = 800;
  });
  await page.getByRole("checkbox", { name: /^Journal Article/ }).uncheck();
  await expect(count(page)).toContainText("465");
  await expect(rows).toHaveCount(465); // the rows past the first screen arrive in background steps
  expect(await page.locator(".lib-table-wrap").evaluate((el) => el.scrollTop)).toBe(0);
});

test("an empty result offers a way back", async ({ page }) => {
  await openLibrary(page);
  await search(page).fill("zzzz qqqq");
  await expect(count(page)).toContainText("0 publications");
  await expect(page.locator(".lib-main .empty-note")).toContainText("No publications match");
  await page.locator(".lib-main").getByRole("button", { name: "Clear the filters" }).click();
  await expect(count(page)).toContainText("465");
});

test("phone: the filters fold, a chosen publication sits above the list, and Back returns to its row", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openLibrary(page);
  await expect(search(page)).toBeVisible();
  const toggle = page.getByRole("button", { name: "Filters", exact: true });
  await expect(toggle).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /^Journal Article/ })).toBeHidden();
  await toggle.click();
  await expect(page.getByRole("checkbox", { name: /^Journal Article/ })).toBeVisible();
  await toggle.click();

  // Nothing opens by itself on a phone.
  await expect(detail(page)).toBeHidden();
  const btn = rowButtons(page).nth(3);
  await btn.click();
  await expect(detail(page)).toBeVisible();
  expect((await detail(page).boundingBox())!.y).toBeLessThan((await page.locator(".lib-table").boundingBox())!.y);
  await detail(page).getByRole("button", { name: "Back to list" }).click();
  await expect(detail(page)).toBeHidden();
  await expect(btn).toBeFocused();
  // Nothing scrolls sideways.
  const fits = await page.evaluate(() => document.querySelector(".view-page:not(.is-parked)")!.scrollWidth <= window.innerWidth);
  expect(fits).toBe(true);
});

test("the Library is axe-clean at desktop and phone widths", async ({ page }) => {
  await openLibrary(page);
  await page.getByRole("checkbox", { name: /^Journal Article/ }).check();
  await rowButtons(page).nth(1).click();
  await expect(detail(page).locator(".lib-detail-title")).toBeVisible();
  await expectAxeClean(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(detail(page).locator(".lib-detail-title")).toBeVisible();
  await expectAxeClean(page);
});
