// Basemaps for the Leaflet map: image tiles only. USGS is the same tile
// service the MapLibre style uses; the Esri vector style needs WebGL, so its
// raster sibling (World Topographic Map) stands in for it here.

import { L } from "./leaflet";
import type { BasemapId } from "../../state/store";
import { ESRI_TOPO_RASTER_ATTRIBUTION, ESRI_TOPO_RASTER_TILES, USGS_TOPO_ATTRIBUTION, USGS_TOPO_TILES } from "../basemaps";
import { lz } from "./zoom";

/** The tile template each basemap draws from (also what the e2e reads back). */
export const BASEMAP_TILES: Record<BasemapId, string> = {
  usgs: USGS_TOPO_TILES,
  esri: ESRI_TOPO_RASTER_TILES,
};

export function createBasemapLayer(id: BasemapId): L.TileLayer {
  return id === "usgs"
    ? L.tileLayer(USGS_TOPO_TILES, { maxNativeZoom: 16, maxZoom: lz(17), attribution: USGS_TOPO_ATTRIBUTION })
    : L.tileLayer(ESRI_TOPO_RASTER_TILES, { maxNativeZoom: 19, maxZoom: lz(17), attribution: ESRI_TOPO_RASTER_ATTRIBUTION });
}
