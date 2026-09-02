// The MapLibre implementation of the Select tools' map seam. Handlers pass
// through unchanged — MapMouseEvent already satisfies ToolMapEvent — so
// map.off matches them by identity for free. Sketch and highlight keep
// writing the ov-draw / ov-select GeoJSON sources the panel installs.

import type { GeoJSONSource, Map as MlMap } from "maplibre-gl";
import type { ToolMap } from "./toolMap";

export function createMaplibreToolMap(map: MlMap): ToolMap {
  // After map.remove() the style is gone and getSource throws; the tool
  // session's own teardown guard covers that, this just avoids the throw.
  const source = (id: "ov-draw" | "ov-select") =>
    map.style ? (map.getSource(id) as GeoJSONSource | undefined) : undefined;
  return {
    project(lngLat) {
      const p = map.project(lngLat);
      return { x: p.x, y: p.y };
    },
    getZoom: () => map.getZoom(),
    getInteractiveElement: () => map.getCanvas(),
    on(type, h) {
      map.on(type, h);
    },
    off(type, h) {
      map.off(type, h);
    },
    setDragPan(on) {
      if (on) map.dragPan.enable();
      else map.dragPan.disable();
    },
    setBoxZoom(on) {
      if (on) map.boxZoom.enable();
      else map.boxZoom.disable();
    },
    setDoubleClickZoom(on) {
      if (on) map.doubleClickZoom.enable();
      else map.doubleClickZoom.disable();
    },
    setCrosshair(on) {
      map.getCanvas().style.cursor = on ? "crosshair" : "";
    },
    setSketch(features) {
      source("ov-draw")?.setData({ type: "FeatureCollection", features: features ?? [] });
    },
    setHighlight(f) {
      source("ov-select")?.setData({ type: "FeatureCollection", features: f ? [f] : [] });
    },
  };
}
