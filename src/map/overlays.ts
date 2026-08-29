// Reference overlays (decision D6): streamed on demand from the same public
// services the original app used, all off by default. Boundary/line overlays
// use quantized ArcGIS queries (see esriQuantized.ts — full-resolution
// f=geojson measured 52 MB / 80+ s for HUC2 across CONUS; quantized is
// ~200 KB) with pagination; points stay plain geojson; SSURGO renders as a
// WMS raster. Every fetch is abortable, retries stay possible after failures
// (the success memo is written only after data lands), and per-layer status
// flows to the Layers panel through the app store.

import type { Map as MlMap } from "maplibre-gl";
import type { GeoJSONSource } from "maplibre-gl";
import { actions } from "../state/store";
import { fetchGeojsonPoints, fetchQuantizedMultiLine } from "./esriQuantized";

export interface OverlayDef {
  key: string;
  label: string;
  kind: "points" | "lines" | "polygons" | "wms";
  url: string;
  /** Below this zoom the overlay is neither fetched nor drawn. */
  minZoom: number;
  color: string;
  outFields?: string;
}

// Quantized payloads scale with screen pixels, not extent, so the boundary
// layers can load from z2 up — every Views card (they all share the CONUS
// bounds, which fit at ~z2.7 on a phone) loads its own layer. The point
// layers keep a gate for feature volume; SSURGO only has data ~z12+.
export const OVERLAYS: OverlayDef[] = [
  {
    key: "nid",
    label: "National Inventory of Dams",
    kind: "points",
    url: "https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/NID_v1/FeatureServer/0",
    minZoom: 6,
    color: "#333333",
    outFields: "NAME,NIDID",
  },
  {
    key: "gauges",
    label: "Live Stream Gauges",
    kind: "points",
    url: "https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/Live_Stream_Gauges_v1/FeatureServer/0",
    minZoom: 6,
    color: "#1f78b4",
    outFields: "*",
  },
  {
    key: "huc2",
    label: "USGS HUC 2 boundaries",
    kind: "polygons",
    url: "https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/Watershed_Boundary_Dataset_HUC_2s/FeatureServer/0",
    minZoom: 2,
    color: "#6a3d9a",
    outFields: "huc2,name",
  },
  {
    key: "huc4",
    label: "USGS HUC 4 boundaries",
    kind: "polygons",
    url: "https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/Watershed_Boundary_Dataset_HUC_4s/FeatureServer/0",
    minZoom: 2,
    color: "#8e44ad",
    outFields: "huc4,name",
  },
  {
    key: "huc6",
    label: "USGS HUC 6 boundaries",
    kind: "polygons",
    url: "https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/Watershed_Boundary_Dataset_HUC_6s/FeatureServer/0",
    minZoom: 2,
    color: "#9b59b6",
    outFields: "huc6,name",
  },
  {
    key: "huc8",
    label: "USGS HUC 8 boundaries",
    kind: "polygons",
    url: "https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/Watershed_Boundary_Dataset_HUC_8s/FeatureServer/0",
    minZoom: 2,
    color: "#b07cc6",
    outFields: "huc8,name",
  },
  {
    key: "rivers",
    label: "North America Rivers",
    kind: "lines",
    url: "https://services7.arcgis.com/oF9CDB4lUYF7Um9q/arcgis/rest/services/North_America_Lakes_and_Rivers/FeatureServer/0",
    minZoom: 2,
    color: "#2980d9",
    // The layer's name field is NameEn ("NAME" does not exist and the service
    // 400s on it — the old silent pipeline swallowed exactly this error).
    outFields: "NameEn",
  },
  {
    key: "ssurgo",
    label: "SSURGO Soils (USDA)",
    kind: "wms",
    url: "https://SDMDataAccess.sc.egov.usda.gov/Spatial/SDM.wms",
    minZoom: 12,
    color: "#c8a24b",
  },
];

const srcId = (key: string) => `ov-${key}`;
const layerId = (key: string) => `ov-${key}-layer`;

