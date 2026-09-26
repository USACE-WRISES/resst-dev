// Network explorer: the Reservoir Network card (Show on map buttons with the
// counts, the downstream path schematic, the drainage figures), the nw-* map
// highlight the buttons drive, legend rows, reset-on-selection-change, and
// basemap-swap survival. Hermetic via the sediment fixtures (network:
// Upstream Dam(20) → Tuttle Creek Dam(10) → Big River mouth(-5); Lone
// Reservoir(30) isolated).
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { stubEsri, waitForBasemap } from "./helpers/esriStub";
import { screenPt, waitForMapIdle } from "./helpers/mapReady";
import { inventoryWithUpstream, stubSediment } from "./helpers/sedimentFixtures";
import { openDetailSection } from "./helpers/sections";

// Tuttle Creek (the site and its fixture dam share these coordinates).
const TUTTLE_LON = -96.5943465450358;
const TUTTLE_LAT = 39.2562232982835;

async function openOnTuttle(page: Page) {
  await stubEsri(page);
  await stubSediment(page);
  await page.goto("./");
  await page.getByRole("button", { name: "OK" }).click();
  await page.locator(".table-panel input").first().fill("Tuttle");
  await page.locator(".data-table tbody tr", { hasText: "Tuttle Creek" }).first().click();
  await openDetailSection(page, "Reservoir Network");
  // Selecting a site flies the camera and rewrites the sites source. Every
  // test below reads nw-* sources through the worker, so settle first rather
  // than racing the poll budget against style and tile work.
  await waitForMapIdle(page);
}

const sourceKinds = (page: Page) => page.evaluate(() => (window as any).__resstMapInfo.networkKinds());

test("network card: map buttons with counts, the downstream path, and the drainage figures", async ({ page }) => {
  await openOnTuttle(page);
  const net = page.locator("#detail-sec-net");
  // The header summarizes while collapsed; here it is open.
  await expect(page.locator(".detail-sec-head", { hasText: "Reservoir Network" }).locator(".sec-peek")).toHaveText(
    "1 up · 0 down",
  );
  // Show on map comes first, and the counts live on its buttons.
  await expect(net.getByRole("group", { name: "Show on map" })).toBeVisible();
  await expect(net.locator(".nw-btn", { hasText: "Upstream" })).toContainText("1");
  await expect(net.locator(".nw-btn", { hasText: "Downstream" })).toContainText("0");
  // A terminal dam still has a downstream path (its mouth), so Downstream stays usable.
  await expect(net.locator(".nw-btn", { hasText: "Downstream" })).toBeEnabled();
  await expect(net.locator(".nw-tags")).toContainText("Terminal dam");
  // The downstream path: this dam, then the mouth.
  await expect(net.locator(".nw-path-caption")).toHaveText("This is the last dam before the river reaches its mouth.");
  await expect(net.locator(".flow-step")).toHaveText(["Tuttle Creek Dam this dam", "Big River river mouth"]);
  // The path caveat and the SCA semantic (connectivity, not delivery) sit behind the ⓘ.
  await net.getByRole("button", { name: "How the downstream path is drawn" }).click();
  await expect(net.locator(".info-tip-pop")).toContainText("follow this flow path only");
  await page.keyboard.press("Escape");
  await expect(net.locator(".nw-area")).toContainText("25,000 km²");
  await expect(net.locator(".nw-area")).toContainText("76% (19,000 km²)");
  await net.getByRole("button", { name: "About the share not behind another dam" }).click();
  await expect(net.locator(".info-tip-pop")).toContainText("without first passing another dam");
  await page.keyboard.press("Escape");
  await expect(net).toContainText("ResNet v1");
});

