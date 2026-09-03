// Basemap registry for the Leaflet map, plus the MapLibre style the Dam
// Report's snapshot figure draws (src/report/ReportMap.tsx).
//
// "esri" is the default (owner request 2026-08-29, the original EXB look):
// Esri's World Topographic Map, served to the interactive map as raster tiles
// from the public, keyless ArcGIS Online service. "usgs" is the public-domain
// USGS National Map topo (decision D4). Both are plain image-tile layers; a
// swap replaces the tile layer and cannot fail as a whole (tile errors are
// per tile).

import type { StyleSpecification } from "maplibre-gl";
import type { BasemapId } from "../state/store";

export interface BasemapDef {
  id: BasemapId;
  /** Footer credit ("Basemap: <label>") — the full attribution wording. */
  label: string;
  /** Picker wording — the trigger button and the option rows. */
  shortLabel: string;
}

export const BASEMAPS: Record<BasemapId, BasemapDef> = {
  usgs: { id: "usgs", label: "USGS The National Map", shortLabel: "USGS Topo" },
  esri: { id: "esri", label: "Esri World Topographic Map", shortLabel: "Esri Topo" },
};

/** Display order in the picker — the default first (it is also the checked
    radio, so arrow-key traversal starts from it). */
export const BASEMAP_ORDER: readonly BasemapId[] = ["esri", "usgs"];

/** USGS National Map topo raster tiles: one definition for the map and the
    report figure. */
export const USGS_TOPO_TILES =
  "https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}";
export const USGS_TOPO_ATTRIBUTION =
  "USGS The National Map: National Boundaries Dataset, 3DEP Elevation Program, Geographic Names Information System, National Hydrography Dataset, National Land Cover Database, National Structures Dataset, and National Transportation Dataset";

/** Esri's raster World Topographic Map. The attribution is the service's
    copyrightText (…/World_Topo_Map/MapServer?f=json, read 2026-09-02). */
export const ESRI_TOPO_RASTER_TILES =
  "https://services.arcgisonline.com/arcgis/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}";
export const ESRI_TOPO_RASTER_ATTRIBUTION =
  "Sources: Esri, HERE, Garmin, Intermap, increment P Corp., GEBCO, USGS, FAO, NPS, NRCAN, GeoBase, IGN, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), (c) OpenStreetMap contributors, and the GIS User Community";

// ---- MapLibre style (report figure) ----------------------------------------

export function buildUsgsStyle(glyphs?: string): StyleSpecification {
  return {
    version: 8,
    // Self-hosted glyph PBFs (public/fonts) — no third-party font dependency.
    // (The typeof guard keeps the module callable from node-side unit tests.)
    glyphs:
      glyphs ??
      (typeof location === "undefined"
        ? "fonts/{fontstack}/{range}.pbf"
        : `${location.origin}${import.meta.env.BASE_URL}fonts/{fontstack}/{range}.pbf`),
    sources: {
      usgsTopo: {
        type: "raster",
        tiles: [USGS_TOPO_TILES],
        tileSize: 256,
        maxzoom: 16,
        attribution: USGS_TOPO_ATTRIBUTION,
      },
    },
    layers: [
      { id: "background", type: "background", paint: { "background-color": "#e8ede9" } },
      { id: "usgs-topo", type: "raster", source: "usgsTopo" },
    ],
  };
}
