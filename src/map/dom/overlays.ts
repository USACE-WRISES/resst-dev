// The Leaflet OverlaySink: where the engine-free overlay runtime
// (src/map/overlays.ts) puts each reference layer. Snapshot polygons/lines
// and live points share one canvas renderer in the overlays pane (bulk
// geometry, redrawn at settle); SSURGO is a WMS tile layer. Built layers are
// kept when hidden so toggling back does not re-project a 39 MB snapshot.

import type { FeatureCollection } from "geojson";
import { L } from "./leaflet";
import { OVERLAYS, type OverlayDef } from "../overlays";
import type { OverlaySink } from "../overlaySink";
import { lz, mz } from "./zoom";

export class LeafletOverlays implements OverlaySink {
  private readonly canvas: L.Canvas;
  private readonly layers = new Map<string, L.Layer>();
  private readonly featureCounts = new Map<string, number>();
  private readonly visible = new Set<string>();

  constructor(
    private readonly map: L.Map,
    private readonly moving: () => boolean,
  ) {
    this.canvas = L.canvas({ pane: "overlays" });
  }

  getBounds(): [number, number, number, number] {
    const b = this.map.getBounds();
    return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
  }

  getZoom(): number {
    return mz(this.map.getZoom());
  }

  isMoving(): boolean {
    return this.moving();
  }

  has(key: string): boolean {
    return OVERLAYS.some((d) => d.key === key);
  }

  setData(key: string, fc: FeatureCollection): void {
    const def = OVERLAYS.find((d) => d.key === key);
    if (!def || def.kind === "wms") return;
    const old = this.layers.get(key);
    if (old) this.map.removeLayer(old);
    const layer = this.buildGeoJson(def, fc);
    this.layers.set(key, layer);
    this.featureCounts.set(key, fc.features.length);
    if (this.visible.has(key)) layer.addTo(this.map);
  }

  setVisible(key: string, on: boolean): void {
    const def = OVERLAYS.find((d) => d.key === key);
    if (!def) return;
    if (on) this.visible.add(key);
    else this.visible.delete(key);
    let layer = this.layers.get(key);
    if (!layer && on && def.kind === "wms") {
      layer = this.buildWms(def);
      this.layers.set(key, layer);
    }
    if (!layer) return;
    if (on && !this.map.hasLayer(layer)) layer.addTo(this.map);
    if (!on && this.map.hasLayer(layer)) this.map.removeLayer(layer);
  }

  /** Feature counts of the overlays currently shown (e2e). */
  counts(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const key of this.visible) {
      const def = OVERLAYS.find((d) => d.key === key);
      out[key] = def?.kind === "wms" ? 1 : (this.featureCounts.get(key) ?? 0);
    }
    return out;
  }

  remove(): void {
    for (const layer of this.layers.values()) if (this.map.hasLayer(layer)) this.map.removeLayer(layer);
    this.layers.clear();
    this.featureCounts.clear();
    this.visible.clear();
  }

  private buildGeoJson(def: OverlayDef, fc: FeatureCollection): L.Layer {
    if (def.kind === "points") {
      return L.geoJSON(fc, {
        interactive: false,
        pane: "overlays",
        pointToLayer: (_f, latlng) =>
          L.circleMarker(latlng, {
            renderer: this.canvas,
            radius: 4,
            color: "#ffffff",
            weight: 0.8,
            fillColor: def.color,
            fillOpacity: 0.85,
            opacity: 1,
            interactive: false,
            pane: "overlays",
          }),
      });
    }
    const weight = def.kind === "polygons" ? 1.4 : 1.2;
    // The renderer rides on the path options (GeoJSON options have no slot for it).
    const style: L.PathOptions = {
      color: def.color,
      weight,
      opacity: 0.9,
      fill: false,
      interactive: false,
      pane: "overlays",
      renderer: this.canvas,
    };
    return L.geoJSON(fc, { interactive: false, pane: "overlays", style: () => style });
  }

  private buildWms(def: OverlayDef & { kind: "wms" }): L.Layer {
    return L.tileLayer.wms(def.url, {
      layers: "mapunitpoly",
      format: "image/png",
      transparent: true,
      version: "1.1.1",
      opacity: 0.6,
      minZoom: lz(def.minZoom),
      pane: "overlays",
      attribution: "USDA NRCS SSURGO",
    });
  }
}