test("a mid-network dam's path names the reservoirs sediment would encounter", async ({ page }) => {
  await stubEsri(page);
  await stubSediment(page);
  await page.goto("./");
  await page.getByRole("button", { name: "OK" }).click();
  // Upstream Dam (20) is a national-layer reservoir: turn the layer on and click its dot.
  await page.getByRole("button", { name: "Layers" }).click();
  await page.getByRole("checkbox", { name: /All modeled reservoirs/ }).check();
  await expect.poll(() => page.evaluate(() => (window as any).__resstMapInfo.counts().national)).toBe(3);
  await page.keyboard.press("Escape");
  await page.evaluate(() => (window as any).__resstMapInfo.jumpTo(-96.55, 39.35, 10));
  await page.waitForTimeout(400); // let the moved frame render before hit-testing
  const pt = await page.evaluate(() => (window as any).__resstMapInfo.project(-96.55, 39.35));
  const box = (await page.locator(".map-panel").boundingBox())!;
  await page.mouse.click(box.x + pt.x, box.y + pt.y);
  await expect(page.locator(".details-panel .site-name")).toHaveText("Upstream Dam");
  await openDetailSection(page, "Reservoir Network");
  const net = page.locator("#detail-sec-net");
  await expect(net.locator(".nw-path-caption")).toHaveText(
    "Sediment passing this dam would encounter 1 more reservoir before the river reaches its mouth.",
  );
  await expect(net.locator(".flow-step")).toHaveText([
    "Upstream Dam this dam",
    "Tuttle Creek Dam",
    "Big River river mouth",
  ]);
  // A headwater dam has nothing upstream to show.
  await expect(net.locator(".nw-btn", { hasText: "Upstream" })).toBeDisabled();
});

test("mode buttons drive the nw-net highlight and the legend follows", async ({ page }) => {
  await openOnTuttle(page);
  const net = page.locator("#detail-sec-net");
  const down = net.locator(".nw-btn", { hasText: "Downstream" });
  await down.click();
  await expect(down).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(() => sourceKinds(page))
    .toEqual({ mouth: 1, conn: 1 }); // chain to the mouth + the schematic connector
  // While the downstream line is on the map, the card says it is schematic.
  await expect(net.locator(".nw-schematic-note")).toContainText("does not trace the river");
  // Legend gains the network rows.
  await page.locator(".map-toolbar button", { hasText: "Legend" }).click();
  await expect(page.locator(".legend-list")).toContainText("River mouth");
  await expect(page.locator(".legend-list")).toContainText("schematic, not the river course");
  await page.keyboard.press("Escape");

  await net.locator(".nw-btn", { hasText: "Upstream" }).click();
  await expect.poll(() => sourceKinds(page)).toEqual({ up: 1 });
  await expect(net.locator(".nw-schematic-note")).toHaveCount(0); // no downstream line on the map

  await net.locator(".nw-btn", { hasText: "Both" }).click();
  await expect.poll(() => sourceKinds(page)).toEqual({ up: 1, mouth: 1, conn: 1 });
  // While a highlight is on, the collapsed header says so.
  await expect(page.locator(".detail-sec-head", { hasText: "Reservoir Network" }).locator(".sec-peek")).toHaveText(
    "Shown on map",
  );

  await net.getByRole("button", { name: "Clear highlight", exact: true }).click();
  await expect.poll(() => sourceKinds(page)).toEqual({});
});

test("the card's ⓘ popovers open fully inside the panel", async ({ page }) => {
  await openOnTuttle(page);
  const panel = (await page.locator(".details-panel").boundingBox())!;
  const within = async (pop: import("@playwright/test").Locator) => {
    await expect(pop).toBeVisible();
    const b = (await pop.boundingBox())!;
    expect(b.x).toBeGreaterThanOrEqual(panel.x);
    expect(b.x + b.width).toBeLessThanOrEqual(panel.x + panel.width);
  };
  const net = page.locator("#detail-sec-net");
  // The citation ⓘ at the end of a short source line used to open leftward, off the panel.
  await net.locator(".source-line .prov-info-btn").click();
  await within(net.locator(".prov-pop"));
  await page.keyboard.press("Escape");
  await net.getByRole("button", { name: "About the share not behind another dam" }).click();
  await within(net.locator(".info-tip-pop"));
  await page.keyboard.press("Escape");
  await net.getByRole("button", { name: "How the downstream path is drawn" }).click();
  await within(net.locator(".info-tip-pop"));
});

