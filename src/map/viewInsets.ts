// Camera geometry that keeps the map's own chrome out of the way: the
// floating toolbar (top-left, one or two rows) and the docked Screening
// panel (left edge, below the toolbar). Leaflet knows nothing about either —
// they are React overlays, not map controls — so the camera moves that land
// a popup or fit features pass these offsets explicitly. Pure: rectangles in
// map-container pixels in, pixel offsets out (unit-tested in Node).

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Height a popup adds above its anchor beyond its own box: Leaflet's
    `.leaflet-popup { margin-bottom: 20px }` (the tip) plus the 8px offset
    popups.ts opens with. */
export const POPUP_TIP_PX = 28;
/** Breathing room between the popup and whatever it must clear. */
const GAP = 8;
/** Keep the marker (and the popup) at least this far inside the map. */
const EDGE = 12;
/** The top-right zoom + basemap column the popup should not slide under. */
const RIGHT_CONTROLS = 52;

/**
 * Where the selected site should land relative to the map centre so its
 * popup clears the toolbar (and the dock, when it is open): positive dy puts
 * the site lower, positive dx further right. The default is the centre
 * (0, 0), so a popup that already fits never moves the camera.
 *
 * - Vertical: only when the popup's horizontal span overlaps the toolbar's
 *   (or would leave the map's top). The marker stays inside the map; a popup
 *   taller than the room available keeps as much of itself clear as it can.
 * - Horizontal: only when the dock is open and there is room to its right
 *   (before the zoom column) for the whole popup; otherwise it stays centred.
 */
export function popupShift(o: {
  mapW: number;
  mapH: number;
  popupW: number;
  popupH: number;
  toolbar: Rect | null;
  dock: Rect | null;
}): { dx: number; dy: number } {
  const cx = o.mapW / 2;
  const cy = o.mapH / 2;
  let dx = 0;
  const half = o.popupW / 2;
  if (o.dock && cx - half < o.dock.right + GAP) {
    const x = o.dock.right + GAP + half;
    if (x + half <= o.mapW - RIGHT_CONTROLS) dx = x - cx;
  }
  const x = cx + dx;
  let need = EDGE + o.popupH + POPUP_TIP_PX; // stay inside the map's top edge
  if (o.toolbar && x - half < o.toolbar.right && x + half > o.toolbar.left) {
    need = Math.max(need, o.toolbar.bottom + GAP + o.popupH + POPUP_TIP_PX);
  }
  let dy = 0;
  if (need > cy) dy = Math.min(need, o.mapH - EDGE) - cy;
  return { dx: Math.round(dx), dy: Math.max(0, Math.round(dy)) };
}

/**
 * Fit padding (Leaflet `paddingTopLeft` / `paddingBottomRight`) that keeps
 * fitted features out from under the toolbar and the dock. Leaflet falls
 * back to `padding` only when `paddingBottomRight` is missing, so both are
 * returned. Each inset is capped at 40% of the map: on a small map an inset
 * wider than the map would make Leaflet's fit scale negative and zoom in.
 */
export function fitPadding(o: {
  mapW: number;
  mapH: number;
  toolbar: Rect | null;
  dock: Rect | null;
  base?: number;
}): { paddingTopLeft: [number, number]; paddingBottomRight: [number, number] } {
  const base = o.base ?? 60;
  const top = Math.max(base, o.toolbar ? o.toolbar.bottom + 16 : 0);
  const left = Math.max(base, o.dock ? o.dock.right + 16 : 0);
  const capX = (v: number) => Math.round(Math.min(v, o.mapW * 0.4));
  const capY = (v: number) => Math.round(Math.min(v, o.mapH * 0.4));
  return {
    paddingTopLeft: [capX(left), capY(top)],
    paddingBottomRight: [capX(base), capY(base)],
  };
}
