// Map search: local site matches plus USGS GNIS places (keyless gazetteer),
// grouped in one listbox. GNIS and Esri endpoints are both route-stubbed —
// CI never depends on either being reachable. The GNIS stub answers every
// query with the same fixtures so the Places group is deterministic
// regardless of which site names the query matches.
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { stubEsri, waitForBasemap } from "./helpers/esriStub";

const GNIS_ROUTE = /carto\.nationalmap\.gov\/arcgis\/rest\/services\/geonames\/MapServer\/(\d+)\/query/;

// Layer 6 (Streams) responds with a MULTIPOINT geometry — the parser takes
// the first vertex; layer 1 (Civil) uses a plain point.
const GNIS_FIXTURES: Record<string, unknown> = {
  "6": {
    features: [
      {
        attributes: {
          gaz_id: 101,
          gaz_name: "Platte River",
          gaz_featureclass: "Stream",
          state_alpha: "NE",
          county_name: "Platte",
        },
        geometry: { points: [[-96.0, 41.05], [-96.2, 41.0]] },
      },
    ],
  },
  "1": {
    features: [
      {
        attributes: {
          gaz_id: 102,
          gaz_name: "Platteville",
          gaz_featureclass: "Civil",
          state_alpha: "CO",
          county_name: "Weld",
        },
        geometry: { x: -104.82, y: 40.21 },
      },
    ],
  },
};

async function stubGnis(page: Page, opts: { fail?: boolean; empty?: boolean } = {}): Promise<void> {
  await page.route(GNIS_ROUTE, (route) => {
    if (opts.fail) return route.abort("failed");
    if (opts.empty) return route.fulfill({ json: { features: [] } });
    const layer = route.request().url().match(GNIS_ROUTE)?.[1] ?? "";
    return route.fulfill({ json: GNIS_FIXTURES[layer] ?? { features: [] } });
  });
}

async function openApp(page: Page): Promise<void> {
  await page.goto("./");
  await page.getByRole("button", { name: "OK" }).click(); // welcome dialog
  await waitForBasemap(page, true); // settled on the Esri default
}

const combo = (page: Page) => page.getByRole("combobox", { name: "Find a site or place by name" });
const listbox = (page: Page) => page.locator("#map-search-results");
const status = (page: Page) => page.locator(".map-search [role='status']");

test("typing shows grouped site and place results with class/state metadata", async ({ page }) => {
  await stubEsri(page);
  await stubGnis(page);
  await openApp(page);
  await combo(page).fill("creek"); // matches real sites; the GNIS stub answers regardless
  await expect(listbox(page)).toBeVisible();
  await expect(listbox(page).locator("#map-search-grp-sites")).toHaveText("Sites");
  await expect(listbox(page).locator("#map-search-grp-places")).toHaveText("Places (USGS GNIS)");
  await expect(listbox(page).getByRole("option", { name: /Tuttle Creek/ }).first()).toBeVisible();
  await expect(listbox(page).getByRole("option", { name: /Platte River · Stream · NE, Platte/ })).toBeVisible();
  await expect(listbox(page).getByRole("option", { name: /Platteville · City · CO, Weld/ })).toBeVisible();
});