test("a canvas-drawn upstream highlight never blocks the site markers, and clearing it removes the canvas", async ({
  page,
}) => {
  await stubEsri(page);
  await stubSediment(page, { inventory: inventoryWithUpstream(520) });
  await page.goto("./");
  await page.getByRole("button", { name: "OK" }).click();
  await page.locator(".table-panel input").first().fill("Tuttle");
  await page.locator(".data-table tbody tr", { hasText: "Tuttle Creek" }).first().click();
  await openDetailSection(page, "Reservoir Network");
  await waitForMapIdle(page);
  const net = page.locator("#detail-sec-net");
  const upstream = net.locator(".nw-btn", { hasText: "Upstream" });
  await expect(upstream).toContainText("521");
  const canvas = page.locator(".leaflet-networkDots-pane > canvas");

  await upstream.click();
  await expect.poll(() => sourceKinds(page)).toEqual({ up: 521 });
  await expect(canvas).toHaveCount(1); // past 500 dots the highlight draws on a canvas
  await expect(canvas).toHaveCSS("pointer-events", "none");

  // Pull back so several documented sites are in view, then probe them: the
  // canvas spans the whole map above the site markers, yet each marker still
  // takes the pointer. (jumpTo returns the map, which cannot be serialized.)
  const pullBack = () =>
    page.evaluate(() => {
      (window as any).__resstMapInfo.jumpTo(-96.3, 39.1, 7);
    });
  await pullBack();
  await waitForMapIdle(page);
  const probe = await page.evaluate(() => {
    const map = document.querySelector(".map-panel")!.getBoundingClientRect();
    const hits: Array<{ x: number; y: number; hit: string }> = [];
    for (const p of document.querySelectorAll(".leaflet-sites-pane path.leaflet-interactive")) {
      const r = p.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      if (x < map.left + 20 || x > map.right - 60 || y < map.top + 60 || y > map.bottom - 20) continue;
      const el = document.elementFromPoint(x, y);
      if (el?.closest(".leaflet-popup-pane, .map-toolbar")) continue;
      hits.push({ x, y, hit: el?.tagName === "CANVAS" ? "canvas" : el?.closest(".leaflet-sites-pane") ? "marker" : "other" });
    }
    return hits;
  });
  expect(probe.filter((h) => h.hit === "canvas")).toEqual([]);
  expect(probe.some((h) => h.hit === "marker")).toBe(true);

  // Clearing the highlight takes the canvas off the map; the next large highlight brings it back.
  await net.getByRole("button", { name: "Clear highlight", exact: true }).click();
  await expect(canvas).toHaveCount(0);
  await upstream.click();
  await expect(canvas).toHaveCount(1);

  // A marker click selects its site straight through the highlight (same
  // view as the probe, so its points still apply).
  await pullBack();
  await waitForMapIdle(page);
  const tuttle = await screenPt(page, TUTTLE_LON, TUTTLE_LAT);
  const other = probe.find((h) => h.hit === "marker" && Math.hypot(h.x - tuttle.x, h.y - tuttle.y) > 12)!;
  expect(other).toBeTruthy();
  await page.mouse.click(other.x, other.y);
  await expect(page.locator(".details-panel .site-name")).not.toHaveText("Tuttle Creek");
  await expect(canvas).toHaveCount(0); // the new selection reset the highlight
});

test("a network highlight closes the site popup so it does not cover the network", async ({ page }) => {
  await openOnTuttle(page);
  await expect(page.locator(".leaflet-popup")).toHaveCount(1);
  await page.locator("#detail-sec-net .nw-btn", { hasText: "Upstream" }).click();
  await expect.poll(() => sourceKinds(page)).toEqual({ up: 1 });
  await expect(page.locator(".leaflet-popup")).toHaveCount(0);
});

test("changing the selection resets the highlight", async ({ page }) => {
  await openOnTuttle(page);
  await page.locator("#detail-sec-net .nw-btn", { hasText: "Both" }).click();
  await expect.poll(() => sourceKinds(page)).toEqual({ up: 1, mouth: 1, conn: 1 });
  await page.locator(".table-panel input").first().fill("Fall Creek");
  await page.locator(".data-table tbody tr", { hasText: "Fall Creek" }).first().click();
  await expect.poll(() => sourceKinds(page)).toEqual({});
  await expect(page.locator("#detail-sec-net")).toHaveCount(0); // non-crosswalked site
});

const BASIN_SQUARE = {
  type: "Feature",
  properties: {},
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [-96.9, 39.0],
        [-96.3, 39.0],
        [-96.3, 39.5],
        [-96.9, 39.5],
        [-96.9, 39.0],
      ],
    ],
  },
};

