// The documented sites on the Leaflet map: one SVG circle marker per site
// with coordinates, in the same symbology as the MapLibre layer. Leaflet
// centres strokes on the path where MapLibre draws them outside the radius,
// so radius 6 / weight 1 gives the same 5.5–6.5 px band and the same 6.5 px
// outer hit radius the box tool assumes (sitesInScreenBox).

import { L } from "./leaflet";
import type { Site } from "../../lib/types";

export const SITE_STYLE: L.CircleMarkerOptions = {
  radius: 6,
  weight: 1,
  color: "#ffff00",
  fillColor: "#ff0000",
  fillOpacity: 1,
  opacity: 1,
  interactive: true,
  pane: "sites",
};

/** Selection ring: MapLibre r 9 + stroke 2.5 outside → Leaflet r 10.25 centred. */
export const RING_STYLE: L.CircleMarkerOptions = {
  radius: 10.25,
  weight: 2.5,
  color: "#00ffff",
  fillColor: "#00ffff",
  fillOpacity: 0.25,
  opacity: 1,
  interactive: false,
  pane: "sitesSelected",
};

export class SiteMarkers {
  /** Live markers by site_id, in site order (Map insertion order). */
  readonly markers = new Map<string, L.CircleMarker>();
  private readonly group: L.LayerGroup;

  constructor(
    map: L.Map,
    private readonly onClick: (siteId: string) => void,
  ) {
    this.group = L.layerGroup().addTo(map);
  }

  /**
   * Diff by id. The filtered array's identity changes on every selection
   * (derive.ts), but its membership changes only with the filters — and every
   * marker rebuilt is a DOM node re-projected on the next settle.
   */
  sync(sites: readonly Site[]): void {
    const wanted = new Set<string>();
    for (const s of sites) {
      if (s.longitude == null || s.latitude == null) continue;
      wanted.add(s.site_id);
      if (this.markers.has(s.site_id)) continue;
      const m = L.circleMarker([s.latitude, s.longitude], SITE_STYLE);
      m.on("click", () => this.onClick(s.site_id));
      this.group.addLayer(m);
      this.markers.set(s.site_id, m);
    }
    for (const [id, m] of this.markers) {
      if (wanted.has(id)) continue;
      this.group.removeLayer(m);
      this.markers.delete(id);
    }
  }

  remove(): void {
    this.group.remove();
    this.markers.clear();
  }
}
