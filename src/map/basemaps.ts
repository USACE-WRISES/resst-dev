// Basemap registry for the Leaflet map, plus the MapLibre styles that the
// ?diag=1 benchmark and the Dam Report's snapshot figure still draw.
//
// "esri" is the default (owner request 2026-08-29, the original EXB look):
// Esri's World Topographic Map, served to the interactive map as raster tiles
// from the public, keyless ArcGIS Online service. "usgs" is the public-domain
// USGS National Map topo (decision D4). Both are plain image-tile layers; a
// swap replaces the tile layer and cannot fail as a whole (tile errors are
// per tile).
//
// The vector Esri style (World Topographic Map over World Hillshade, from the
// endpoints the original web map references) needs WebGL and remains here
// only for the diagnostics benchmark, which measures exactly that. MapLibre
// cannot consume the published style verbatim: its source `url` points at an
// ArcGIS VectorTileServer, not TileJSON (rewritten to a tiles template), and
// its sprite URL contains "/../" (normalized through the URL parser).

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

/** USGS National Map topo raster tiles: one definition for the map, the
    diagnostics styles, and the report figure. */
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

// ---- MapLibre styles (diagnostics benchmark, report figure) ----------------

// The style item the original web map's baseMapLayers reference
// (RESST-migration/02-web-map-configuration/resst-web-map-data.json).
export const ESRI_STYLE_URL =
  "https://cdn.arcgis.com/sharing/rest/content/items/27e89eb03c1e4341a1d75e597f0291e6/resources/styles/root.json";
const ESRI_ATTRIBUTION =
  "Powered by Esri | Esri, TomTom, Garmin, FAO, NOAA, USGS, © OpenStreetMap contributors, and the GIS User Community";
const HILLSHADE_TILES =
  "https://services.arcgisonline.com/arcgis/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}";

/** Ids the composed Esri style reserves; colliding CDN layers get renamed. */
const isReservedId = (id: string) => id === "background" || id === "esri-hillshade";

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

/**
 * Make Esri's published style loadable by MapLibre and compose the original
 * app's full basemap: background, hillshade, then the vector layers (whose
 * bottom fills are translucent by design — they expect hillshade beneath).
 * Pure: the input object is not modified.
 */
export function fixupEsriStyle(raw: StyleSpecification): StyleSpecification {
  const sources: StyleSpecification["sources"] = {};
  for (const [id, src] of Object.entries(raw.sources ?? {})) {
    if (src.type === "vector" && src.url && !src.tiles) {
      sources[id] = {
        type: "vector",
        tiles: [`${src.url.replace(/\/+$/, "")}/tile/{z}/{y}/{x}.pbf`],
        maxzoom: 22,
        attribution: ESRI_ATTRIBUTION,
      };
    } else {
      sources[id] = src;
    }
  }
  sources["esri-hillshade"] = {
    type: "raster",
    tiles: [HILLSHADE_TILES],
    tileSize: 256,
    maxzoom: 23,
    attribution: "Esri, Vantor, Airbus DS, USGS, NGA, NASA",
  };
  const style: StyleSpecification = {
    ...raw,
    sources,
    layers: [
      { id: "background", type: "background", paint: { "background-color": "#e8ede9" } },
      { id: "esri-hillshade", type: "raster", source: "esri-hillshade" },
      ...(raw.layers ?? []).map((l) => (isReservedId(l.id) ? { ...l, id: `esri-basemap:${l.id}` } : l)),
    ],
  };
  if (typeof style.sprite === "string") style.sprite = new URL(style.sprite).href; // collapses "/../"
  return style;
}

let esriStylePromise: Promise<StyleSpecification> | null = null;

export function fetchEsriTopoStyle(fetchImpl: typeof fetch = fetch): Promise<StyleSpecification> {
  if (!esriStylePromise) {
    esriStylePromise = (async () => {
      const res = await fetchImpl(ESRI_STYLE_URL);
      if (!res.ok) throw new Error(`Esri style request failed: HTTP ${res.status}`);
      return fixupEsriStyle((await res.json()) as StyleSpecification);
    })().catch((err) => {
      esriStylePromise = null; // a failure must not poison the cache — retry stays possible
      throw err;
    });
  }
  return esriStylePromise;
}
