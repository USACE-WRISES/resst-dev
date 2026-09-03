// The network-explorer highlight and the NLDI drainage area on the Leaflet
// map, from the same pure buildNetworkFeatures the MapLibre panel and the
// report use. Downstream dots, the mouth node and the schematic connector are
// SVG; the upstream set (tens of thousands of dams for a big mainstem) goes on
// a canvas renderer past 500 points — Leaflet transforms the canvas during a
// gesture and redraws it once at settle, which the 2026-09-02 DOM map trial
// showed is smooth under remote browser isolation.

import type { Feature } from "geojson";
import { L } from "./leaflet";
import { esc } from "../popupHtml";
import { buildNetworkFeatures } from "../networkLayer";
import { NET_DOWN, NET_MOUTH, NET_UP } from "../palette";
import type { NetworkMode } from "../../state/store";
import type { SedimentCore } from "../../sediment/types";
import { lz, mz } from "./zoom";

/** Above this many upstream dams the dots move to a canvas renderer. */
export const CANVAS_DOT_THRESHOLD = 500;
/** Mouth labels appear from MapLibre zoom 4, like the nw-mouth-label layer. */
export const MOUTH_LABEL_ZOOM = lz(4);

/** Dot radius by MapLibre zoom, mirroring the circle-radius interpolations in networkLayer.ts. */
export function dotRadius(kind: "up" | "down", mapZoom: number): number {
  const t = Math.max(0, Math.min(1, (mapZoom - 3) / 6));
  return kind === "up" ? 3 + 3 * t : 4.5 + 3 * t;
}

const BASIN_STYLE: L.PathOptions = {
  color: NET_UP,
  weight: 1.5,
  opacity: 0.8,
  dashArray: "4 2",
  fillColor: NET_UP,
  fillOpacity: 0.07,
  interactive: false,
  pane: "basin",
};

export class NetworkLayers {
  private readonly lines = L.layerGroup();
  private readonly dots = L.layerGroup();
  private readonly mouths = L.layerGroup();
  private readonly basin = L.layerGroup();
  private readonly canvas: L.Canvas;
  private up: L.CircleMarker[] = [];
  private down: L.CircleMarker[] = [];
  private mouthMarkers: { m: L.CircleMarker; name: string }[] = [];
  private mouthLabelsOn = false;
  private basinOn = false;

  constructor(private readonly map: L.Map) {
    this.canvas = L.canvas({ pane: "networkDots" });
    this.lines.addTo(map);
    this.dots.addTo(map);
    this.mouths.addTo(map);
    this.basin.addTo(map);
  }

  /** Features drawn (dots + connector + mouths); 0 when nothing is highlighted. */
  get count(): number {
    return this.up.length + this.down.length + this.mouthMarkers.length + this.lines.getLayers().length;
  }

  /** Feature counts by kind, the shape the e2e suite reads. */
  kinds(): Record<string, number> {
    const out: Record<string, number> = {};
    if (this.up.length) out.up = this.up.length;
    if (this.down.length) out.down = this.down.length;
    if (this.mouthMarkers.length) out.mouth = this.mouthMarkers.length;
    const conn = this.lines.getLayers().length;
    if (conn) out.conn = conn;
    return out;
  }

  get basinCount(): number {
    return this.basinOn ? 1 : 0;
  }

  /** Draw the highlight; returns the coordinates to fit (the dam first). */
  show(core: SedimentCore, row: number, mode: Exclude<NetworkMode, "none">): Array<[number, number]> {
    this.clear();
    const { features, coords } = buildNetworkFeatures(core, row, mode);
    const zoom = mz(this.map.getZoom());
    const upCount = features.filter((f) => f.properties?.kind === "up").length;
    const upRenderer = upCount > CANVAS_DOT_THRESHOLD ? this.canvas : undefined;
    for (const f of features) {
      const kind = f.properties?.kind as string | undefined;
      if (f.geometry.type === "LineString" && kind === "conn") {
        this.lines.addLayer(
          L.polyline(
            f.geometry.coordinates.map(([lon, lat]) => [lat, lon] as [number, number]),
            { color: NET_DOWN, weight: 1.75, opacity: 0.85, dashArray: "2 2", interactive: false, pane: "networkLines" },
          ),
        );
        continue;
      }
      if (f.geometry.type !== "Point") continue;
      const [lon, lat] = f.geometry.coordinates;
      if (kind === "up") {
        const m = L.circleMarker([lat, lon], {
          radius: dotRadius("up", zoom),
          color: "#ffffff",
          weight: 1,
          fillColor: NET_UP,
          fillOpacity: 0.92,
          opacity: 1,
          interactive: false,
          pane: "networkDots",
          ...(upRenderer ? { renderer: upRenderer } : {}),
        });
        this.up.push(m);
        this.dots.addLayer(m);
      } else if (kind === "down") {
        const m = L.circleMarker([lat, lon], {
          radius: dotRadius("down", zoom),
          color: "#ffffff",
          weight: 1.5,
          fillColor: NET_DOWN,
          fillOpacity: 0.92,
          opacity: 1,
          interactive: false,
          pane: "networkDots",
        });
        this.down.push(m);
        this.dots.addLayer(m);
      } else if (kind === "mouth") {
        const name = String(f.properties?.name ?? "");
        const m = L.circleMarker([lat, lon], {
          radius: 7,
          color: "#ffffff",
          weight: 2,
          fillColor: NET_MOUTH,
          fillOpacity: 1,
          opacity: 1,
          interactive: false,
          pane: "networkMouth",
        });
        this.mouthMarkers.push({ m, name });
        this.mouths.addLayer(m);
      }
    }
    this.syncMouthLabels(true);
    return coords;
  }

  clear(): void {
    this.lines.clearLayers();
    this.dots.clearLayers();
    this.mouths.clearLayers();
    this.up = [];
    this.down = [];
    this.mouthMarkers = [];
    this.mouthLabelsOn = false;
  }

  /** Radii follow the zoom like MapLibre's interpolated circle-radius; one pass, one redraw. */
  onZoomEnd(): void {
    const zoom = mz(this.map.getZoom());
    const rUp = dotRadius("up", zoom);
    const rDown = dotRadius("down", zoom);
    for (const m of this.up) m.setRadius(rUp);
    for (const m of this.down) m.setRadius(rDown);
    this.syncMouthLabels(false);
  }

  private syncMouthLabels(force: boolean): void {
    const on = this.map.getZoom() >= MOUTH_LABEL_ZOOM;
    if (!force && on === this.mouthLabelsOn) return;
    this.mouthLabelsOn = on;
    for (const { m, name } of this.mouthMarkers) {
      if (on && name) {
        m.bindTooltip(esc(name), {
          permanent: true,
          direction: "bottom",
          offset: L.point(0, 8),
          className: "network-label",
          opacity: 1,
          interactive: false,
        });
      } else {
        m.unbindTooltip();
      }
    }
  }

  showBasin(feature: Feature): void {
    this.basin.clearLayers();
    this.basin.addLayer(L.geoJSON(feature, { style: () => BASIN_STYLE, interactive: false, pane: "basin" }));
    this.basinOn = true;
  }

  clearBasin(): void {
    this.basin.clearLayers();
    this.basinOn = false;
  }

  remove(): void {
    this.clear();
    this.clearBasin();
    this.lines.remove();
    this.dots.remove();
    this.mouths.remove();
    this.basin.remove();
  }
}
