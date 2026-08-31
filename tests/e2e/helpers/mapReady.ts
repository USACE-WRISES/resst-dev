// One definition of "the map has settled", shared by the specs that read map
// state straight out of MapLibre. Polling a GeoJSON source with getData() is
// an async round-trip to the worker thread; start that while the style and
// tiles are still settling and the round-trips queue behind the worker until
// the assertion's budget expires. Gate on readiness first and the polls become
// deterministic instead of a race.
//
// This file is not collected as a spec: the name matches neither Playwright's
// testMatch (*.spec.*) nor vitest's include (tests/**/*.test.ts).
import type { Page } from "@playwright/test";

/** Resolves once the style is applied, tiles are in, and the camera is still. */
export const waitForMapIdle = (page: Page, timeout = 30_000) =>
  page.waitForFunction(
    () => {
      const m = (window as unknown as { __resstMap?: any }).__resstMap;
      return !!m && m.loaded() && m.isStyleLoaded() && !m.isMoving();
    },
    undefined,
    { timeout },
  );
