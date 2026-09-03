// Reference overlays (decision D6). Two pipelines:
//
// - STATIC snapshots (HUC 2/4/6/8 boundaries, North America rivers): served
//   from public/overlays/*.json (built by scripts/build-overlays.mjs — USGS
//   WBD public domain + CEC rivers CC BY 4.0), fetched ONCE per session on
//   first toggle-on and retained. No viewport keying, no moveend refetch, and
//   the resident FeatureCollection powers the Select tools' local HUC/river
//   lookups (localQueries.ts). The old per-viewport quantized ArcGIS
//   streaming took 10-30 s per first load because the Living Atlas servers
//   simplify per request.
// - LIVE services (NID dams, stream gauges as paged GeoJSON points; SSURGO
//   as a WMS raster): the dynamic data keeps streaming on demand.
//
// Every fetch is abortable, retries stay possible after failures, and
// per-layer status flows to the Layers panel through the app store. Memory
// note: resident snapshots total ~150-250 MB heap if a user turns on all
// five — realistic sessions use one or two. If that ever matters, the levers
// are setData(empty) on toggle-off (keep the JS FC, free the worker tiles)
// or a small LRU; deliberately not built now.
//
// This module never touches the map directly: it writes through an
// OverlaySink (overlaySink.ts), implemented by leaflet/overlays.ts.

import type { FeatureCollection } from "geojson";
import { actions } from "../state/store";
import { fetchGeojsonPoints } from "./esriPoints";
import { buildHucIndex, type HucEntry } from "./localQueries";
import type { OverlaySink } from "./overlaySink";

interface OverlayBase {
  key: string;
  label: string;
  /** Below this zoom the overlay is neither fetched nor drawn (live kinds;
      static snapshots are viewport-independent and use 0). */
  minZoom: number;
  color: string;
}

export type OverlayDef =
  | (OverlayBase & { kind: "points"; url: string; outFields: string })
  | (OverlayBase & { kind: "wms"; url: string })
  // Snapshot files, fetched in parallel and concatenated — huc8 ships as two
  // halves to stay under GitHub's 50 MB per-file warning.
  | (OverlayBase & { kind: "lines" | "polygons"; staticPaths: string[] });

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
  { key: "huc2", label: "USGS HUC 2 boundaries", kind: "polygons", staticPaths: ["overlays/huc2.json"], minZoom: 0, color: "#6a3d9a" },
  { key: "huc4", label: "USGS HUC 4 boundaries", kind: "polygons", staticPaths: ["overlays/huc4.json"], minZoom: 0, color: "#8e44ad" },
  { key: "huc6", label: "USGS HUC 6 boundaries", kind: "polygons", staticPaths: ["overlays/huc6.json"], minZoom: 0, color: "#9b59b6" },
  {
    key: "huc8",
    label: "USGS HUC 8 boundaries",
    kind: "polygons",
    staticPaths: ["overlays/huc8-a.json", "overlays/huc8-b.json"],
    minZoom: 0,
    color: "#b07cc6",
  },
  { key: "rivers", label: "North America Rivers", kind: "lines", staticPaths: ["overlays/rivers.json"], minZoom: 0, color: "#2980d9" },
  {
    key: "ssurgo",
    label: "SSURGO Soils (USDA)",
    kind: "wms",
    url: "https://SDMDataAccess.sc.egov.usda.gov/Spatial/SDM.wms",
    minZoom: 12,
    color: "#c8a24b",
  },
];

// ------------------------------------------------- live points runtime ------

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