/** Add the (empty) sources/layers once, below the sites layers. */
export function installOverlays(map: MlMap): void {
  for (const def of OVERLAYS) {
    if (def.kind === "wms") {
      map.addSource(srcId(def.key), {
        type: "raster",
        tiles: [
          `${def.url}?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=mapunitpoly&STYLES=&FORMAT=image%2Fpng&TRANSPARENT=true&SRS=EPSG%3A3857&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}`,
        ],
        tileSize: 256,
        minzoom: def.minZoom,
        attribution: "USDA NRCS SSURGO",
      });
      map.addLayer(
        { id: layerId(def.key), type: "raster", source: srcId(def.key), layout: { visibility: "none" }, paint: { "raster-opacity": 0.6 } },
        "sites-circles",
      );
      continue;
    }
    map.addSource(srcId(def.key), { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    if (def.kind === "points") {
      map.addLayer(
        {
          id: layerId(def.key),
          type: "circle",
          source: srcId(def.key),
          minzoom: def.minZoom,
          layout: { visibility: "none" },
          paint: { "circle-radius": 4, "circle-color": def.color, "circle-opacity": 0.85, "circle-stroke-color": "#ffffff", "circle-stroke-width": 0.8 },
        },
        "sites-circles",
      );
    } else {
      map.addLayer(
        {
          id: layerId(def.key),
          type: "line",
          source: srcId(def.key),
          minzoom: def.minZoom,
          layout: { visibility: "none" },
          paint: { "line-color": def.color, "line-width": def.kind === "polygons" ? 1.4 : 1.2, "line-opacity": 0.9 },
        },
        "sites-circles",
      );
    }
  }
}

interface Runtime {
  controller: AbortController | null;
  /** Viewport key of the last SUCCESSFUL load — written in exactly one place. */
  readyKey: string | null;
}

const runtime = new Map<string, Runtime>();
const getRuntime = (key: string): Runtime => {
  let r = runtime.get(key);
  if (!r) {
    r = { controller: null, readyKey: null };
    runtime.set(key, r);
  }
  return r;
};

async function fetchOverlay(map: MlMap, def: OverlayDef): Promise<void> {
  const r = getRuntime(def.key);
  const b = map.getBounds();
  const zoom = map.getZoom();
  const viewKey = `${[b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].map((v) => v.toFixed(3)).join(",")}@z${zoom.toFixed(1)}`;
  if (r.readyKey === viewKey) return;
  r.controller?.abort(); // supersede any in-flight request
  const controller = new AbortController();
  r.controller = controller;
  actions.setOverlayStatus(def.key, "loading");
  try {
    const bounds = { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() };
    const fc =
      def.kind === "points"
        ? await fetchGeojsonPoints(def.url, def.outFields ?? "*", bounds, controller.signal)
        : await fetchQuantizedMultiLine(def.url, def.outFields ?? "*", bounds, zoom, controller.signal);
    if (controller.signal.aborted) return;
    (map.getSource(srcId(def.key)) as GeoJSONSource | undefined)?.setData(fc);
    r.readyKey = viewKey;
    actions.setOverlayStatus(def.key, "ready");
  } catch (err) {
    if ((err as Error).name === "AbortError") return; // superseded or toggled off — not an error
    console.warn(`Overlay ${def.key} failed to load.`, err);
    actions.setOverlayStatus(def.key, "error"); // readyKey stays null → full retry available
  } finally {
    if (r.controller === controller) r.controller = null;
  }
}

/** Sync layer visibility and (re)fetch visible feature overlays for the
 * viewport. Old data stays on the map through loading/error states. */
export function updateOverlays(map: MlMap, visible: Record<string, boolean>): void {
  // Same rounding as the panel's zoomTick, so the "zoom in to load" hint and
  // the fetch gate agree at the boundary.
  const zoom = Math.round(map.getZoom() * 10) / 10;
  for (const def of OVERLAYS) {
    const lid = layerId(def.key);
    if (!map.getLayer(lid)) continue;
    const on = !!visible[def.key];
    map.setLayoutProperty(lid, "visibility", on ? "visible" : "none");
    if (!on) {
      const r = runtime.get(def.key);
      r?.controller?.abort();
      if (r) {
        r.controller = null;
        r.readyKey = null;
      }
      actions.setOverlayStatus(def.key, null);
      continue;
    }
    if (def.kind === "wms") {
      actions.setOverlayStatus(def.key, null); // raster tiles manage themselves
      continue;
    }
    if (zoom < def.minZoom) {
      runtime.get(def.key)?.controller?.abort();
      actions.setOverlayStatus(def.key, null); // the panel derives "zoom in to load"
      continue;
    }
    // During a camera animation the extent is still changing; the moveend
    // refresh covers it (this also skips the Views-card wrong-extent fetch).
    if (!map.isMoving()) void fetchOverlay(map, def);
  }
}

let refreshTimer: ReturnType<typeof setTimeout> | null = null;

/** Debounced refetch for moveend. Takes a getter so a toggle during the
 * window can't resurrect stale visibility. */
export function scheduleOverlayRefresh(map: MlMap, getVisible: () => Record<string, boolean>, delay = 250): void {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    updateOverlays(map, getVisible());
  }, delay);
}

/** MapPanel unmount: cancel the timer and abort everything in flight. */
export function disposeOverlays(): void {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
  for (const r of runtime.values()) {
    r.controller?.abort();
    r.controller = null;
    r.readyKey = null;
  }
  runtime.clear();
}

/** Layers-panel Retry: forget the success memo and fetch again. */
export function retryOverlay(map: MlMap, key: string, visible: Record<string, boolean>): void {
  const def = OVERLAYS.find((d) => d.key === key);
  if (!def || !visible[key] || def.kind === "wms") return;
  const r = runtime.get(key);
  if (r) r.readyKey = null;
  if (Math.round(map.getZoom() * 10) / 10 >= def.minZoom) void fetchOverlay(map, def);
}