/** Stub the two USGS NLDI calls (position lookup, basin polygon). */
async function stubNldi(page: Page, opts: { fail?: boolean } = {}) {
  await page.route("**/api.water.usgs.gov/nldi/**", (route) => {
    if (opts.fail) return route.fulfill({ status: 503, body: "unavailable" });
    const url = route.request().url();
    const body = url.includes("/position")
      ? { type: "FeatureCollection", features: [{ type: "Feature", properties: { comid: 111 }, geometry: null }] }
      : { type: "FeatureCollection", features: [BASIN_SQUARE] };
    return route.fulfill({ status: 200, contentType: "application/geo+json", body: JSON.stringify(body) });
  });
}

test("the drainage-area toggle draws the NLDI basin and notes the source", async ({ page }) => {
  await stubNldi(page);
  await openOnTuttle(page);
  const net = page.locator("#detail-sec-net");
  await net.locator(".nw-btn", { hasText: "Drainage area" }).click();
  const basinCount = () => page.evaluate(() => (window as any).__resstMapInfo.counts().basin);
  // Two NLDI round-trips (position, then basin) plus a setData — more work
  // than a DOM assertion, so this one poll states its own budget.
  await expect.poll(basinCount, { timeout: 15_000 }).toBe(1);
  await expect(net.locator(".nw-basin-note")).toContainText("USGS NLDI");
  // The Legend names the outline.
  await page.locator(".map-toolbar button", { hasText: "Legend" }).click();
  await expect(page.locator(".legend-list")).toContainText("Drainage area (USGS NLDI)");
  await expect(page.locator(".legend-list")).not.toContainText("Only Sites are visible");
  await page.keyboard.press("Escape");
  // Toggling off clears the polygon.
  await net.locator(".nw-btn", { hasText: "Drainage area" }).click();
  await expect.poll(basinCount, { timeout: 15_000 }).toBe(0);
  // Clear highlight clears a basin and a highlight together.
  await net.locator(".nw-btn", { hasText: "Drainage area" }).click();
  await net.locator(".nw-btn", { hasText: "Downstream" }).click();
  await expect.poll(basinCount, { timeout: 15_000 }).toBe(1);
  await net.getByRole("button", { name: "Clear highlight", exact: true }).click();
  await expect.poll(basinCount, { timeout: 15_000 }).toBe(0);
  await expect.poll(() => sourceKinds(page)).toEqual({});
});

test("the network card is axe-clean with a highlight on", async ({ page }) => {
  await openOnTuttle(page);
  await page.locator("#detail-sec-net .nw-btn", { hasText: "Both" }).click();
  await expect.poll(() => sourceKinds(page)).toEqual({ up: 1, mouth: 1, conn: 1 });
  const results = await new AxeBuilder({ page })
    .exclude(".leaflet-tile-pane")
    .exclude(".leaflet-pane svg")
    .exclude(".leaflet-pane canvas")
    .exclude(".leaflet-tooltip-pane")
    .analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes.length} nodes`)).toEqual([]);
});

test("an NLDI failure reports a status line and offers Retry", async ({ page }) => {
  await stubNldi(page, { fail: true });
  await openOnTuttle(page);
  const net = page.locator("#detail-sec-net");
  await net.locator(".nw-btn", { hasText: "Drainage area" }).click();
  await expect(net.locator(".sec-status[data-status='error']")).toContainText("Drainage area unavailable");
  await expect(net.getByRole("button", { name: "Retry" })).toBeVisible();
});

test("the network highlight survives a basemap swap", async ({ page }) => {
  await openOnTuttle(page);
  await page.locator("#detail-sec-net .nw-btn", { hasText: "Downstream" }).click();
  await expect.poll(() => sourceKinds(page)).toEqual({ mouth: 1, conn: 1 });
  await waitForBasemap(page, true); // settled on the Esri default before swapping
  await page.locator(".basemap-trigger").click();
  await page.getByRole("radio", { name: "USGS Topo" }).check();
  await waitForBasemap(page, false);
  await expect.poll(() => sourceKinds(page)).toEqual({ mouth: 1, conn: 1 });
});
