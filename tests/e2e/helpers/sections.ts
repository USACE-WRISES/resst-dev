// Details-panel sections all start collapsed (round-3 owner decision), so
// specs opt into the ones they assert on. Idempotent: opening an already-open
// section is a no-op, and the store keeps a section open across selections.
import type { Page } from "@playwright/test";

export async function openDetailSection(page: Page, title: string) {
  const head = page.locator(".details-panel .detail-sec-head", { hasText: title });
  if ((await head.getAttribute("aria-expanded")) === "false") await head.click();
}
