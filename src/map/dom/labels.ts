// Site-name labels on the Leaflet map: permanent tooltips above the markers
// that are in view once zoomed past MapLibre's label threshold, capped and
// collision-avoided (labelCollision.ts). Refreshed at settle and whenever the
// site set changes; only the tooltips that changed are bound or unbound,
// because each one is a DOM node the remote browser has to mirror.

import { L } from "./leaflet";
import { esc } from "../popupHtml";
import { LABEL_CAP, labelBox, placeLabels } from "./labelCollision";
import { lz } from "./zoom";

/** Leaflet zoom at which labels appear: the app labels sites from MapLibre 6. */
export const LEAFLET_LABEL_ZOOM = lz(6);

export class SiteLabels {
  private readonly labelled = new Map<string, L.CircleMarker>();

  constructor(
    private readonly map: L.Map,
    private readonly markers: () => ReadonlyMap<string, L.CircleMarker>,
    private readonly nameOf: (siteId: string) => string,
  ) {}

  get count(): number {
    return this.labelled.size;
  }

  refresh(): void {
    const map = this.map;
    const wanted = new Map<string, L.CircleMarker>();
    if (map.getZoom() >= LEAFLET_LABEL_ZOOM) {
      const bounds = map.getBounds();
      const candidates: { id: string; m: L.CircleMarker; text: string; p: L.Point }[] = [];
      for (const [id, m] of this.markers()) {
        const ll = m.getLatLng();
        if (!bounds.contains(ll)) continue;
        candidates.push({ id, m, text: this.nameOf(id), p: map.latLngToContainerPoint(ll) });
      }
      for (const c of placeLabels(candidates, (c) => labelBox(c.p, c.text), LABEL_CAP)) wanted.set(c.id, c.m);
    }
    for (const [id, m] of this.labelled) {
      if (wanted.has(id)) continue;
      m.unbindTooltip();
      this.labelled.delete(id);
    }
    for (const [id, m] of wanted) {
      if (this.labelled.has(id)) continue;
      m.bindTooltip(esc(this.nameOf(id)), {
        permanent: true,
        direction: "top",
        offset: L.point(0, -7),
        className: "site-label",
        opacity: 1,
        interactive: false,
      });
      this.labelled.set(id, m);
    }
  }

  clear(): void {
    for (const m of this.labelled.values()) m.unbindTooltip();
    this.labelled.clear();
  }
}
