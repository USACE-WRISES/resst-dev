// Box-select hit test, shared by both map engines. Mirrors what MapLibre's
// queryRenderedFeatures did for the circle layer (polygonIntersectsBufferedPoint):
// a site is in the box when its marker disc touches it, i.e. the centre lies
// inside or within the marker's outer radius of an edge — disc distance, not
// a box grown by the radius, so the corners behave the same as before.
//
// Pure and engine-free: the caller supplies project(). Reading the filtered
// site array (what the other tools already use) instead of the render tree
// means a site whose marker has not been drawn yet is still selectable.

import type { Site } from "../lib/types";

/** Outer radius of a site marker: circle-radius 5.5 + circle-stroke-width 1.
    MapLibre draws the stroke outside the radius and hit-tests at radius + stroke. */
export const SITE_HIT_RADIUS_PX = 6.5;

export type Project = (lngLat: [number, number]) => { x: number; y: number };

/**
 * Ids of the sites whose marker disc touches the screen box spanned by `a` and
 * `b` (either corner order; CSS px, y down). Retries at lon ± 360 because
 * neither engine wraps project() for a shape drawn on a wrapped world copy.
 */
export function sitesInScreenBox(
  sites: readonly Site[],
  project: Project,
  a: [number, number],
  b: [number, number],
  slackPx = SITE_HIT_RADIUS_PX,
): string[] {
  const minX = Math.min(a[0], b[0]);
  const maxX = Math.max(a[0], b[0]);
  const minY = Math.min(a[1], b[1]);
  const maxY = Math.max(a[1], b[1]);
  const r2 = slackPx * slackPx;
  const hit = (lon: number, lat: number) => {
    const p = project([lon, lat]);
    const dx = Math.max(minX - p.x, 0, p.x - maxX);
    const dy = Math.max(minY - p.y, 0, p.y - maxY);
    return dx * dx + dy * dy <= r2;
  };
  const out: string[] = [];
  for (const s of sites) {
    if (s.longitude == null || s.latitude == null) continue;
    const lon = s.longitude;
    const lat = s.latitude;
    if (hit(lon, lat) || hit(lon + 360, lat) || hit(lon - 360, lat)) out.push(s.site_id);
  }
  return out;
}
