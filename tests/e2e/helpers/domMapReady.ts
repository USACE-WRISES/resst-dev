// Readiness and geometry helpers for the Leaflet map panel (src/map/dom),
// mirroring what the WebGL specs do through window.__resstMap. The panel
// exposes window.__resstLeaflet (the L.Map) and window.__resstDom (counts and
// flags); both are deleted when the panel unmounts.
import type { Page } from "@playwright/test";

export interface DomCounts {
  sites: number;
  selected: number;
  labels: number;
  network: number;
  basin: number;
  sketch: number;
  overlays: Record<string, number>;
}

/** Leaflet mounted, every site with coordinates drawn (963 of 978), camera still. */
export const waitForDomMapReady = (page: Page, timeout = 30_000) =>
  page.waitForFunction(
    () => {
      const w = window as any;
      return !!w.__resstLeaflet && !!w.__resstDom && w.__resstDom.counts().sites === 963 && !w.__resstDom.isMoving();
    },
    undefined,
    { timeout },
  );

export const domCounts = (page: Page): Promise<DomCounts> => page.evaluate(() => (window as any).__resstDom.counts());

/** MapLibre-basis zoom, like the WebGL specs' jumpTo; Leaflet = +1, and
    animate:false settles synchronously. */
export const jumpTo = (page: Page, lon: number, lat: number, mapZoom: number) =>
  page.evaluate(
    ([ln, lt, z]) => (window as any).__resstLeaflet.setView([lt, ln], z + 1, { animate: false }),
    [lon, lat, mapZoom] as const,
  );

/** Viewport pixel of a lon/lat (the map container is the .map-panel div). */
export const screenPt = (page: Page, lon: number, lat: number) =>
  page.evaluate(
    ([ln, lt]) => {
      const m = (window as any).__resstLeaflet;
      const p = m.latLngToContainerPoint([lt, ln]);
      const r = m.getContainer().getBoundingClientRect();
      return { x: r.left + p.x, y: r.top + p.y };
    },
    [lon, lat] as const,
  );

/** The fly landed: still, and centred within 0.05° (a seconds/ms slip in a
    Leaflet duration shows up here, not at the 60 s test timeout). */
export const landed = (page: Page, lon: number, lat: number, timeout = 10_000) =>
  page.waitForFunction(
    ([ln, lt]) => {
      const w = window as any;
      if (!w.__resstLeaflet || w.__resstDom.isMoving()) return false;
      const c = w.__resstLeaflet.getCenter();
      return Math.abs(c.lng - ln) < 0.05 && Math.abs(c.lat - lt) < 0.05;
    },
    [lon, lat] as const,
    { timeout },
  );
