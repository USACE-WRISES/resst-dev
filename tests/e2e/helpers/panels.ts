// The Map view opens clean on every visit: the Data Filters, the results table
// and Selected Data all start collapsed (owner decision 2026-09-26). Specs that
// need a panel open it the way a person does, through its edge tab: the
// table's bottom tab, and the left and right side tabs. At 1100px and narrower
// the side panels are drawers, so only the table opens there. Each tab is
// checked first, so calling this twice is harmless.
import { expect, type Page } from "@playwright/test";

export interface Panels {
  table?: boolean;
  filters?: boolean;
  details?: boolean;
}

export async function showPanels(page: Page, which: Panels = { table: true, details: true }): Promise<void> {
  const wide = (page.viewportSize()?.width ?? 1280) > 1100;
  const open = async (tabSelector: string, panelSelector: string) => {
    const tab = page.locator(tabSelector);
    if ((await tab.getAttribute("aria-expanded")) === "false") await tab.click();
    await expect(page.locator(panelSelector)).toBeVisible();
  };
  if (which.table) await open(".table-collapse-tab", ".table-panel");
  if (wide && which.filters) await open(".side-tab-filters", ".filters-panel");
  if (wide && which.details) await open(".side-tab-details", ".details-panel");
}
