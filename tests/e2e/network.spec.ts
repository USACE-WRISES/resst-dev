// Network explorer (Phase 3): the Reservoir Network section's stats and
// sentences, the nw-* map highlight driven by the mode buttons, legend rows,
// reset-on-selection-change, and basemap-swap survival. Hermetic via the
// sediment fixtures (network: Upstream Dam(20) → Tuttle Creek Dam(10) →
// Big River mouth(-5); Lone Reservoir(30) isolated).
import { test, expect, type Page } from "@playwright/test";
import { stubEsri, waitForBasemap } from "./helpers/esriStub";
import { stubSediment } from "./helpers/sedimentFixtures";
import { openDetailSection } from "./helpers/sections";

async function openOnTuttle(page: Page) {
  await stubEsri(page);
  await stubSediment(page);
  await page.goto("./");
  await page.getByRole("button", { name: "OK" }).click();
  await page.locator(".table-panel input").first().fill("Tuttle");
  await page.locator(".data-table tbody tr", { hasText: "Tuttle Creek" }).first().click();
  await openDetailSection(page, "Reservoir Network");
}

const sourceKinds = (page: Page) =>
  page.evaluate(async () => {
    const src = (window as any).__resstMap.getSource("nw-net");
    if (!src) return null; // mid-swap or not installed yet — poll again
    const data = await src.getData(); // public API (maplibre ≥4.4)
    const counts: Record<string, number> = {};
    for (const f of data.features) counts[f.properties.kind] = (counts[f.properties.kind] ?? 0) + 1;
    return counts;
  });

test("network section reports stats, sentences, and the terminal chip", async ({ page }) => {
  await openOnTuttle(page);
  const net = page.locator("#detail-sec-net");
  await expect(net.locator(".stat-cell", { hasText: "Upstream dams" })).toContainText("1");
  await expect(net.locator(".stat-cell", { hasText: "Downstream dams" })).toContainText("0");
  await expect(net.locator(".stat-cell", { hasText: "Drains to" })).toContainText("Big River");
  await expect(net.locator(".nw-chips")).toContainText("Terminal dam");
  await expect(net).toContainText("This is the last dam before the river reaches its mouth (Big River).");
  await expect(net).toContainText("1 upstream reservoir influence"); // singular count, plural verb reads fine in context
  // The connectivity bar states the ResNet SCA semantic, not sediment delivery.
  await expect(net.locator(".conn-caption")).toContainText("without first passing another dam");
  await expect(net).toContainText("ResNet v1");
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
  // Legend gains the network rows.
  await page.locator(".map-toolbar button", { hasText: "Legend" }).click();
  await expect(page.locator(".legend-list")).toContainText("River mouth");
  await expect(page.locator(".legend-list")).toContainText("schematic, not the river course");
  await page.keyboard.press("Escape");

  await net.locator(".nw-btn", { hasText: "Upstream" }).click();
  await expect.poll(() => sourceKinds(page)).toEqual({ up: 1 });

  await net.locator(".nw-btn", { hasText: "Full network" }).click();
  await expect.poll(() => sourceKinds(page)).toEqual({ up: 1, mouth: 1, conn: 1 });

  await net.getByRole("button", { name: "Clear" }).click();
  await expect.poll(() => sourceKinds(page)).toEqual({});
});

test("changing the selection resets the highlight", async ({ page }) => {
  await openOnTuttle(page);
  await page.locator("#detail-sec-net .nw-btn", { hasText: "Full network" }).click();
  await expect.poll(() => sourceKinds(page)).toEqual({ up: 1, mouth: 1, conn: 1 });
  await page.locator(".table-panel input").first().fill("Fall Creek");
  await page.locator(".data-table tbody tr", { hasText: "Fall Creek" }).first().click();
  await expect.poll(() => sourceKinds(page)).toEqual({});
  await expect(page.locator("#detail-sec-net")).toHaveCount(0); // non-crosswalked site
});

test("the network highlight survives a basemap swap", async ({ page }) => {
  await openOnTuttle(page);
  await page.locator("#detail-sec-net .nw-btn", { hasText: "Downstream" }).click();
  await expect.poll(() => sourceKinds(page)).toEqual({ mouth: 1, conn: 1 });
  await waitForBasemap(page, true); // settled on the Esri default before swapping
  await page.locator(".basemap-trigger").click();
  await page.getByRole("radio", { name: "USGS Topo" }).check();
  await waitForBasemap(page, false);
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const m = (window as any).__resstMap;
        const src = m.getSource("nw-net");
        if (!m.getLayer("nw-up") || !src) return null; // swap still settling
        const data = await src.getData();
        const counts: Record<string, number> = {};
        for (const f of data.features) counts[f.properties.kind] = (counts[f.properties.kind] ?? 0) + 1;
        return { layer: true, kinds: counts };
      }),
    )
    .toEqual({ layer: true, kinds: { mouth: 1, conn: 1 } });
});
