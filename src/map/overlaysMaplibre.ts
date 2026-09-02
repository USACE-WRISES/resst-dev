// The MapLibre half of the reference overlays: the sources/layers installed
// beneath the sites layers, and the OverlaySink the engine-free runtime in
// overlays.ts writes through.

import type { GeoJSONSource, Map as MlMap } from "maplibre-gl";
import { OVERLAYS, overlayLayerId, overlaySourceId } from "./overlays";
import type { OverlaySink } from "./overlaySink";

/** Add the (empty) sources/layers once, below the sites layers. */
export function installOverlays(map: MlMap): void {
  for (const def of OVERLAYS) {
    const srcId = overlaySourceId(def.key);
    const lid = overlayLayerId(def.key);
    if (def.kind === "wms") {
      map.addSource(srcId, {
        type: "raster",
        tiles: [
          `${def.url}?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=mapunitpoly&STYLES=&FORMAT=image%2Fpng&TRANSPARENT=true&SRS=EPSG%3A3857&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}`,
        ],
        tileSize: 256,
        minzoom: def.minZoom,
        attribution: "USDA NRCS SSURGO",
      });
      map.addLayer(
        { id: lid, type: "raster", source: srcId, layout: { visibility: "none" }, paint: { "raster-opacity": 0.6 } },
        "sites-circles",
      );
      continue;
    }
    map.addSource(srcId, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    if (def.kind === "points") {
      map.addLayer(
        {
          id: lid,
          type: "circle",
          source: srcId,
          minzoom: def.minZoom,
          layout: { visibility: "none" },
          paint: { "circle-radius": 4, "circle-color": def.color, "circle-opacity": 0.85, "circle-stroke-color": "#ffffff", "circle-stroke-width": 0.8 },
        },
        "sites-circles",
      );
    } else {
      // Line layers draw Polygon/MultiPolygon rings as outlines natively, so
      // the polygon snapshots render without a fill layer.
      map.addLayer(
        {
          id: lid,
          type: "line",
          source: srcId,
          layout: { visibility: "none" },
          paint: { "line-color": def.color, "line-width": def.kind === "polygons" ? 1.4 : 1.2, "line-opacity": 0.9 },
        },
        "sites-circles",
      );
    }
  }
}

export function createMaplibreOverlaySink(map: MlMap): OverlaySink {
  return {
    getBounds() {
      const b = map.getBounds();
      return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
    },
    getZoom: () => map.getZoom(),
    isMoving: () => map.isMoving(),
    has: (key) => !!map.getLayer(overlayLayerId(key)),
    setData(key, fc) {
      (map.getSource(overlaySourceId(key)) as GeoJSONSource | undefined)?.setData(fc);
    },
    setVisible(key, on) {
      const lid = overlayLayerId(key);
      if (map.getLayer(lid)) map.setLayoutProperty(lid, "visibility", on ? "visible" : "none");
    },
  };
}
