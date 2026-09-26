// Regenerates the Help dialog's workflow screenshots (public/help/*.jpg) by
// driving the BUILT app with Playwright — one staged capture per help tab, so
// the illustrations always show this app's real controls.
//
// Dev-time tool, not CI: it exercises the live basemap tile endpoints and the
// app's self-hosted overlay snapshots. Run it after the selection tools
// change, or whenever the UI the shots depict does.
//
//   npm run build && node scripts/help-screenshots.mjs
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";

const PORT = 4199;
const BASE = `http://localhost:${PORT}/resst-dev/`;
const OUT = "public/help";
const VIEW = { width: 1440, height: 900 };

const waitForServer = async () => {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(BASE);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`vite preview did not come up on :${PORT}`);
};

/** The map is "photo ready": every site drawn, tiles loaded, camera at rest.
    window.__resstMap is the Leaflet map; __resstMapInfo its counts/flags. */
const mapSettled = (page) =>
  page.waitForFunction(
    () => {
      const info = window.__resstMapInfo;
      return !!window.__resstMap && !!info && info.counts().sites > 0 && info.tilesLoaded() && !info.isMoving();
    },
    undefined,
    { timeout: 60_000 },
  );

const openApp = async (browser) => {
  const page = await browser.newPage({ viewport: VIEW });
  await page.goto(BASE);
  await page.getByRole("button", { name: "OK" }).click();
  await mapSettled(page);
  return page;
};

/** Zoom is in the app's (512 px) basis, like the map commands; Leaflet sits one step higher. */
const jumpTo = async (page, center, zoom) => {
  await page.evaluate(([c, z]) => window.__resstMap.setView([c[1], c[0]], z + 1, { animate: false }), [center, zoom]);
  await mapSettled(page);
};

const clickLngLat = async (page, lon, lat, opts = {}) => {
  const p = await page.evaluate(
    ([ln, lt]) => {
      const m = window.__resstMap;
      const pt = m.latLngToContainerPoint([lt, ln]);
      const r = m.getContainer().getBoundingClientRect();
      return { x: r.left + pt.x, y: r.top + pt.y };
    },
    [lon, lat],
  );
  await page.mouse.click(p.x, p.y, opts);
};

const shoot = async (page, name) => {
  await page.waitForTimeout(400); // let labels/halos finish compositing
  await page.screenshot({ path: `${OUT}/${name}.jpg`, type: "jpeg", quality: 80 });
  console.log(`  ✓ ${OUT}/${name}.jpg`);
  await page.close();
};

// The Map view opens clean (every panel collapsed, 2026-09-26), so each shot
// opens the panels it depicts the way a person does.
const openData = (page) => page.locator(".map-toolbar").getByRole("button", { name: /^Data filters/ }).click();
const openTable = (page) => page.locator(".map-toolbar").getByRole("button", { name: "Table", exact: true }).click();

/** Pick a documented site from the map search, then open its record with the popup's Show details. */
const openSiteDetails = async (page, name) => {
  await page.getByRole("combobox", { name: "Find a site or place by name" }).fill(name);
  await page.locator("#map-search-results").getByRole("option", { name: new RegExp(name) }).first().dispatchEvent("mousedown");
  await page.locator(".leaflet-popup").waitFor();
  await page.locator('.leaflet-popup [data-action="details"]').click();
  await page.locator(".details-panel .site-name").getByText(name).waitFor();
};

const armTool = async (page, item) => {
  await page.locator(".map-toolbar").getByRole("button", { name: /^Select/ }).click();
  await page.locator(".select-menu").getByRole("button", { name: item }).click();
};

const overlayReady = (page, key) =>
  page.waitForFunction((k) => (window.__resstMapInfo.counts().overlays[k] ?? 0) > 0, key, { timeout: 60_000 });

/** End the preview server and, on Windows, the process tree its shell started. */
const stopServer = (server) => {
  if (process.platform === "win32" && server.pid) spawn("taskkill", ["/pid", String(server.pid), "/t", "/f"], { stdio: "ignore" });
  else server.kill();
};

