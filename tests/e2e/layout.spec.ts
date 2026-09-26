// Layout-integrity and camera-geometry regression tests. These exist because
// the launch-day bug — the table's intrinsic width inflating the center grid
// column until the map canvas painted over the details panel — was invisible
// to locator-based assertions: every element existed and was clickable while
// the page looked completely wrong. The Map view opens clean on every visit
// (every panel collapsed, owner decision 2026-09-26), so each test opens the
// panels it measures through the real controls.
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { stubEsri, waitForBasemap } from "./helpers/esriStub";
import { jumpTo, screenPt, waitForMapIdle } from "./helpers/mapReady";
import { showPanels } from "./helpers/panels";
import { stubSediment } from "./helpers/sedimentFixtures";

const TUTTLE: [number, number] = [-96.5943465450358, 39.2562232982835];

async function openApp(page: Page): Promise<void> {
  await stubEsri(page); // the default basemap boots from Esri endpoints — keep CI hermetic
  await page.goto("./");
  await page.getByRole("button", { name: "OK" }).click(); // welcome dialog
}

// "Map ready" = the Esri default has fully applied. The swap does not move
// the camera (setStyle preserves it), so the fitted-center assertions below
// still measure the constructor's CONUS fit.
const waitForMapReady = (page: Page) => waitForBasemap(page, true);

// The toolbar's panel toggles, scoped to the toolbar: the left edge tab's
// "Expand Data Filters panel" also contains "Data filters".
const dataBtn = (page: Page) => page.locator(".map-toolbar").getByRole("button", { name: /^Data filters/ });
const tableBtn = (page: Page) => page.locator(".map-toolbar").getByRole("button", { name: "Table", exact: true });
const width = (page: Page, sel: string) =>
  page.evaluate((s) => (document.querySelector(s) as HTMLElement).clientWidth, sel);
