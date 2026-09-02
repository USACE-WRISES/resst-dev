// The DOM map trial behind ?diag=1: a Leaflet map with image tiles, the app's
// site markers drawn as SVG (or canvas) circles, and permanent tooltip labels
// once zoomed in, so a user on a machine where WebGL is slow can judge whether
// a DOM-rendered map would be smooth there. The diagnostics page loads this
// module by dynamic import, so Leaflet compiles to its own chunk and never
// reaches the main bundle.

import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import { USGS_TOPO_ATTRIBUTION, USGS_TOPO_TILES } from "../map/basemaps";
import type { SitePointFC } from "./collect";
import {
  DOM_TRIAL_LABEL_CAP,
  DOM_TRIAL_LABEL_ZOOM,
  frameStats,
  settleStats,
  type DomTrial,
  type DomTrialObservation,
  type DomTrialRenderer,
} from "./probes";

// Copy of MapPanel.tsx's CONUS_BOUNDS (west, south, east, north). Importing
// MapPanel here would pull the whole app into this chunk.
const CONUS_BOUNDS = [-116.7544, 30.8881, -79.9282, 46.6079] as const;
const LOAD_BUDGET_MS = 15_000;

export interface LeafletTrialHandle {
  /** Rebuild the markers on the other renderer. Its run starts at 0 gestures. */
  setRenderer(kind: DomTrialRenderer): void;
  /** Applies to the renderer currently shown. */
  judge(observation: Exclude<DomTrialObservation, "not-judged">): void;
  snapshot(): DomTrial;
  stop(): void;
}