async function fetchOverlay(sink: OverlaySink, def: OverlayDef & { kind: "points" }): Promise<void> {
  const r = getRuntime(def.key);
  const [west, south, east, north] = sink.getBounds();
  const zoom = sink.getZoom();
  const viewKey = `${[west, south, east, north].map((v) => v.toFixed(3)).join(",")}@z${zoom.toFixed(1)}`;
  if (r.readyKey === viewKey) return;
  r.controller?.abort(); // supersede any in-flight request
  const controller = new AbortController();
  r.controller = controller;
  actions.setOverlayStatus(def.key, "loading");
  try {
    const fc = await fetchGeojsonPoints(def.url, def.outFields, { west, south, east, north }, controller.signal);
    if (controller.signal.aborted) return;
    sink.setData(def.key, fc);
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

// --------------------------------------------- static snapshot runtime ------

interface StaticRuntime {
  controller: AbortController | null;
  /** The parsed snapshot — session cache, retained across toggles/remounts. */
  fc: FeatureCollection | null;
  /** Containment index, memoized on first Select-tool use (localQueries). */
  hucIndex: HucEntry[] | null;
  /** Whether the CURRENT map instance holds fc. */
  applied: boolean;
}

const staticRuntime = new Map<string, StaticRuntime>();
const getStaticRuntime = (key: string): StaticRuntime => {
  let r = staticRuntime.get(key);
  if (!r) {
    r = { controller: null, fc: null, hucIndex: null, applied: false };
    staticRuntime.set(key, r);
  }
  return r;
};

/** The resident snapshot, if loaded (Select tools read river courses here). */
export const getStaticOverlayFC = (key: string): FeatureCollection | null => staticRuntime.get(key)?.fc ?? null;

/** Containment index for a loaded HUC snapshot — built once per session.
 * The overlay key doubles as the huc property name, as everywhere else. */
export function getHucIndex(key: string): HucEntry[] | null {
  const r = staticRuntime.get(key);
  if (!r?.fc) return null;
  if (!r.hucIndex) r.hucIndex = buildHucIndex(r.fc, key);
  return r.hucIndex;
}

async function ensureStaticOverlay(sink: OverlaySink, def: OverlayDef & { staticPaths: string[] }): Promise<void> {
  const r = getStaticRuntime(def.key);
  if (r.fc) {
    // Cached: re-apply if this map instance hasn't seen it (remount, or a
    // basemap swap edge where the source was momentarily unavailable).
    if (!r.applied && sink.has(def.key)) {
      sink.setData(def.key, r.fc);
      r.applied = true;
    }
    actions.setOverlayStatus(def.key, "ready");
    return;
  }
  if (r.controller) return; // single-flight — toggle churn and moveend are no-ops
  const controller = new AbortController();
  r.controller = controller;
  actions.setOverlayStatus(def.key, "loading");
  try {
    // Parts download in parallel and concatenate (a layer is usually one
    // file; huc8 is two halves). The once-per-session parse happens here.
    const parts = await Promise.all(
      def.staticPaths.map(async (path) => {
        const res = await fetch(`${import.meta.env.BASE_URL}${path}`, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as FeatureCollection;
      }),
    );
    if (controller.signal.aborted) return; // toggled off mid-download
    const fc: FeatureCollection =
      parts.length === 1 ? parts[0] : { type: "FeatureCollection", features: parts.flatMap((p) => p.features) };
    r.fc = fc;
    if (sink.has(def.key)) {
      sink.setData(def.key, fc);
      r.applied = true;
    }
    actions.setOverlayStatus(def.key, "ready");
  } catch (err) {
    if ((err as Error).name === "AbortError") return;
    console.warn(`Overlay ${def.key} failed to load.`, err);
    actions.setOverlayStatus(def.key, "error"); // fc stays null → Retry refetches
  } finally {
    if (r.controller === controller) r.controller = null;
  }
}

// -------------------------------------------------------------- driver ------

/** Sync layer visibility and load what's now on. Old data stays on the map
 * through loading/error states. */
export function updateOverlays(sink: OverlaySink, visible: Record<string, boolean>): void {
  // Same rounding as the panel's zoomTick, so the "zoom in to load" hint and
  // the fetch gate agree at the boundary (live layers only).
  const zoom = Math.round(sink.getZoom() * 10) / 10;
  for (const def of OVERLAYS) {
    if (!sink.has(def.key)) continue;
    const on = !!visible[def.key];
    sink.setVisible(def.key, on);
    if (!on) {
      if ("staticPaths" in def) {
        const r = staticRuntime.get(def.key);
        r?.controller?.abort(); // abandon an in-flight download
        if (r) r.controller = null; // fc/hucIndex retained — session cache
      } else {
        const r = runtime.get(def.key);
        r?.controller?.abort();
        if (r) {
          r.controller = null;
          r.readyKey = null;
        }
      }
      actions.setOverlayStatus(def.key, null);
      continue;
    }
    if (def.kind === "wms") {
      actions.setOverlayStatus(def.key, null); // raster tiles manage themselves
      continue;
    }
    if ("staticPaths" in def) {
      // Viewport-independent: no zoom gate, no isMoving guard — arming a
      // Select tool mid-animation starts the download immediately.
      void ensureStaticOverlay(sink, def);
      continue;
    }
    if (zoom < def.minZoom) {
      runtime.get(def.key)?.controller?.abort();
      actions.setOverlayStatus(def.key, null); // the panel derives "zoom in to load"
      continue;
    }
    // During a camera animation the extent is still changing; the moveend
    // refresh covers it.
    if (!sink.isMoving()) void fetchOverlay(sink, def);
  }
}

let refreshTimer: ReturnType<typeof setTimeout> | null = null;

/** Debounced refetch for moveend (live point layers; static layers no-op
 * through their cache/single-flight guards). Takes a getter so a toggle
 * during the window can't resurrect stale visibility. */
export function scheduleOverlayRefresh(sink: OverlaySink, getVisible: () => Record<string, boolean>, delay = 250): void {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    updateOverlays(sink, getVisible());
  }, delay);
}

/** Map panel unmount: cancel the timer and abort everything in flight. The
 * static session cache is retained — a remount re-applies without refetching. */
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
  for (const r of staticRuntime.values()) {
    r.controller?.abort();
    r.controller = null;
    r.applied = false;
  }
}

/** Layers-panel Retry: forget the failure and fetch again. */
export function retryOverlay(sink: OverlaySink, key: string, visible: Record<string, boolean>): void {
  const def = OVERLAYS.find((d) => d.key === key);
  if (!def || !visible[key] || def.kind === "wms") return;
  if ("staticPaths" in def) {
    void ensureStaticOverlay(sink, def);
    return;
  }
  const r = runtime.get(key);
  if (r) r.readyKey = null;
  if (Math.round(sink.getZoom() * 10) / 10 >= def.minZoom) void fetchOverlay(sink, def);
}