async function main() {
  await mkdir(OUT, { recursive: true });
  const server = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], {
    shell: true,
    stdio: "ignore",
  });
  let browser = null;
  try {
    await waitForServer();
    // GPU-style rasterization (SwiftShader through ANGLE). Headless Chromium's
    // default software compositor draws hairline seams around the block of
    // basemap tiles the map clips at fractional zooms (the opening view is
    // 4.75), which real browsers do not show.
    browser = await chromium.launch({
      args: ["--enable-gpu-rasterization", "--ignore-gpu-blocklist", "--use-gl=angle", "--use-angle=swiftshader"],
    });

    console.log("about — the app as it opens: the map with every panel folded to its tab");
    {
      const page = await openApp(browser);
      await shoot(page, "about");
    }

    console.log("assess — Big Tujunga with the trajectory chart and measured surveys in view");
    {
      const page = await openApp(browser);
      await openSiteDetails(page, "Big Tujunga");
      // Every Selected Data section starts collapsed (round 3): open the one with the chart.
      await page.locator(".detail-sec-head", { hasText: "Reservoir Sustainability" }).click();
      await page.locator(".traj-chart svg").waitFor({ timeout: 60_000 }); // chunk + surveys resident
      await page.locator(".traj-survey").first().waitFor(); // measured dots plotted
      await page.evaluate(() => document.querySelector(".traj-chart")?.scrollIntoView({ block: "center" }));
      await mapSettled(page); // the flyTo lands
      await shoot(page, "assess");
    }

    console.log("analogs — Tuttle Creek's comparable reservoirs");
    {
      const page = await openApp(browser);
      await openSiteDetails(page, "Tuttle Creek");
      // The card ranks its analogs as it opens (no button since 2026-09-25).
      await page.locator(".detail-sec-head", { hasText: "Comparable Reservoirs" }).click();
      await page.locator("#detail-sec-sim .sim-card").first().waitFor({ timeout: 60_000 });
      await page.evaluate(() =>
        document.querySelector('[aria-controls="detail-sec-sim"]')?.scrollIntoView({ block: "start" }),
      );
      await mapSettled(page);
      await shoot(page, "analogs");
    }

    console.log("screen — the national layer with a starting question applied in the docked panel");
    {
      const page = await openApp(browser);
      await page.getByRole("button", { name: "Layers" }).click();
      await page.getByRole("checkbox", { name: /All modeled reservoirs/ }).check();
      await page.waitForFunction(() => window.__resstMapInfo.counts().national > 40_000, undefined, { timeout: 60_000 });
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: /^Screening/ }).click();
      await page.getByRole("button", { name: /^Potential opportunities/ }).click();
      await page.locator(".screen-count").getByText(/of .* modeled reservoirs match/).waitFor();
      await mapSettled(page);
      await shoot(page, "screen");
    }

    console.log("by-huc — a HUC-4 basin selected by click (Selected Data opens by itself)");
    {
      const page = await openApp(browser);
      await jumpTo(page, [-97.2, 38.9], 6);
      await armTool(page, "HUC-4");
      await overlayReady(page, "huc4");
      await clickLngLat(page, -96.6, 39.25); // the Kansas basin
      await page.locator(".details-panel .selected-counts").getByText(/Selected Sites: [1-9]/).waitFor({ timeout: 60_000 });
      await mapSettled(page);
      await shoot(page, "by-huc");
    }

    console.log("by-category — filtered to Sediment Release = Dam Removal");
    {
      const page = await openApp(browser);
      await openData(page);
      await openTable(page);
      const item = page.locator(".filter-item", { has: page.locator('label:text-is("Sediment Release")') });
      await item.locator(".expander").click();
      await item.locator(".value-option", { hasText: "Dam Removal" }).locator("input").check();
      await item.getByRole("switch").check();
      await page.locator(".filtered-counts").getByText("Sites: 8").waitFor();
      await mapSettled(page);
      await shoot(page, "by-category");
    }

    console.log("dashboard — the Dashboard with Dam Removal drilled into its sites");
    {
      // Every load shows the hints: the tiles' stays in the shot, the chart's
      // fades when Dam Removal is clicked.
      const page = await openApp(browser);
      await page.getByRole("button", { name: "Dashboard", exact: true }).click();
      // The national figures fill once the inventory lands: wait for the Capacity lost tile's percentage.
      await page.locator("#dash-tab-capacity .dash-topic-value").getByText(/%$/).waitFor({ timeout: 60_000 });
      await page.getByRole("button", { name: /^Dam Removal/ }).click();
      await page.locator(".dash-table tbody tr").first().waitFor();
      await shoot(page, "dashboard");
    }

    console.log("library — the Library with a publication open");
    {
      const page = await openApp(browser);
      await page.getByRole("button", { name: "Library", exact: true }).click();
      await page.locator(".lib-search input").fill("Tuttle Creek");
      await page.locator(".lib-row .lib-row-btn").first().click();
      await page.locator(".lib-detail-title").waitFor();
      await shoot(page, "library");
    }

    console.log("done.");
  } finally {
    // Always close the browser: an unclosed one keeps this process alive
    // after a failure, and the error above would never reach the console.
    await browser?.close().catch(() => {});
    stopServer(server);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