interface RunState {
  renderer: DomTrialRenderer;
  gestures: number;
  /** Frame gaps while a gesture was in flight, and the gestures' total wall time. */
  deltas: number[];
  gestureMs: number;
  settles: number[];
  observation: DomTrialObservation;
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

export function startLeafletTrial(
  container: HTMLElement,
  fc: SitePointFC,
  onUpdate: (t: DomTrial) => void,
): LeafletTrialHandle {
  const t0 = performance.now();
  const map = L.map(container, { minZoom: 3, maxZoom: 18 });
  // Before any listener is attached, so the initial fit is not counted as a
  // gesture (Leaflet fires moveend synchronously for the first view).
  map.fitBounds([
    [CONUS_BOUNDS[1], CONUS_BOUNDS[0]],
    [CONUS_BOUNDS[3], CONUS_BOUNDS[2]],
  ]);

  const runs = new Map<DomTrialRenderer, RunState>();
  const runFor = (kind: DomTrialRenderer): RunState => {
    let r = runs.get(kind);
    if (!r) {
      r = { renderer: kind, gestures: 0, deltas: [], gestureMs: 0, settles: [], observation: "not-judged" };
      runs.set(kind, r);
    }
    return r;
  };
  let current = runFor("svg");
  let loadMs: number | null = null;
  let loadTimedOut = false;
  let stopped = false;

  const snapshot = (): DomTrial => ({
    loadMs,
    loadTimedOut,
    markers: fc.features.length,
    labelCap: DOM_TRIAL_LABEL_CAP,
    runs: [...runs.values()].map((r) => ({
      renderer: r.renderer,
      gestures: r.gestures,
      raf: frameStats(r.deltas, r.gestureMs),
      settle: settleStats(r.settles),
      observation: r.observation,
    })),
  });
  const emit = () => {
    if (!stopped) onUpdate(snapshot());
  };

  // Gesture instrumentation. Registered before the layers: Leaflet runs
  // listeners in registration order, so the settle clock starts before the
  // renderer's own moveend work (re-projecting every marker) and includes it.
  let rafId = 0;
  let last = 0;
  let gestureStart = 0;
  const tick = (now: number) => {
    current.deltas.push(now - last);
    last = now;
    rafId = requestAnimationFrame(tick);
  };
  const endGestureClock = () => {
    if (!rafId) return;
    cancelAnimationFrame(rafId);
    rafId = 0;
    current.gestureMs += performance.now() - gestureStart;
  };
  map.on("movestart", () => {
    if (rafId) return;
    gestureStart = last = performance.now();
    rafId = requestAnimationFrame(tick);
  });
  map.on("moveend", () => {
    endGestureClock();
    current.gestures += 1;
    const run = current;
    const s0 = performance.now();
    // Two frames: the first rAF runs before the paint that follows moveend's
    // DOM work, the second runs after it has been committed.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        run.settles.push(performance.now() - s0);
        emit();
      }),
    );
  });

  const tiles = L.tileLayer(USGS_TOPO_TILES, {
    maxNativeZoom: 16,
    maxZoom: 18,
    attribution: USGS_TOPO_ATTRIBUTION,
  });
  const loadTimer = window.setTimeout(() => {
    if (loadMs != null) return;
    loadMs = Math.round(performance.now() - t0);
    loadTimedOut = true;
    emit();
  }, LOAD_BUDGET_MS);
  tiles.once("load", () => {
    if (loadMs != null) return;
    loadMs = Math.round(performance.now() - t0);
    emit();
  });
  tiles.addTo(map);

  // Markers. SVG mode passes no renderer and therefore uses the map's default
  // L.svg(); canvas mode shares one L.canvas(), which Leaflet adds to the map
  // on first use and which is removed again when SVG comes back so no idle
  // canvas lingers in the overlay pane.
  const canvasRenderer = L.canvas();
  const names = new Map<L.CircleMarker, string>();
  const labelled = new Set<L.CircleMarker>();
  let group: L.LayerGroup | null = null;
  let markers: L.CircleMarker[] = [];

  const refreshLabels = () => {
    const wanted = new Set<L.CircleMarker>();
    if (map.getZoom() >= DOM_TRIAL_LABEL_ZOOM) {
      const bounds = map.getBounds();
      for (const m of markers) {
        if (wanted.size >= DOM_TRIAL_LABEL_CAP) break;
        if (bounds.contains(m.getLatLng())) wanted.add(m);
      }
    }
    // Tooltips are DOM nodes: touch only the ones that changed.
    for (const m of labelled) {
      if (wanted.has(m)) continue;
      m.unbindTooltip();
      labelled.delete(m);
    }
    for (const m of wanted) {
      if (labelled.has(m)) continue;
      m.bindTooltip(escapeHtml(names.get(m) ?? ""), {
        permanent: true,
        direction: "top",
        offset: [0, -7],
        className: "diag-site-label",
        opacity: 1,
      });
      labelled.add(m);
    }
  };
  map.on("moveend", refreshLabels);

  const buildMarkers = (kind: DomTrialRenderer) => {
    labelled.clear();
    names.clear();
    group?.remove();
    markers = fc.features.map((f) => {
      const lng = f.geometry.coordinates[0];
      const lat = f.geometry.coordinates[1];
      const name = f.properties.site_name;
      const m = L.circleMarker([lat, lng], {
        radius: 5.5,
        color: "#7a1d10",
        weight: 1,
        fillColor: "#e8442a",
        fillOpacity: 1,
        ...(kind === "canvas" ? { renderer: canvasRenderer } : {}),
      });
      // autoPan would move the map on click and count as a gesture.
      m.bindPopup(escapeHtml(name), { autoPan: false });
      names.set(m, name);
      return m;
    });
    group = L.layerGroup(markers).addTo(map);
    if (kind === "svg" && map.hasLayer(canvasRenderer)) map.removeLayer(canvasRenderer);
    refreshLabels();
  };
  buildMarkers("svg");
  emit();

  return {
    setRenderer(kind) {
      if (stopped || kind === current.renderer) return;
      endGestureClock();
      current = runFor(kind);
      buildMarkers(kind);
      emit();
    },
    judge(observation) {
      if (stopped) return;
      current.observation = observation;
      emit();
    },
    snapshot,
    stop() {
      if (stopped) return;
      stopped = true;
      clearTimeout(loadTimer);
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
      map.remove();
    },
  };
}
