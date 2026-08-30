// Comparable-reservoir finder (Phase 6): on-demand computation, the
// documented-first framing, and click-through into the normal selection flow.
// Fixture world: only tuttle-creek is documented, so its own analogs list
// shows the honest empty state and the overall list carries the other dams.
import { test, expect, type Page } from "@playwright/test";
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

test("finds analogs on demand and routes clicks into the selection flow", async ({ page }) => {
  await openComparables(page);
  const sim = page.locator("#detail-sec-sim");
  await expect(sim).toContainText("documented RESST sites first");
  await sim.getByRole("button", { name: "Find similar reservoirs" }).click();

  await expect(sim.locator(".sim-group").first()).toContainText("Documented analogs");
  await expect(sim).toContainText("No documented RESST site ranks as a close analog."); // self excluded
  const rows = sim.locator(".sim-list .sim-row");
  await expect(rows).toHaveCount(2); // Upstream Dam + Lone Reservoir
  await expect(sim).toContainText("relative index"); // the not-hydrologic-equivalence caveat renders

  // Click-through selects the reservoir (mutual exclusivity clears the site).
  const first = rows.first();
  const name = await first.locator("b").textContent();
  await first.click();
  const details = page.locator(".details-panel");
  await expect(details).toContainText(name!);
  await expect(details).toContainText("no documented RESST sediment-management record");
  await expect(details).toContainText("Selected Sites: 0");
});
