// Regenerates the Help dialog's workflow screenshots (public/help/*.jpg) by
// driving the BUILT app with Playwright — one staged capture per help tab, so
// the illustrations always show this app's real controls.
//
// Dev-time tool, not CI: it exercises the live Esri basemap endpoints and the
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

/** The map is "photo ready": style + tiles loaded, camera at rest. */
const mapSettled = (page) =>
  page.waitForFunction(
    () => {
      const m = window.__resstMap;
      return !!m && m.loaded() && m.areTilesLoaded() && !m.isMoving() && !!m.getLayer("esri-hillshade");
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

const jumpTo = async (page, center, zoom) => {
  await page.evaluate(([c, z]) => window.__resstMap.jumpTo({ center: c, zoom: z }), [center, zoom]);
  await mapSettled(page);
};

const clickLngLat = async (page, lon, lat, opts = {}) => {
  const p = await page.evaluate(
    ([ln, lt]) => {
      const m = window.__resstMap;
      const pt = m.project([ln, lt]);
      const r = m.getCanvas().getBoundingClientRect();
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

const armTool = async (page, item) => {
  await page.locator(".map-toolbar").getByRole("button", { name: /^Select/ }).click();
  await page.locator(".select-menu").getByRole("button", { name: item }).click();
};

const overlayReady = (page, key) =>
  page.waitForFunction(
    (k) => (window.__resstMap.getSource(`ov-${k}`)?.serialize?.().data?.features?.length ?? 0) > 0,
    key,
    { timeout: 60_000 },
  );

async function main() {
  await mkdir(OUT, { recursive: true });
  const server = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], {
    shell: true,
    stdio: "ignore",
  });
  try {
    await waitForServer();
    const browser = await chromium.launch();

    console.log("about — the app at its start view");
    {
      const page = await openApp(browser);
      await shoot(page, "about");
    }

    console.log("by-reservoir — Tuttle Creek selected with popup and details");
    {
      const page = await openApp(browser);
      await page.locator(".data-table tbody tr", { hasText: "Tuttle Creek" }).first().click();
      await page.locator(".maplibregl-popup").waitFor();
      await mapSettled(page); // the flyTo lands
      await shoot(page, "by-reservoir");
    }

    console.log("by-huc — a HUC-4 basin selected by click");
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

    console.log("by-river — sites within 10 miles of a clicked river");
    {
      const page = await openApp(browser);
      await jumpTo(page, [-94.9, 39.7], 6.5); // the Missouri River bend — sites line its banks
      await armTool(page, /^Near a river/);
      await overlayReady(page, "rivers");
      // Click an actual fetched vertex of the Missouri River itself (fall back
      // to whichever named river is nearest center), so the shot shows a
      // corridor that catches sites.
      const target = await page.evaluate(() => {
        const m = window.__resstMap;
        const data = m.getSource("ov-rivers").serialize().data;
        const c = m.getCenter();
        let best = null;
        let bestD = Infinity;
        for (const f of data.features) {
          const name = String(f.properties?.NameEn ?? "").trim();
          if (!name) continue;
          const preferred = name === "Missouri River";
          for (const part of f.geometry.coordinates) {
            for (const [lon, lat] of part) {
              const d = ((lon - c.lng) ** 2 + (lat - c.lat) ** 2) * (preferred ? 1e-6 : 1);
              if (d < bestD) {
                bestD = d;
                best = [lon, lat];
              }
            }
          }
        }
        return best;
      });
      if (!target) throw new Error("no named river in view — adjust the by-river camera");
      await clickLngLat(page, target[0], target[1]);
      await page.locator(".map-hint-bar").getByText(/\d+ sites? within 10 mi of/).waitFor({ timeout: 60_000 });
      await mapSettled(page);
      await shoot(page, "by-river");
    }

    console.log("by-category — filtered to Sediment Release = Dam Removal");
    {
      const page = await openApp(browser);
      const item = page.locator(".filter-item", { has: page.locator('label:text-is("Sediment Release")') });
      await item.locator(".expander").click();
      await item.locator(".value-option", { hasText: "Dam Removal" }).locator("input").check();
      await item.getByRole("switch").check();
      await page.locator(".filtered-counts").getByText("Sites: 8").waitFor();
      await mapSettled(page);
      await shoot(page, "by-category");
    }

    await browser.close();
    console.log("done.");
  } finally {
    server.kill();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
