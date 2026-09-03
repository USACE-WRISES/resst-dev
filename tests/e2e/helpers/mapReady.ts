// Map readiness and geometry helpers for the e2e suite. The map panel
// (src/map/MapPanel.tsx) exposes window.__resstMap (the Leaflet map) and
// window.__resstMapInfo (counts, flags, and camera helpers in the app's
// lon/lat + 512 px zoom conventions); both are deleted when the panel
// unmounts.
//
// This file is not collected as a spec: the name matches neither Playwright's
// testMatch (*.spec.*) nor vitest's include (tests/**/*.test.ts).
import type { Page } from "@playwright/test";

export interface MapCounts {
  sites: number;
  selected: number;
  labels: number;
  network: number;
  basin: number;
  sketch: number;
  /** 1 while a completed Select highlight (basin / river corridor / polygon) is drawn. */
  highlight: number;
  /** National inventory dots drawn in the last redraw (0 while the layer is off). */
  national: number;
  /** 1 while a national reservoir is selected (its ring is drawn). */
  reservoir: number;
  overlays: Record<string, number>;
}

/** Resolves once the map is mounted, sites are drawn, tiles are in, and the camera is still. */
export const waitForMapIdle = (page: Page, timeout = 30_000) =>
  page.waitForFunction(
    () => {
      const w = window as any;
      const info = w.__resstMapInfo;
      return !!w.__resstMap && !!info && info.counts().sites > 0 && info.tilesLoaded() && !info.isMoving();
    },
    undefined,
    { timeout },
  );

export const mapCounts = (page: Page): Promise<MapCounts> => page.evaluate(() => (window as any).__resstMapInfo.counts());

/** Move the camera without animation; zoom in the app's basis. */
export const jumpTo = (page: Page, lon: number, lat: number, zoom: number) =>
  page.evaluate(([ln, lt, z]) => (window as any).__resstMapInfo.jumpTo(ln, lt, z), [lon, lat, zoom] as const);

/** Viewport pixel of a lon/lat (the map container is the .map-panel div). */
export const screenPt = (page: Page, lon: number, lat: number) =>
  page.evaluate(
    ([ln, lt]) => {
      const w = window as any;
      const p = w.__resstMapInfo.project(ln, lt);
      const r = w.__resstMap.getContainer().getBoundingClientRect();
      return { x: r.left + p.x, y: r.top + p.y };
    },
    [lon, lat] as const,
  );

/** The fly landed: still, and centred within 0.05°. */
export const landed = (page: Page, lon: number, lat: number, timeout = 10_000) =>
  page.waitForFunction(
    ([ln, lt]) => {
      const w = window as any;
      if (!w.__resstMap || w.__resstMapInfo.isMoving()) return false;
      const c = w.__resstMapInfo.getCenter();
      return Math.abs(c.lng - ln) < 0.05 && Math.abs(c.lat - lt) < 0.05;
    },
    [lon, lat] as const,
    { timeout },
  );

/** Selectors axe should skip: tile images, the marker/overlay paths and canvases, and the label tooltips. */
export const MAP_AXE_EXCLUDES = [".leaflet-tile-pane", ".leaflet-pane svg", ".leaflet-pane canvas", ".leaflet-tooltip-pane"];
