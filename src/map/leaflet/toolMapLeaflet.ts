// The Leaflet implementation of the Select tools' map seam (toolMap.ts).
//
// Two Leaflet habits are undone here on purpose. Leaflet substitutes a circle
// marker's centre for the pointer position when the marker is the event
// target (any radius ≤ 10), so lngLat comes from the raw mouse event instead
// of e.latlng — a polygon vertex clicked over a site must land where the
// user clicked. And Leaflet matches handlers by identity on off(), so the
// wrappers are remembered per (handler, type).

import type { Feature, FeatureCollection } from "geojson";
import { L } from "./leaflet";
import { SELECT } from "../palette";
import type { ToolMap, ToolMapEvent, ToolMapEventType, ToolMapHandler } from "../toolMap";
import { mz } from "./zoom";

const SKETCH_LINE: L.PathOptions = { color: SELECT, weight: 2, dashArray: "2 1.5", fill: false, interactive: false, pane: "sketch" };
const SKETCH_FILL: L.PathOptions = { stroke: false, fillColor: SELECT, fillOpacity: 0.12, interactive: false, pane: "sketch" };
const SKETCH_VERTEX: L.CircleMarkerOptions = {
  radius: 4,
  color: SELECT,
  weight: 2,
  fillColor: "#ffffff",
  fillOpacity: 1,
  interactive: false,
  pane: "sketch",
};
const HIGHLIGHT_LINE: L.PathOptions = { color: SELECT, weight: 2.5, opacity: 0.9, fill: false, interactive: false, pane: "select" };
const HIGHLIGHT_POLYGON: L.PathOptions = {
  color: SELECT,
  weight: 2.5,
  opacity: 0.9,
  fillColor: SELECT,
  fillOpacity: 0.08,
  interactive: false,
  pane: "select",
};

export interface ToolLayers {
  /** The completed highlight (ov-select). */
  select: L.LayerGroup;
  /** The in-progress sketch (ov-draw). */
  sketch: L.LayerGroup;
}

export function createLeafletToolMap(map: L.Map, layers: ToolLayers): ToolMap {
  const wrapped = new Map<ToolMapHandler, Partial<Record<ToolMapEventType, L.LeafletMouseEventHandlerFn>>>();
  const toEvent = (e: L.LeafletMouseEvent): ToolMapEvent => {
    const ll = map.mouseEventToLatLng(e.originalEvent);
    return {
      lngLat: { lng: ll.lng, lat: ll.lat },
      originalEvent: e.originalEvent,
      preventDefault: () => L.DomEvent.preventDefault(e.originalEvent),
    };
  };
  return {
    project([lng, lat]) {
      const p = map.latLngToContainerPoint([lat, lng]);
      return { x: p.x, y: p.y };
    },
    getZoom: () => mz(map.getZoom()),
    getInteractiveElement: () => map.getContainer(),
    on(type, h) {
      const slots = wrapped.get(h) ?? {};
      if (slots[type]) return;
      const fn: L.LeafletMouseEventHandlerFn = (e) => h(toEvent(e));
      slots[type] = fn;
      wrapped.set(h, slots);
      map.on(type, fn);
    },
    off(type, h) {
      const slots = wrapped.get(h);
      const fn = slots?.[type];
      if (!slots || !fn) return;
      map.off(type, fn);
      delete slots[type];
    },
    setDragPan(on) {
      if (on) map.dragging.enable();
      else map.dragging.disable();
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
      // Leaflet's own rule beats the marker paths' pointer cursor; an inline
      // style on the container would not.
      map.getContainer().classList.toggle("leaflet-crosshair", on);
    },
    setSketch(features) {
      layers.sketch.clearLayers();
      if (!features?.length) return;
      const fc: FeatureCollection = { type: "FeatureCollection", features };
      layers.sketch.addLayer(
        L.geoJSON(
          fc,
          {
            style: (f) => (f?.geometry.type === "Polygon" ? SKETCH_FILL : SKETCH_LINE),
            pointToLayer: (_f, latlng) => L.circleMarker(latlng, SKETCH_VERTEX),
            interactive: false,
            pane: "sketch",
          },
        ),
      );
    },
    setHighlight(f: Feature | null) {
      layers.select.clearLayers();
      if (!f) return;
      layers.select.addLayer(
        L.geoJSON(f, {
          style: (g) => (g?.geometry.type === "Polygon" || g?.geometry.type === "MultiPolygon" ? HIGHLIGHT_POLYGON : HIGHLIGHT_LINE),
          interactive: false,
          pane: "select",
        }),
      );
    },
  };
}
