// Leaflet panes reproduce the MapLibre layer order: overlays and the basin
// beneath the site circles, network dots above the circles but under the
// selection rings, the mouth node and the polygon sketch on top. Leaflet's own
// panes frame them: tiles 200, overlay 400, markers 600, tooltips 650, popups
// 700. Every custom pane gets its own SVG renderer automatically (Leaflet
// creates one per pane on first use); canvas renderers are created explicitly
// where bulk geometry needs them.

import type { L } from "./leaflet";

export const PANES = {
  overlays: 395,
  basin: 401,
  networkLines: 402,
  /** Completed Select highlight — under the site circles, like ov-select. */
  select: 405,
  sites: 410,
  networkDots: 420,
  sitesSelected: 430,
  networkMouth: 440,
  /** In-progress polygon sketch — above everything, like ov-draw. */
  sketch: 450,
} as const;

export type PaneName = keyof typeof PANES;

export function createPanes(map: L.Map): void {
  for (const [name, z] of Object.entries(PANES)) {
    map.createPane(name);
    const el = map.getPane(name);
    if (el) el.style.zIndex = String(z);
  }
}
