// Basemap registry and the machinery to swap between them at runtime.
//
// "esri" is the default (owner request 2026-08-29, restoring the original EXB
// look): the World Topographic Map vector-tile style over World Hillshade,
// from the exact public, keyless endpoints the original web map references
// (verified anonymous + CORS-open; Esri's sanctioned route for custom apps is
// an API key, so if these endpoints are ever gated the swap fails with a
// retryable error and the app auto-reverts — un-persisted — to "usgs").
// "usgs" is the public-domain fallback and the boot style (decision D4), so
// an offline start still renders a map.
//
// MapLibre cannot consume Esri's published style verbatim:
//   1. its source `url` points at an ArcGIS VectorTileServer, not TileJSON —
//      rewritten to an explicit tiles template;
//   2. its sprite URL contains "/../" — normalized through the URL parser.
// The swap itself is map.setStyle(next, {transformStyle: mergeAppLayers}),
// which carries every app-owned source and layer (sites*, ov-*) across
// styles. GeoJSON sources serialize with their CURRENT data, so loaded
// overlays survive without refetching and the overlay runtime's readyKey
// memos stay truthful.

import type { Map as MlMap, StyleSpecification } from "maplibre-gl";
import { actions, getState, type BasemapId } from "../state/store";

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

// The style item the original web map's baseMapLayers reference
// (RESST-migration/02-web-map-configuration/resst-web-map-data.json).
export const ESRI_STYLE_URL =
  "https://cdn.arcgis.com/sharing/rest/content/items/27e89eb03c1e4341a1d75e597f0291e6/resources/styles/root.json";
const ESRI_ATTRIBUTION =
  "Powered by Esri — Esri, TomTom, Garmin, FAO, NOAA, USGS, © OpenStreetMap contributors, and the GIS User Community";
const HILLSHADE_TILES =
  "https://services.arcgisonline.com/arcgis/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}";

/** Sources the app owns and must carry across basemap swaps (sites, ov-*
    overlays/select scratch, nw-* network highlight, nat-* national layer). */
const isAppSource = (id: string) => id === "sites" || id.startsWith("ov-") || id.startsWith("nw-") || id.startsWith("nat-");
/** Layers the app owns (sites-*, every overlay, network + national layers). */
const isAppLayer = (id: string) =>
  id.startsWith("sites-") || id.startsWith("ov-") || id.startsWith("nw-") || id.startsWith("nat-");
/** Ids the composed Esri style reserves; colliding CDN layers get renamed. */
const isReservedId = (id: string) => id === "background" || id === "esri-hillshade" || isAppLayer(id);

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
        tiles: ["https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}"],
        tileSize: 256,
        maxzoom: 16,
        attribution:
          "USGS The National Map: National Boundaries Dataset, 3DEP Elevation Program, Geographic Names Information System, National Hydrography Dataset, National Land Cover Database, National Structures Dataset, and National Transportation Dataset",
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
      // Same id/paint as the USGS style's backdrop, so the swap diffs it as unchanged.
      { id: "background", type: "background", paint: { "background-color": "#e8ede9" } },
      { id: "esri-hillshade", type: "raster", source: "esri-hillshade" },
      // The rename must escape the app-layer prefixes too, or the renamed
      // CDN layer would be carried across swaps as if the app owned it.
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

/**
 * The TransformStyleFunction for setStyle: keep the next style's basemap,
 * glyphs, and sprite, and re-attach the app-owned sources and layers from
 * the previous style (appended last, preserving their relative order, so
 * overlays stay under the sites layers and everything sits above basemap
 * labels). Must stay pure — a failed style diff re-applies it.
 */
export function mergeAppLayers(
  prev: StyleSpecification | undefined,
  next: StyleSpecification,
): StyleSpecification {
  if (!prev) return next;
  const sources = { ...next.sources };
  for (const [id, src] of Object.entries(prev.sources ?? {})) {
    if (isAppSource(id)) sources[id] = src;
  }
  return {
    ...next,
    sources,
    layers: [...(next.layers ?? []), ...(prev.layers ?? []).filter((l) => isAppLayer(l.id))],
  };
}

/**
 * Swap the map to the requested basemap. The USGS path is synchronous and
 * cannot fail; the Esri path downloads the style once (cached) and reports
 * loading/error through the store for the picker. On failure the map never
 * left USGS, so the app reverts there WITHOUT persisting and forgets the
 * stored choice — the next visit retries the default.
 */
export async function applyBasemap(
  map: Pick<MlMap, "setStyle">,
  id: BasemapId,
  fetchImpl?: typeof fetch,
): Promise<void> {
  if (id === "usgs") {
    map.setStyle(buildUsgsStyle(), { transformStyle: mergeAppLayers });
    return;
  }
  actions.setBasemapStatus("loading");
  try {
    // Cloned so MapLibre can never mutate the cached style between toggles.
    const style = structuredClone(await fetchEsriTopoStyle(fetchImpl));
    if (getState().basemap !== "esri") {
      actions.setBasemapStatus(null); // superseded while downloading — not an error
      return;
    }
    map.setStyle(style, { transformStyle: mergeAppLayers });
    actions.setBasemapStatus(null);
  } catch (err) {
    console.warn("Esri basemap failed to load.", err);
    if (getState().basemap === "esri") {
      actions.setBasemapStatus("error");
      // "usgs" as the FALLBACK, not "the default" — it is the basemap that
      // still works when Esri endpoints are unreachable.
      actions.revertBasemap("usgs");
    } else {
      actions.setBasemapStatus(null);
    }
  }
}
