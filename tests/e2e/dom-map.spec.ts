// The Leaflet map panel (src/map/dom): the same props and command contract as
// the MapLibre panel, drawn with DOM elements and image tiles. Seeded to the
// Leaflet engine explicitly; the config's storageState pins every other spec
// to MapLibre (headless Chromium is SwiftShader, which the engine rule would
// otherwise read as "use Leaflet").
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { stubEsri, stubUsgsTiles } from "./helpers/esriStub";
import { stubSediment } from "./helpers/sedimentFixtures";
import { stubNldi } from "./helpers/nldiStub";
import { KANSAS_BASIN_FC, TEST_RIVER_FC } from "./helpers/overlayFixtures";
import { openDetailSection } from "./helpers/sections";
import { domCounts, jumpTo, landed, screenPt, waitForDomMapReady } from "./helpers/domMapReady";

const ORIGIN = "http://localhost:4173";
const seed = (value: "leaflet" | "maplibre") => ({
  cookies: [],
  origins: [{ origin: ORIGIN, localStorage: [{ name: "resst.mapEngine", value }] }],
});
test.use({ storageState: seed("leaflet") });

// Tuttle Creek (layout.spec.ts uses the same point).
const TUTTLE = { lon: -96.5943465450358, lat: 39.2562232982835 };

test.beforeEach(async ({ page }) => {
  await stubEsri(page); // also serves the raster World_Topo_Map tiles
  await stubUsgsTiles(page);
  await stubSediment(page);
  // The Kansas basin fixture (3 sites) for every HUC level; the test river for rivers.json.
  await page.route("**/overlays/*.json", (route) =>
    route.fulfill({ json: /huc\d[^/]*\.json$/.test(route.request().url()) ? KANSAS_BASIN_FC : TEST_RIVER_FC }),
  );
});

async function openApp(page: Page): Promise<void> {
  await page.goto("./");
  await page.getByRole("button", { name: "OK" }).click(); // welcome dialog
  await waitForDomMapReady(page);
}

const selectBtn = (page: Page) => page.locator(".map-toolbar").getByRole("button", { name: /^Select/ });
const hintBar = (page: Page) => page.locator(".map-hint-bar");
const selectedCount = (page: Page, n: number) =>
  expect(page.locator(".details-panel")).toContainText(`Selected Sites: ${n}`);
const armTool = async (page: Page, item: string | RegExp) => {
  await selectBtn(page).click();
  await page.locator(".select-menu").getByRole("button", { name: item }).click();
};
const clickAt = async (page: Page, lon: number, lat: number) => {
  const p = await screenPt(page, lon, lat);
  await page.mouse.click(p.x, p.y);
};
const overlayReady = (page: Page, key: string) =>
  expect.poll(async () => (await domCounts(page)).overlays[key] ?? 0, { timeout: 15_000 }).toBeGreaterThan(0);
async function selectFromTable(page: Page, name: string): Promise<void> {
  await page.locator(".table-panel input").first().fill(name);
  await page.locator(".data-table tbody tr", { hasText: name }).first().click();
}

test("boots on the Leaflet map with every site drawn and no WebGL canvas", async ({ page }) => {
  await openApp(page);
  await expect(page.locator(".map-panel.leaflet-container")).toBeVisible();
  await expect(page.locator(".maplibregl-canvas")).toHaveCount(0);
  expect(await page.evaluate(() => !!(window as any).__resstMap)).toBe(false);
  expect(await domCounts(page)).toMatchObject({ sites: 963, selected: 0, labels: 0, network: 0, basin: 0, sketch: 0 });
  await expect(page.locator(".app-footer")).toContainText("Map: Leaflet");
  // Labels from MapLibre zoom 6 (Leaflet 7), capped and collision-placed.
  await jumpTo(page, -96.6, 39.25, 8);
  await expect.poll(async () => (await domCounts(page)).labels).toBeGreaterThan(0);
  expect((await domCounts(page)).labels).toBeLessThanOrEqual(150);
});

test("clicking a marker selects the site, opens the popup, and rings it", async ({ page }) => {
  await openApp(page);
  // At the CONUS fit Tuttle and Milford overlap; zoom in first, as the WebGL specs do.
  await jumpTo(page, TUTTLE.lon, TUTTLE.lat, 10);
  await clickAt(page, TUTTLE.lon, TUTTLE.lat);
  await expect(page.locator(".details-panel")).toContainText("Tuttle Creek");
  await selectedCount(page, 1);
  await expect(page.locator(".leaflet-popup")).toContainText("Tuttle Creek");
  expect((await domCounts(page)).selected).toBe(1);
  await page.locator(".leaflet-popup").getByRole("button", { name: "Close popup" }).click();
  await expect(page.locator(".leaflet-popup")).toHaveCount(0);
  await selectedCount(page, 1); // closing the popup never clears the selection
});