test("keyboard spans groups; Enter on a place flies the map and drops a pin", async ({ page }) => {
  await stubEsri(page);
  await stubGnis(page);
  await openApp(page);
  const input = combo(page);
  await input.fill("creek");
  await expect(listbox(page).getByRole("option", { name: /Platte River/ })).toBeVisible();
  const optionCount = await listbox(page).getByRole("option").count();
  const siteCount = optionCount - 2; // the stub contributes exactly two places
  // Arrow from the top of the sites group across the boundary to the first
  // place ("Platte River" sorts before "Platteville" — space < letter).
  for (let i = 0; i < siteCount; i++) await input.press("ArrowDown");
  await expect(input).toHaveAttribute("aria-activedescendant", `map-search-opt-${siteCount}`);
  await expect(listbox(page).getByRole("option", { name: /Platte River/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await input.press("Enter");
  await page.waitForFunction(
    () => {
      const m = (window as any).__resstMap;
      if (!m || m.isMoving()) return false;
      const c = m.getCenter();
      return Math.abs(c.lng - -96.0) < 0.05 && Math.abs(c.lat - 41.05) < 0.05; // first multipoint vertex
    },
    undefined,
    { timeout: 10_000 },
  );
  await expect(page.locator(".maplibregl-marker")).toHaveCount(1);
  await expect(input).toHaveValue("Platte River");
  // The pin's popup names the place, and choosing did not reopen the dropdown.
  await expect(page.locator(".maplibregl-popup").getByText("Platte River")).toBeVisible();
  await expect(listbox(page)).toHaveCount(0);
});

test("choosing a site still selects it and clears any place pin", async ({ page }) => {
  await stubEsri(page);
  await stubGnis(page);
  await openApp(page);
  const input = combo(page);
  // Drop a pin first…
  await input.fill("creek");
  const platte = listbox(page).getByRole("option", { name: /Platte River/ });
  await expect(platte).toBeVisible();
  // dispatchEvent, not click(): choosing unmounts the option on mousedown and
  // a full click would race the detach.
  await platte.dispatchEvent("mousedown");
  await expect(page.locator(".maplibregl-marker")).toHaveCount(1);
  // …then choose a site.
  await input.fill("tuttle");
  const tuttle = listbox(page).getByRole("option", { name: /Tuttle Creek/ }).first();
  await expect(tuttle).toBeVisible();
  await tuttle.dispatchEvent("mousedown");
  await expect(page.locator(".details-panel")).toContainText("Selected Sites: 1");
  await expect(page.locator(".maplibregl-marker")).toHaveCount(0); // pin cleared
});

test("the place pin retires on clear, popup close, and table selection", async ({ page }) => {
  await stubEsri(page);
  await stubGnis(page);
  await openApp(page);
  const input = combo(page);
  const pickPlace = async () => {
    await input.fill("creek");
    const platte = listbox(page).getByRole("option", { name: /Platte River/ });
    await expect(platte).toBeVisible();
    await platte.dispatchEvent("mousedown");
    await expect(page.locator(".maplibregl-marker")).toHaveCount(1);
  };

  // Clearing the search box retires the pin.
  await pickPlace();
  await input.fill("");
  await expect(page.locator(".maplibregl-marker")).toHaveCount(0);

  // Closing the pin's popup retires the pin.
  await pickPlace();
  await page.locator(".maplibregl-popup-close-button").click();
  await expect(page.locator(".maplibregl-marker")).toHaveCount(0);

  // Selecting a site from the TABLE (not the search box) retires it too.
  await pickPlace();
  await page.locator(".data-table tbody tr", { hasText: "Tuttle Creek" }).first().click();
  await expect(page.locator(".details-panel")).toContainText("Selected Sites: 1");
  await expect(page.locator(".maplibregl-marker")).toHaveCount(0);
});

test("no GNIS matches → sites group only, with a settled status note", async ({ page }) => {
  await stubEsri(page);
  await stubGnis(page, { empty: true });
  await openApp(page);
  await combo(page).fill("creek");
  await expect(listbox(page).locator("#map-search-grp-sites")).toBeVisible();
  await expect(listbox(page).locator("#map-search-grp-places")).toHaveCount(0);
  await expect(status(page)).toHaveText("No places found");
});

test("GNIS failure degrades quietly — sites keep working", async ({ page }) => {
  await stubEsri(page);
  await stubGnis(page, { fail: true });
  await openApp(page);
  const input = combo(page);
  await input.fill("tuttle");
  const tuttle = listbox(page).getByRole("option", { name: /Tuttle Creek/ }).first();
  await expect(tuttle).toBeVisible();
  await expect(status(page)).toHaveText("Place search unavailable");
  await tuttle.dispatchEvent("mousedown");
  await expect(page.locator(".details-panel")).toContainText("Selected Sites: 1");
});

test("the open search dropdown is axe-clean", async ({ page }) => {
  await stubEsri(page);
  await stubGnis(page);
  await openApp(page);
  await combo(page).fill("creek");
  await expect(listbox(page)).toBeVisible();
  const results = await new AxeBuilder({ page }).exclude(".maplibregl-canvas").analyze();
  expect(
    results.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => `${v.id}: ${v.nodes.length} nodes`),
  ).toEqual([]);
});
