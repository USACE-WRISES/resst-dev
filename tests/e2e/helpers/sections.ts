// Details-panel sections all start collapsed (round-3 owner decision) and
// open one at a time (2026-09-25), so specs open the one they assert on.
// Idempotent: opening an already-open section is a no-op, and the store
// keeps the open section across selections.
import type { Page } from "@playwright/test";

export async function openDetailSection(page: Page, title: string) {
  const head = page.locator(".details-panel .detail-sec-head", { hasText: title });
  if ((await head.getAttribute("aria-expanded")) === "false") await head.click();
}
