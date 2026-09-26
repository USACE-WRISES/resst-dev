// Comparable-reservoir finder: it runs when the card opens, leads with the
// documented case studies, and a row opens that reservoir with a Back link to
// where the user came from. Fixture world: only tuttle-creek is documented,
// so its own case-study list shows the honest empty state and the "other
// similar reservoirs" disclosure opens by itself with the other dams.
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { stubEsri } from "./helpers/esriStub";
import { stubSediment } from "./helpers/sedimentFixtures";

async function openComparables(page: Page) {
  await stubEsri(page);
  await stubSediment(page);
  await page.goto("./");
  await page.getByRole("button", { name: "OK" }).click();
  await page.locator(".table-panel input").first().fill("Tuttle");
  await page.locator(".data-table tbody tr", { hasText: "Tuttle Creek" }).first().click();
  await page.locator(".detail-sec-head", { hasText: "Comparable Reservoirs" }).click();
}

test("finds analogs when opened, and Back returns from a click-through", async ({ page }) => {
  await openComparables(page);
  const sim = page.locator("#detail-sec-sim");
  await expect(sim).toContainText("a starting point for relevant case studies");
  await expect(sim.getByRole("button", { name: "Find similar reservoirs" })).toHaveCount(0); // no extra click

  await expect(sim.locator(".card-label").first()).toContainText("Documented case studies");
  await expect(sim).toContainText("No documented RESST site ranks as a close analog."); // self excluded
  // With no documented analog, the other similar reservoirs show without a click.
  await expect(sim.locator(".sim-more")).toHaveAttribute("open", "");
  const rows = sim.locator(".sim-more .sim-card");
  await expect(rows).toHaveCount(2); // Upstream Dam + Lone Reservoir
  await expect(sim).toContainText("relative screening aid"); // the not-hydrologic-equivalence caveat renders

  // Click-through selects the reservoir (mutual exclusivity clears the site)…
  const first = rows.first();
  const name = await first.locator(".sim-name").textContent();
  await first.click();
  const details = page.locator(".details-panel");
  await expect(details.locator(".site-name")).toHaveText(name!);
  await expect(details).toContainText("No documented RESST sediment-management record");
  await expect(details).toContainText("Selected Sites: 0");

  // …and Back restores Tuttle Creek with the Comparables card open again.
  await details.getByRole("button", { name: "Back to Tuttle Creek" }).click();
  await expect(details.locator(".site-name")).toHaveText("Tuttle Creek");
  await expect(details.locator(".detail-sec-head", { hasText: "Comparable Reservoirs" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await expect(details.getByRole("button", { name: /^Back to/ })).toHaveCount(0);
});

test("the Comparables card is axe-clean", async ({ page }) => {
  await openComparables(page);
  await expect(page.locator("#detail-sec-sim .sim-card").first()).toBeVisible();
  const results = await new AxeBuilder({ page })
    .exclude(".leaflet-tile-pane")
    .exclude(".leaflet-pane svg")
    .exclude(".leaflet-pane canvas")
    .exclude(".leaflet-tooltip-pane")
    .analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes.length} nodes`)).toEqual([]);
});
