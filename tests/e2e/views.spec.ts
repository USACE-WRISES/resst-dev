// The Map · Dashboard · Library switch (src/components/ViewSwitch.tsx, App.tsx):
// the Map view stays mounted and laid out under the other two, the URL hash
// names the view, and a selection survives a round trip.
import { test, expect, type Page } from "@playwright/test";
import { stubEsri } from "./helpers/esriStub";
import { stubSediment } from "./helpers/sedimentFixtures";
import { landed, waitForMapIdle } from "./helpers/mapReady";
import { showPanels } from "./helpers/panels";

const TUTTLE: [number, number] = [-96.5943465450358, 39.2562232982835];

async function openApp(page: Page): Promise<void> {
  await stubEsri(page); // the default basemap boots from Esri endpoints — keep CI hermetic
  await stubSediment(page);
  await page.goto("./");
  await page.getByRole("button", { name: "OK", exact: true }).click();
}

// "Map" is a substring of "Show on map" and the Basemap button: exact, scoped.
const switchBtn = (page: Page, name: string) => page.locator(".view-switch").getByRole("button", { name, exact: true });

test("the header switch offers the three views with the Map pressed", async ({ page }) => {
  await openApp(page);
  const group = page.getByRole("group", { name: "View" });
  await expect(group.getByRole("button")).toHaveText(["Map", "Dashboard", "Library"]);
  await expect(switchBtn(page, "Map")).toHaveAttribute("aria-pressed", "true");
  await expect(switchBtn(page, "Dashboard")).toHaveAttribute("aria-pressed", "false");
  await expect(page).toHaveURL(/\/resst-dev\/$/);
});

test("the Dashboard sits over the map view, which stays laid out but inert", async ({ page }) => {
  await openApp(page);
  await waitForMapIdle(page);
  await switchBtn(page, "Dashboard").click();
  await expect(page.locator(".dash-page")).toBeVisible();
  await expect(page).toHaveURL(/#dashboard$/);
  await expect(switchBtn(page, "Dashboard")).toHaveAttribute("aria-pressed", "true");

  const main = page.locator(".app-main");
  await expect(main).toHaveAttribute("inert", "");
  await expect(main).toHaveCSS("visibility", "hidden");
  // Still laid out: the Leaflet map keeps its size (a display:none map would drop to 0).
  expect(await page.evaluate(() => (document.querySelector(".map-panel") as HTMLElement).clientWidth)).toBeGreaterThan(300);
  expect(await page.evaluate(() => !!(window as any).__resstMap)).toBe(true);
  await expect(page.locator(".mobile-bar")).toHaveCount(0);
  await expect(page.locator(".skip-link")).toHaveCount(0);

  await switchBtn(page, "Map").click();
  expect(await main.getAttribute("inert")).toBeNull();
  await expect(main).toHaveCSS("visibility", "visible");
  await expect(page).toHaveURL(/\/resst-dev\/$/);
  await expect(page.locator(".skip-link")).toHaveCount(1);
});

test("a hash opens a view directly, and a selection survives a round trip", async ({ page }) => {
  await stubEsri(page);
  await stubSediment(page);
  await page.goto("./#library");
  await page.getByRole("button", { name: "OK", exact: true }).click();
  await expect(page.locator(".lib-page")).toBeVisible();
  await expect(switchBtn(page, "Library")).toHaveAttribute("aria-pressed", "true");

  await switchBtn(page, "Map").click();
  await waitForMapIdle(page);
  await showPanels(page, { table: true });
  await page.locator(".data-table tbody tr", { hasText: "Tuttle Creek" }).first().click();
  await landed(page, TUTTLE[0], TUTTLE[1]);
  await expect(page.locator(".leaflet-popup")).toHaveCount(1);
  const centre = await page.evaluate(() => (window as any).__resstMapInfo.getCenter());

  await switchBtn(page, "Dashboard").click();
  await expect(page.locator(".dash-page")).toBeVisible();
  await switchBtn(page, "Map").click();
  await expect(page.locator(".leaflet-popup")).toBeVisible();
  expect(await page.evaluate(() => (window as any).__resstMapInfo.getCenter())).toEqual(centre);
  await expect(page.locator(".details-panel")).toContainText("Tuttle Creek");
});

test("a hash change in the address bar switches views; unrelated hashes are ignored", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    location.hash = "#dashboard";
  });
  await expect(page.locator(".dash-page")).toBeVisible();
  await page.evaluate(() => {
    location.hash = "";
  });
  await expect(page.locator(".dash-page")).toBeHidden(); // parked
  await expect(page.locator(".app-main")).toHaveCSS("visibility", "visible");
  // The skip link's own hash leaves the view alone, and it opens the table it skips to.
  await page.locator(".skip-link").focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#results-table$/);
  await expect(page.locator(".table-panel")).toBeVisible();
  await expect(page.locator(".app-main")).toHaveCSS("visibility", "visible");
  await expect(switchBtn(page, "Map")).toHaveAttribute("aria-pressed", "true");
});

test("a visited page stays mounted, parked, and comes back exactly as it was", async ({ page }) => {
  await stubEsri(page);
  await stubSediment(page);
  await page.goto("./#library");
  await page.getByRole("button", { name: "OK", exact: true }).click();
  await expect(page.locator(".lib-row")).toHaveCount(465); // every row built
  await page.locator(".lib-row").first().evaluate((el) => el.setAttribute("data-probe", "kept"));
  const wrap = page.locator(".lib-table-wrap");
  await wrap.evaluate((el) => {
    el.scrollTop = 600;
  });

  await switchBtn(page, "Map").click();
  const slot = page.locator("section.view-page", { has: page.locator(".lib-page") });
  await expect(slot).toBeHidden();
  await expect(slot).toHaveAttribute("inert", "");
  await expect(slot).toHaveClass(/is-parked/);
  await expect(page.locator(".app-main")).toHaveCSS("visibility", "visible");
  expect(await page.locator(".app-main").getAttribute("inert")).toBeNull();

  await switchBtn(page, "Library").click();
  await expect(slot).toBeVisible();
  await expect(page.locator('.lib-row[data-probe="kept"]')).toHaveCount(1); // the same DOM: nothing was rebuilt
  expect(await wrap.evaluate((el) => el.scrollTop)).toBe(600);
});

test("phone: the switch keeps its names as icons and nothing overflows", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page);
  await expect(switchBtn(page, "Dashboard")).toBeVisible();
  await expect(page.locator(".view-btn-label").first()).toBeHidden();
  await expect(page.locator(".app-header h1")).toHaveText("Reservoir Sustainable Sediment Tool (RESST)"); // sr-only, still named
  await switchBtn(page, "Dashboard").click();
  await expect(page.locator(".dash-page")).toBeVisible();
  const geom = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  expect(geom.sw).toBe(geom.cw);
});