test("a table row flies the camera to the site on the MapLibre zoom basis", async ({ page }) => {
  await openApp(page);
  await selectFromTable(page, "Tuttle Creek");
  await landed(page, TUTTLE.lon, TUTTLE.lat);
  // max(current, MapLibre 8) → Leaflet 9.
  expect(await page.evaluate(() => (window as any).__resstLeaflet.getZoom())).toBeCloseTo(9, 5);
  await expect(page.locator(".leaflet-popup")).toContainText("Tuttle Creek");
});

test("box mode selects the dragged sites and disarms", async ({ page }) => {
  await openApp(page);
  await jumpTo(page, -96.6, 39.25, 8);
  await armTool(page, /^Box/);
  const start = await screenPt(page, -96.95, 38.95);
  const end = await screenPt(page, -96.25, 39.55);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 6 });
  await page.mouse.up();
  await selectedCount(page, 3); // Tuttle Creek, Milford, Kansas River
  expect((await domCounts(page)).selected).toBe(3);
  await expect(selectBtn(page)).toHaveText(/^Select ▾$/); // one-shot: disarmed
  await expect(hintBar(page)).toHaveCount(0);
});

test("polygon draw selects on Enter; Escape clears the sketch", async ({ page }) => {
  await openApp(page);
  await jumpTo(page, -96.6, 39.25, 8);
  await armTool(page, /^Polygon/);
  await clickAt(page, -96.7, 39.35);
  await clickAt(page, -96.45, 39.35);
  await clickAt(page, -96.58, 39.15);
  await page.keyboard.press("Enter");
  await selectedCount(page, 1);
  await expect(page.locator(".details-panel")).toContainText("Tuttle Creek");
  // The selection flew the camera to Tuttle and opened its popup above the
  // marker; re-centre and sketch south of it so the clicks reach the map.
  await jumpTo(page, -96.6, 39.25, 8);
  await armTool(page, /^Polygon/);
  await clickAt(page, -96.7, 39.1);
  await clickAt(page, -96.45, 39.1);
  await expect.poll(async () => (await domCounts(page)).sketch).toBeGreaterThan(0);
  await page.keyboard.press("Escape");
  await expect(hintBar(page)).toHaveCount(0);
  expect((await domCounts(page)).sketch).toBe(0);
  await selectedCount(page, 1); // Esc never reverts an applied selection
});

test("HUC mode draws the boundary overlay and selects the clicked basin's sites", async ({ page }) => {
  await openApp(page);
  await jumpTo(page, -96.6, 39.25, 8);
  await armTool(page, "HUC-2");
  await expect(hintBar(page)).toContainText("Click a HUC-2 basin");
  await overlayReady(page, "huc2"); // arming switched the overlay on and its snapshot landed
  await clickAt(page, -96.6, 39.25);
  await selectedCount(page, 3);
  await expect(selectBtn(page)).toHaveText(/^Select ▾$/);
});

test("river mode picks a corridor and recomputes live as the distance changes", async ({ page }) => {
  await openApp(page);
  await jumpTo(page, -96.6, 39.25, 8);
  await armTool(page, /^Near a river/);
  await overlayReady(page, "rivers");
  await clickAt(page, -96.55, 39.25);
  await expect(hintBar(page)).toContainText("1 site within 10 mi of Test River");
  await selectedCount(page, 1);
  await page.getByRole("spinbutton", { name: "Distance from the river in miles" }).fill("25");
  await expect(hintBar(page)).toContainText("4 sites within 25 mi of Test River");
  await selectedCount(page, 4);
  await hintBar(page).getByRole("button", { name: "Done" }).click();
  await expect(hintBar(page)).toHaveCount(0);
  await selectedCount(page, 4);
});

