// Accessibility scans (axe-core) on the app's primary states, plus a
// full-function mobile smoke (decision D8) and keyboard checks.
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { stubEsri } from "./helpers/esriStub";

const scan = (page: import("@playwright/test").Page) =>
  new AxeBuilder({ page })
    // The WebGL canvas is decorative for axe purposes; MapLibre controls are scanned.
    .exclude(".maplibregl-canvas")
    .analyze();

const serious = (r: Awaited<ReturnType<typeof scan>>) =>
  r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");

test("no serious/critical violations on the main view", async ({ page }) => {
  await stubEsri(page); // the default basemap boots from Esri endpoints — keep CI hermetic
  await page.goto("./");
  await page.getByRole("button", { name: "OK" }).click();
  const results = await scan(page);
  expect(serious(results).map((v) => `${v.id}: ${v.nodes.length} nodes`)).toEqual([]);
});

test("no serious/critical violations with dialogs open", async ({ page }) => {
  await stubEsri(page); // the default basemap boots from Esri endpoints — keep CI hermetic
  await page.goto("./");
  // Welcome dialog open:
  expect(serious(await scan(page)).map((v) => v.id)).toEqual([]);
  await page.getByRole("button", { name: "OK" }).click();
  await page.getByRole("button", { name: "Help" }).click();
  expect(serious(await scan(page)).map((v) => v.id)).toEqual([]);
  // A workflow tab carries the facets/steps markup the About tab lacks.
  await page.locator(".help-pills .pill", { hasText: "By Reservoir" }).click();
  expect(serious(await scan(page)).map((v) => v.id)).toEqual([]);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Download Data" }).click();
  expect(serious(await scan(page)).map((v) => v.id)).toEqual([]);
});

test("welcome dialog traps focus and the skip link works", async ({ page }) => {
  await stubEsri(page); // the default basemap boots from Esri endpoints — keep CI hermetic
  await page.goto("./");
  // Wait until the trap has taken focus (React mounts after load).
  await page.waitForFunction(() => !!document.activeElement?.closest(".dialog"));
  // Tab cycles within the dialog.
  for (let i = 0; i < 6; i++) await page.keyboard.press("Tab");
  const inDialog = await page.evaluate(() => !!document.activeElement?.closest(".dialog"));
  expect(inDialog).toBe(true);
  await page.getByRole("button", { name: "OK" }).click();
  // From the top of the document, the first Tab lands on the skip link.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("Tab");
  await expect(page.locator(".skip-link")).toBeFocused();
});

test("phone layout keeps full function: filters drawer changes counts, details drawer shows selection", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await stubEsri(page); // the default basemap boots from Esri endpoints — keep CI hermetic
  await page.goto("./");
  await page.getByRole("button", { name: "OK" }).click();

  // Open the filters drawer and apply Sediment Release = Dam Removal.
  await page.getByRole("navigation", { name: "Panels" }).getByRole("button", { name: "Filters" }).click();
  const item = page.locator(".filter-item", { has: page.locator('label:text-is("Sediment Release")') });
  await item.locator(".expander").click();
  await item.locator(".value-option", { hasText: "Dam Removal" }).locator("input").check();
  await item.getByRole("switch").check();
  await expect(page.locator(".filtered-counts")).toContainText("Sites: 8");
  await page.keyboard.press("Escape");
  await expect(page.locator(".drawer-scrim")).toHaveCount(0);

  // Select from the table and read the details drawer.
  await page.locator(".data-table tbody tr").first().click();
  await page.getByRole("navigation", { name: "Panels" }).getByRole("button", { name: /Selected/ }).click();
  await expect(page.locator(".details-panel")).toContainText("Selected Sites: 1");
});