const scanSerious = async (page: Page) => {
  const results = await new AxeBuilder({ page })
    .exclude(".leaflet-tile-pane")
    .exclude(".leaflet-pane svg")
    .exclude(".leaflet-pane canvas")
    .exclude(".leaflet-tooltip-pane")
    .analyze();
  return results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.length} nodes`);
};

test("the map opens clean: every panel collapsed, the map full width, an edge tab at each edge", async ({ page }) => {
  await openApp(page);
  await waitForMapReady(page);
  await expect(page.locator(".filters-panel")).toBeHidden();
  await expect(page.locator(".table-panel")).toBeHidden();
  await expect(page.locator(".details-panel")).toBeHidden();
  expect(await width(page, ".map-panel")).toBe(await width(page, ".app-main"));

  // The three tabs wait at the edges: left, right, and the bottom of the map.
  const main = (await page.locator(".app-main").boundingBox())!;
  const left = (await page.getByRole("button", { name: "Expand Data Filters panel" }).boundingBox())!;
  const right = (await page.getByRole("button", { name: "Expand Selected Data panel" }).boundingBox())!;
  const bottom = (await page.getByRole("button", { name: "Expand results table" }).boundingBox())!;
  expect(Math.abs(left.x - main.x)).toBeLessThan(2);
  expect(Math.abs(right.x + right.width - (main.x + main.width))).toBeLessThan(2);
  expect(Math.abs(bottom.y + bottom.height - (main.y + main.height))).toBeLessThan(2);

  // The toolbar's Data and Table buttons say their panels are closed.
  await expect(dataBtn(page)).toHaveAttribute("aria-expanded", "false");
  await expect(tableBtn(page)).toHaveAttribute("aria-expanded", "false");
});

test("with every panel open, the grid holds the map and table and Selected Data sits on top", async ({ page }) => {
  await openApp(page);
  await waitForMapReady(page);
  await showPanels(page, { table: true, filters: true, details: true });

  const geom = await page.evaluate(() => {
    const w = (sel: string) => (document.querySelector(sel) as HTMLElement | null)?.clientWidth ?? -1;
    return {
      centerStack: w(".center-stack"),
      mapContainer: w(".map-panel"),
      canvas: w(".map-panel.leaflet-container"),
      tablePanel: w(".table-panel"),
      docScrollW: document.documentElement.scrollWidth,
      docClientW: document.documentElement.clientWidth,
    };
  });
  expect(geom.centerStack).toBeGreaterThan(0);
  expect(geom.canvas).toBe(geom.mapContainer);
  expect(geom.mapContainer).toBe(geom.centerStack);
  expect(geom.tablePanel).toBe(geom.centerStack);
  expect(geom.docScrollW).toBe(geom.docClientW);

  const details = page.locator(".details-panel");
  await expect(details).toContainText("Selected Sites: 0");
  const box = await details.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x + box!.width).toBeLessThanOrEqual(1440);
  // The discriminating check: in the broken state this point hit the canvas.
  const hit = await page.evaluate(
    () => !!document.elementFromPoint(1440 - 160, 400)?.closest(".details-panel"),
  );
  expect(hit).toBe(true);
});

test("the map opens centred on the lower 48, one zoom level out from a tight fit", async ({ page }) => {
  await openApp(page);
  await waitForMapReady(page);
  const view = await page.evaluate(() => {
    const w = window as any;
    const map = w.__resstMap;
    const el = map.getContainer() as HTMLElement;
    const nw = map.latLngToContainerPoint([46.6079, -116.7544]);
    const se = map.latLngToContainerPoint([30.8881, -79.9282]);
    return {
      centre: w.__resstMapInfo.getCenter(),
      zoom: map.getZoom() as number,
      share: (se.x - nw.x) / el.clientWidth,
      inside: nw.x > 0 && nw.y > 0 && se.x < el.clientWidth && se.y < el.clientHeight,
    };
  });
  // Bounds [-116.7544, 30.8881, -79.9282, 46.6079]: centred on their
  // projected midpoint, as a fit would be.
  expect(Math.abs(view.centre.lng - -98.34)).toBeLessThan(0.1);
  expect(Math.abs(view.centre.lat - 39.2)).toBeLessThan(0.1);
  // At 1440×820 the lower 48 would fill the map at Leaflet zoom 5.74 (20 px to
  // spare); one level out, on the quarter step, is 4.75 (owner request
  // 2026-09-26): the country spans about half the map, its neighbours around it.
  expect(view.zoom).toBe(4.75);
  expect(view.share).toBeGreaterThan(0.45);
  expect(view.share).toBeLessThan(0.55);
  expect(view.inside).toBe(true);
});

test("the toolbar's Data and Table buttons open and close their panels, and Data shows when filters are on", async ({ page }) => {
  await openApp(page);
  await waitForMapReady(page);
  const data = dataBtn(page);
  await data.click();
  await expect(page.locator(".filters-panel")).toBeVisible();
  await expect(data).toHaveAttribute("aria-expanded", "true");
  await expect(data).toHaveClass(/\bactive\b/);
  await data.click();
  await expect(page.locator(".filters-panel")).toBeHidden();
  await expect(data).toHaveAttribute("aria-expanded", "false");

  // The toolbar button and the bottom tab are two handles on one state.
  const table = tableBtn(page);
  await table.click();
  await expect(page.locator(".table-panel")).toBeVisible();
  await expect(table).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("button", { name: "Collapse results table" }).click();
  await expect(page.locator(".table-panel")).toBeHidden();
  await expect(table).toHaveAttribute("aria-expanded", "false");

  // A filter left on behind the closed panel shows as a dot on Data.
  await expect(data.locator(".map-tool-dot")).toHaveCount(0);
  await data.click();
  await page.getByRole("switch", { name: "Apply Sediment Release filter" }).check();
  await data.click();
  await expect(data.locator(".map-tool-dot")).toBeVisible();
  await expect(data).toHaveAccessibleName("Data filters (some filters are on)");
  await page.getByRole("button", { name: "Expand Data Filters panel" }).click();
  await page.getByRole("button", { name: "Clear all" }).click();
  await expect(data.locator(".map-tool-dot")).toHaveCount(0);
  await expect(data).toHaveAccessibleName("Data filters");
});

test("the popup's details and table toggles open and close the panels, relabel, and follow the other controls", async ({
  page,
}) => {
  await openApp(page);
  await waitForMapReady(page);
  await jumpTo(page, TUTTLE[0], TUTTLE[1], 10); // clear of Milford
  await waitForMapIdle(page);
  const site = await screenPt(page, TUTTLE[0], TUTTLE[1]);
  await page.mouse.click(site.x, site.y);
  const popup = page.locator(".leaflet-popup");
  await expect(popup.locator(".popup-title")).toHaveText("Tuttle Creek");
  const details = popup.locator('[data-action="details"]');
  const table = popup.locator('[data-action="table"]');
  await expect(details).toHaveText("Show details");
  await expect(details).toHaveAttribute("aria-expanded", "false");
  await expect(table).toHaveText("Show table");

  await table.click();
  await expect(page.locator(".table-panel")).toBeVisible();
  await expect(table).toHaveText("Hide table");
  await expect(table).toHaveAttribute("aria-expanded", "true");
  await details.click();
  await expect(page.locator(".details-panel")).toBeVisible();
  await expect(page.locator(".details-panel .site-name")).toHaveText("Tuttle Creek");
  await expect(details).toHaveText("Hide details");
  await expect(details).toHaveAttribute("aria-expanded", "true");
  // The camera re-aims, so the popup stays whole inside the smaller map.
  const fits = () =>
    page.evaluate(() => {
      const r = (s: string) => document.querySelector(s)!.getBoundingClientRect();
      const p = r(".leaflet-popup");
      const t = r(".map-toolbar");
      const m = r(".map-panel");
      return p.top >= t.bottom && p.bottom <= m.bottom && p.left >= m.left && p.right <= m.right;
    });
  await expect.poll(fits).toBe(true);

  await details.click();
  await expect(page.locator(".details-panel")).toBeHidden();
  await expect(details).toHaveText("Show details");
  await table.click();
  await expect(page.locator(".table-panel")).toBeHidden();
  await expect(table).toHaveText("Show table");

  // Opened from the edge tab or the toolbar, the popup's labels follow.
  await page.getByRole("button", { name: "Expand Selected Data panel" }).click();
  await expect(details).toHaveText("Hide details");
  await tableBtn(page).click();
  await expect(table).toHaveText("Hide table");
});

test("opening a tall Selected Data card never scrolls the app itself, even on a short laptop screen", async ({ page }) => {
  // With the table collapsed (the Map view's start) its toolbar and footer
  // overflow the bottom of the app; a card's scrollIntoView used to scroll the
  // whole app up by that much, header and all, with no way back. At 1280x600
  // the fixture NID card lands in the band that shifted the app by 50px.
  await page.setViewportSize({ width: 1280, height: 600 });
  await stubSediment(page);
  await openApp(page);
  await waitForMapReady(page);
  await jumpTo(page, TUTTLE[0], TUTTLE[1], 10);
  await waitForMapIdle(page);
  const site = await screenPt(page, TUTTLE[0], TUTTLE[1]);
  await page.mouse.click(site.x, site.y);
  await page.locator('.leaflet-popup [data-action="details"]').click();
  const details = page.locator(".details-panel");
  await expect(details.locator(".site-name")).toHaveText("Tuttle Creek");
  const frames = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const shift = () =>
    page.evaluate(() => ({
      shell: document.querySelector(".app-shell")!.scrollTop,
      header: Math.round(document.querySelector(".app-header")!.getBoundingClientRect().top),
    }));
  for (const title of ["National Inventory of Dams", "Reservoir Sustainability", "Comparable Reservoirs"]) {
    const head = details.locator(".detail-sec-head", { hasText: title });
    await head.click();
    await expect(head).toHaveAttribute("aria-expanded", "true");
    await frames(); // the card scrolls itself into view after it opens
    expect(await shift(), title).toEqual({ shell: 0, header: 0 });
  }
  // Nothing can scroll the shell or the collapsed stack: not even a request to
  // show the hidden table's footer.
  await page.evaluate(() => document.querySelector(".table-footer")!.scrollIntoView());
  expect(await shift()).toEqual({ shell: 0, header: 0 });
  expect(await page.evaluate(() => document.querySelector(".center-stack")!.scrollTop)).toBe(0);
});

test("the side panels open from their edge tabs and collapse fully back", async ({ page }) => {
  await openApp(page);
  await waitForMapReady(page);
  const mapWidth = () => width(page, ".map-panel");
  const cols = () => page.evaluate(() => getComputedStyle(document.querySelector(".app-main")!).gridTemplateColumns);
  expect(await cols()).toMatch(/^0px .+px 0px$/); // collapsed completely — no rails
  const clean = await mapWidth();

  await page.getByRole("button", { name: "Expand Data Filters panel" }).click();
  await page.getByRole("button", { name: "Expand Selected Data panel" }).click();
  await expect.poll(mapWidth).toBe(clean - 270 - 720); // the filters column and half of the 1440 window

  await page.getByRole("button", { name: "Collapse Data Filters panel" }).click();
  await page.getByRole("button", { name: "Collapse Selected Data panel" }).click();
  await expect.poll(cols).toMatch(/^0px .+px 0px$/);
  await expect.poll(mapWidth).toBe(clean);
});

test("no serious/critical violations with a panel collapsed", async ({ page }) => {
  await openApp(page);
  await showPanels(page, { table: true, filters: true, details: true });
  await page.getByRole("button", { name: "Collapse Selected Data panel" }).click();
  expect(await scanSerious(page)).toEqual([]);
});

const mapHeight = (page: Page) =>
  page.evaluate(() => (document.querySelector(".map-panel") as HTMLElement).clientHeight);

test("the table divider drags to resize; the size persists and the open state does not", async ({ page }) => {
  await openApp(page);
  await waitForMapReady(page);
  await showPanels(page, { table: true });
  const before = await mapHeight(page);
  const grip = page.getByRole("separator", { name: "Resize results table" });
  const box = (await grip.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y - 150, { steps: 6 });
  await page.mouse.up();
  await expect.poll(() => mapHeight(page)).toBeLessThan(before - 120);
  expect(await page.evaluate(() => localStorage.getItem("resst.tableHeight"))).toMatch(/^0\.\d+$/);
  // A reload starts clean again; reopened, the table has its dragged size.
  await page.reload();
  await page.getByRole("button", { name: "OK" }).click(); // welcome dialog returns
  await waitForMapReady(page);
  await expect(page.locator(".table-panel")).toBeHidden();
  await showPanels(page, { table: true });
  await expect.poll(() => mapHeight(page)).toBeLessThan(before - 120);
});

test("Selected Data opens at half the window, drags past the old maximum, persists, and keyboard hits the clamps", async ({
  page,
}) => {
  await openApp(page);
  await waitForMapReady(page);
  await showPanels(page, { details: true });
  const panelWidth = () =>
    page.evaluate(() => (document.querySelector(".details-panel") as HTMLElement).offsetWidth);
  expect(await panelWidth()).toBe(720); // the stylesheet default, min(800px, 50vw), at 1440

  const grip = page.getByRole("separator", { name: "Resize selected data panel" });
  await expect(grip).toHaveAttribute("aria-valuenow", "720"); // the keyboard seed mirrors the stylesheet token
  await expect(grip).toHaveAttribute("aria-valuemax", "1008"); // 70% of the window, under the 1200 cap
  const box = (await grip.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 200, y, { steps: 6 });
  await page.mouse.up();
  await expect.poll(panelWidth).toBeGreaterThan(900); // well past the old 620 maximum
  expect(await page.evaluate(() => localStorage.getItem("resst.detailsWidth"))).toMatch(/^\d+$/);

  // The dragged width survives a reload (the panel itself starts collapsed again).
  await page.reload();
  await page.getByRole("button", { name: "OK" }).click();
  await waitForMapReady(page);
  await expect(page.locator(".details-panel")).toBeHidden();
  await showPanels(page, { details: true });
  await expect.poll(panelWidth).toBeGreaterThan(900);

  // Keyboard: Home/End hit the clamps; double-click restores the default.
  const grip2 = page.getByRole("separator", { name: "Resize selected data panel" });
  await grip2.focus();
  await page.keyboard.press("Home");
  await expect(grip2).toHaveAttribute("aria-valuenow", "280");
  await page.keyboard.press("End");
  await expect(grip2).toHaveAttribute("aria-valuenow", "1008");
  await expect.poll(panelWidth).toBe(1008);
  await grip2.dblclick();
  await expect.poll(panelWidth).toBe(720);
  expect(await page.evaluate(() => localStorage.getItem("resst.detailsWidth"))).toBeNull();

  // The default follows the window: 800px on a wide screen, half of a narrower one.
  await page.setViewportSize({ width: 1920, height: 1080 });
  await expect.poll(panelWidth).toBe(800);
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect.poll(panelWidth).toBe(640);
});

test("the results table collapses to its tab and expands back to the same height", async ({ page }) => {
  await openApp(page);
  await waitForMapReady(page);
  const clean = await mapHeight(page);
  await showPanels(page, { table: true });
  const open = await mapHeight(page);
  expect(open).toBeLessThan(clean - 200);
  await page.getByRole("button", { name: "Collapse results table" }).click();
  await expect
    .poll(() =>
      page.evaluate(() => getComputedStyle(document.querySelector(".center-stack")!).gridTemplateRows),
    )
    .toMatch(/ 0px 0px$/); // resizer row + collapsed table row
  await expect.poll(() => mapHeight(page)).toBe(clean);
  await expect(page.locator(".table-panel")).toBeHidden(); // visibility: hidden, still in the DOM
  await page.getByRole("button", { name: "Expand results table" }).click();
  await expect.poll(() => mapHeight(page)).toBe(open); // exact restore
  await expect(page.locator(".data-table tbody tr").first()).toBeVisible();
});

test("the table divider is keyboard operable and collapse hands focus to the pill", async ({ page }) => {
  await openApp(page);
  await waitForMapReady(page);
  await showPanels(page, { table: true });
  const grip = page.getByRole("separator", { name: "Resize results table" });
  await grip.focus();
  for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowUp");
  await expect(grip).toHaveAttribute("aria-valuenow", "56"); // 46 + 5×2
  await page.keyboard.press("Home");
  await expect(grip).toHaveAttribute("aria-valuenow", "15");
  await page.keyboard.press("End");
  await expect(grip).toHaveAttribute("aria-valuenow", "85");
  await page.keyboard.press("Enter");
  const pill = page.getByRole("button", { name: "Expand results table" });
  await expect(pill).toBeFocused(); // the grip unmounted — focus was handed over
  await pill.click();
  // The keyed height is remembered across collapse/expand.
  await expect(page.getByRole("separator", { name: "Resize results table" })).toHaveAttribute(
    "aria-valuenow",
    "85",
  );
});

test("a legacy collapse key is cleared, and the clean start is axe-clean", async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("resst.tableCollapsed", "1"); // written by builds that remembered the collapse
    } catch {
      /* ignore */
    }
  });
  await openApp(page);
  await waitForMapReady(page);
  expect(await page.evaluate(() => localStorage.getItem("resst.tableCollapsed"))).toBeNull();
  await expect(page.getByRole("button", { name: "Expand results table" })).toBeVisible();
  await expect(page.locator(".table-panel")).toBeHidden();
  expect(await scanSerious(page)).toEqual([]);
});

test("a persisted oversized height clamps to the max", async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("resst.tableHeight", "9");
    } catch {
      /* ignore */
    }
  });
  await openApp(page);
  await waitForMapReady(page);
  await showPanels(page, { table: true });
  await expect(page.getByRole("separator", { name: "Resize results table" })).toHaveAttribute(
    "aria-valuenow",
    "85",
  );
  const rows = await page.evaluate(
    () => getComputedStyle(document.querySelector(".center-stack")!).gridTemplateRows,
  );
  const [mapPx, , tablePx] = rows.split(" ").map((v) => parseFloat(v));
  expect(tablePx / (mapPx + tablePx)).toBeCloseTo(0.85, 1);
});

test("divider drags never select page text", async ({ page }) => {
  await openApp(page);
  await waitForMapReady(page);
  await showPanels(page);
  const selected = () => page.evaluate(() => document.getSelection()?.toString() ?? "");
  const clearSelection = () => page.evaluate(() => document.getSelection()?.removeAllRanges());
  const resizing = () => page.evaluate(() => document.documentElement.getAttribute("data-resizing"));
  // A press-move-release; returns the <html> drag-session mark mid-drag and after release.
  const drag = async (x: number, y: number, dx: number, dy: number) => {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 3 });
    const mid = await resizing();
    await page.mouse.move(x + dx, y + dy, { steps: 3 });
    await page.mouse.up();
    return { mid, after: await resizing() };
  };

  // Control: a plain drag across the table footer's text must select it, or
  // the empty-selection assertions below would prove nothing.
  const footer = (await page.locator(".table-footer").boundingBox())!;
  await drag(footer.x + 4, footer.y + footer.height / 2, 120, 0);
  expect(await selected()).toContain("Total");
  await clearSelection();

  const rowY = await page
    .locator(".data-table tbody tr")
    .nth(2)
    .boundingBox()
    .then((b) => b!.y + b!.height / 2);
  const details = page.getByRole("separator", { name: "Resize selected data panel" });
  const gripCentreX = async () => {
    const b = (await details.boundingBox())!;
    return b.x + b.width / 2;
  };
  const panelWidth = () =>
    page.evaluate(() => (document.querySelector(".details-panel") as HTMLElement).offsetWidth);
  const before = await panelWidth();

  // The details divider dragged wider (left) across the table's cells…
  let marks = await drag(await gripCentreX(), rowY, -150, 0);
  expect(await selected()).toBe("");
  expect(marks).toEqual({ mid: "col", after: null }); // marked on <html> during the drag only
  await expect.poll(panelWidth).toBeGreaterThan(before + 120); // the resize itself still happened

  // …and narrower (right) across the panel's own heading.
  const heading = (await page.locator(".details-panel h2").first().boundingBox())!;
  marks = await drag(await gripCentreX(), heading.y + heading.height / 2, 100, 0);
  expect(await selected()).toBe("");
  expect(marks).toEqual({ mid: "col", after: null });

  // The table divider dragged down across the toolbar, header and rows
  // (x off-centre, clear of the collapse pill that straddles the grip).
  const table = page.getByRole("separator", { name: "Resize results table" });
  const tb = (await table.boundingBox())!;
  marks = await drag(tb.x + tb.width * 0.3, tb.y + tb.height / 2, 0, 100);
  expect(await selected()).toBe("");
  expect(marks).toEqual({ mid: "row", after: null });

  // Under remote browser isolation the page's script runs in a cloud browser
  // and only the DOM and styles are mirrored to the screen, so the local
  // browser handles the press with no pointer capture and no drag-session
  // mark. Model that: capture off, the <html> belt neutralised — the grips
  // must be non-selectable on their own.
  await page.addStyleTag({ content: "html[data-resizing] { -webkit-user-select: auto !important; user-select: auto !important; }" });
  await page.evaluate(() => {
    Element.prototype.setPointerCapture = () => {};
  });
  await drag(await gripCentreX(), rowY, -150, 0);
  expect(await selected()).toBe("");
});

test("tablet: Data opens the filters as a drawer over the map, and Escape closes it", async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 800 });
  await openApp(page);
  await waitForMapReady(page);
  const filters = page.locator(".filters-panel");
  await expect(filters).toBeHidden(); // a closed drawer leaves the tab order too
  const mapBefore = await width(page, ".map-panel");
  expect(mapBefore).toBe(await width(page, ".app-main")); // no filters column at tablet widths

  await dataBtn(page).click();
  await expect(filters).toBeVisible();
  await expect(page.locator(".drawer-scrim")).toBeVisible();
  await expect(dataBtn(page)).toHaveAttribute("aria-expanded", "true");
  await expect.poll(async () => (await filters.boundingBox())!.x).toBe(0); // slid in from the left edge
  expect((await filters.boundingBox())!.width).toBeLessThanOrEqual(320);
  expect(await width(page, ".map-panel")).toBe(mapBefore); // a drawer overlays the map, never resizes it

  await page.keyboard.press("Escape");
  await expect(page.locator(".drawer-scrim")).toHaveCount(0);
  await expect(filters).toBeHidden();
  await expect(dataBtn(page)).toHaveAttribute("aria-expanded", "false");
});