test("network highlight and the NLDI drainage area draw on the Leaflet map", async ({ page }) => {
  await stubNldi(page);
  await openApp(page);
  await selectFromTable(page, "Tuttle Creek");
  await landed(page, TUTTLE.lon, TUTTLE.lat);
  await openDetailSection(page, "Reservoir Network");
  const net = page.locator("#detail-sec-net");
  await net.locator(".nw-btn", { hasText: "Full network" }).click();
  await expect.poll(async () => (await domCounts(page)).network).toBeGreaterThan(0);
  await net.locator(".nw-btn", { hasText: "Drainage area" }).click();
  await expect.poll(async () => (await domCounts(page)).basin, { timeout: 15_000 }).toBe(1);
  await net.locator(".nw-btn", { hasText: "Drainage area" }).click();
  await expect.poll(async () => (await domCounts(page)).basin).toBe(0);
  await net.getByRole("button", { name: "Clear" }).click();
  await expect.poll(async () => (await domCounts(page)).network).toBe(0);
});

test("the basemap picker swaps the raster layer and the engine switch round-trips", async ({ page }) => {
  await openApp(page);
  const trigger = page.getByRole("button", { name: /^Basemap:/ });
  const url = () => page.evaluate(() => (window as any).__resstDom.basemapUrl() as string);
  expect(await url()).toContain("World_Topo_Map");
  await trigger.click();
  await page.getByRole("radio", { name: "USGS Topo" }).click();
  await expect.poll(url).toContain("basemap.nationalmap.gov");
  await expect(page.locator(".app-footer")).toContainText("USGS The National Map");
  await expect(trigger).toHaveAccessibleName("Basemap: USGS Topo");
  expect(await page.evaluate(() => localStorage.getItem("resst.basemap"))).toBe("usgs");
  // Engine switch by URL: MapLibre boots, with the USGS choice carried across.
  await page.goto("./?map=maplibre");
  await page.getByRole("button", { name: "OK" }).click();
  await page.waitForFunction(() => !!(window as any).__resstMap && !(window as any).__resstLeaflet);
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();
  await expect(page.locator(".leaflet-container")).toHaveCount(0);
  await expect(page.locator(".app-footer")).not.toContainText("Map: Leaflet");
  await page.goto("./?map=leaflet");
  await page.getByRole("button", { name: "OK" }).click();
  await waitForDomMapReady(page);
  await expect(page.locator(".maplibregl-canvas")).toHaveCount(0);
  expect(await page.evaluate(() => !!(window as any).__resstMap)).toBe(false);
});

test("unavailable features say so, and the Leaflet map is axe-clean", async ({ page }) => {
  await openApp(page);
  await page.locator(".map-toolbar").getByRole("button", { name: "Layers" }).click();
  await expect(page.locator(".layers-list [role='status']").first()).toContainText("not yet available");
  await expect(page.getByRole("checkbox", { name: /All modeled reservoirs/ })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: /^Screening/ })).toBeDisabled();
  await selectFromTable(page, "Tuttle Creek"); // popup + ring in scope for the scan
  await landed(page, TUTTLE.lon, TUTTLE.lat);
  const results = await new AxeBuilder({ page })
    .exclude(".leaflet-tile-pane") // decorative tile images
    .exclude(".leaflet-pane svg") // 963 marker paths: nothing to check, expensive to walk
    .exclude(".leaflet-pane canvas")
    .exclude(".leaflet-tooltip-pane") // labels over tiles read as contrast "incomplete"
    .analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
});

test("phone: the basemap trigger stays above Leaflet's control stack and its panel fits", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page);
  const hit = await page.evaluate(() => {
    const t = document.querySelector(".basemap-trigger")!.getBoundingClientRect();
    return !!document.elementFromPoint(t.left + t.width / 2, t.top + t.height / 2)?.closest(".basemap-trigger");
  });
  expect(hit).toBe(true);
  await page.getByRole("button", { name: /^Basemap:/ }).click();
  const panel = (await page.locator(".basemap-panel").boundingBox())!;
  expect(panel.x).toBeGreaterThanOrEqual(0);
  expect(panel.x + panel.width).toBeLessThanOrEqual(390);
});

test.describe("automatic engine choice", () => {
  test.use({ storageState: { cookies: [], origins: [] } }); // no seed: the rule decides
  test("follows the detected render class", async ({ page }) => {
    await page.goto("./");
    await page.getByRole("button", { name: "OK" }).click();
    await page.waitForFunction(() => !!(window as any).__resstLeaflet || !!(window as any).__resstMap);
    const cls = await page.evaluate(() => sessionStorage.getItem("resst.renderClass"));
    expect(["software", "hardware", "unknown"]).toContain(cls);
    const leaflet = await page.evaluate(() => !!(window as any).__resstLeaflet);
    expect(leaflet).toBe(cls === "software"); // a masked renderer string keeps MapLibre
  });
});
