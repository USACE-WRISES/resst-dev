// Browser-side collectors for the ?diag=1 page. Everything that touches the
// DOM, WebGL, or the network lives here; the arithmetic and formatting live in
// probes.ts so vitest (environment: "node") can test them without a DOM.

import { Map as MlMap, type StyleSpecification } from "maplibre-gl";
import { buildUsgsStyle, fetchEsriTopoStyle } from "../map/basemaps";
import { classifyRenderer, frameStats, type BenchRun, type ContextProbe, type ReachResult, type TimingLike } from "./probes";

export interface WebglInfo {
  webglVersion: number | null;
  vendor: string;
  renderer: string;
  maxTextureSize: number | null;
  strictContextOk: boolean;
}

/**
 * Read the GPU identity off a throwaway canvas. The unmasked strings can be
 * withheld by privacy settings, so "masked" is reported as such rather than
 * guessed at. The strict context is the reliable cross-check: Chrome refuses
 * failIfMajorPerformanceCaveat on a software stack even when it masks the
 * renderer string.
 */
export function probeWebgl(): WebglInfo {
  const canvas = document.createElement("canvas");
  const gl2 = canvas.getContext("webgl2");
  const gl = gl2 ?? canvas.getContext("webgl");
  if (!gl) {
    return { webglVersion: null, vendor: "unavailable", renderer: "unavailable", maxTextureSize: null, strictContextOk: false };
  }
  const dbg = gl.getExtension("WEBGL_debug_renderer_info");
  let strictContextOk = false;
  try {
    const probe = document.createElement("canvas");
    strictContextOk = !!(
      probe.getContext("webgl2", { failIfMajorPerformanceCaveat: true }) ??
      probe.getContext("webgl", { failIfMajorPerformanceCaveat: true })
    );
  } catch {
    strictContextOk = false;
  }
  return {
    webglVersion: gl2 ? 2 : 1,
    vendor: dbg ? String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL)) : "masked",
    renderer: dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : "masked",
    maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,
    strictContextOk,
  };
}

/**
 * Try each WebGL configuration MapLibre could be pinned to and record the
 * renderer it actually yields. Contexts are released immediately — a browser
 * only allows a limited number live at once, and the benchmark needs them.
 */
export function probeContextMatrix(): ContextProbe[] {
  const combos: { contextType: "webgl2" | "webgl"; powerPreference: string; caveat: boolean }[] = [
    { contextType: "webgl2", powerPreference: "high-performance", caveat: false },
    { contextType: "webgl2", powerPreference: "low-power", caveat: false },
    { contextType: "webgl2", powerPreference: "default", caveat: false },
    { contextType: "webgl2", powerPreference: "high-performance", caveat: true },
    { contextType: "webgl", powerPreference: "high-performance", caveat: false },
    { contextType: "webgl", powerPreference: "low-power", caveat: false },
    { contextType: "webgl", powerPreference: "default", caveat: false },
    { contextType: "webgl", powerPreference: "high-performance", caveat: true },
  ];
  return combos.map(({ contextType, powerPreference, caveat }) => {
    const label = `${contextType} / ${powerPreference}${caveat ? " / no-caveat" : ""}`;
    let renderer = "no context";
    let ok = false;
    let gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
    try {
      const canvas = document.createElement("canvas");
      gl = canvas.getContext(contextType, {
        powerPreference,
        failIfMajorPerformanceCaveat: caveat,
      } as WebGLContextAttributes) as WebGLRenderingContext | WebGL2RenderingContext | null;
      if (gl) {
        ok = true;
        const dbg = gl.getExtension("WEBGL_debug_renderer_info");
        renderer = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : "masked";
      }
    } catch (err) {
      renderer = err instanceof Error ? err.message : String(err);
    } finally {
      // Free it straight away; the four benchmark maps need contexts of their own.
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
    }
    return {
      label,
      contextType,
      powerPreference,
      failIfMajorPerformanceCaveat: caveat,
      ok,
      renderer,
      renderClass: ok ? classifyRenderer(renderer) : "unknown",
    };
  });
}

export interface EnvironmentInfo {
  userAgent: string;
  devicePixelRatio: number;
  screen: string;
  hardwareConcurrency: number | null;
  deviceMemory: number | null;
  reducedMotion: boolean;
}

export function collectEnvironment(): EnvironmentInfo {
  const nav = navigator as Navigator & { deviceMemory?: number };
  // Which physical monitor the run happened on is a variable under test, so
  // record the screen geometry alongside the window's own size.
  const extended = "isExtended" in screen ? ` (extended: ${String((screen as Screen & { isExtended?: boolean }).isExtended)})` : "";
  return {
    userAgent: navigator.userAgent,
    devicePixelRatio: window.devicePixelRatio,
    screen: `${screen.width}x${screen.height} screen, ${window.innerWidth}x${window.innerHeight} window${extended}`,
    hardwareConcurrency: nav.hardwareConcurrency ?? null,
    deviceMemory: nav.deviceMemory ?? null,
    reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// A fixed camera circuit: CONUS overview, in to Tuttle Creek, closer, off to a
// neighbouring basin, back out. Identical for every run so the legs are the
// only thing being compared.
const LEGS: { center: [number, number]; zoom: number }[] = [
  { center: [-96.6, 39.2], zoom: 8 },
  { center: [-96.6, 39.2], zoom: 11 },
  { center: [-95.0, 38.0], zoom: 8 },
  { center: [-98.5, 39.0], zoom: 4 },
];
const LEG_MS = 800;

/** How long the style took, and whether we gave up waiting. A blocked or
    proxied tile host must not hang the page, and the elapsed time is itself
    a result — it separates "slow to arrive" from "slow to draw". */
function loadedOrTimeout(map: MlMap, ms: number): Promise<{ loadMs: number; timedOut: boolean }> {
  const t0 = performance.now();
  return new Promise((resolve) => {
    let done = false;
    const finish = (timedOut: boolean) => {
      if (done) return;
      done = true;
      resolve({ loadMs: Math.round(performance.now() - t0), timedOut });
    };
    map.once("load", () => finish(false));
    setTimeout(() => finish(true), ms);
  });
}

const LOAD_BUDGET_MS = 15_000;

export interface BenchOptions {
  key: string;
  label: string;
  style: StyleSpecification;
  pixelRatio?: number;
  /** Runs after load, before measuring — used to add the site circles. */
  setup?: (map: MlMap) => void;
}

/**
 * Drive one camera circuit and measure it. Follows the throwaway-map pattern
 * already proven by the report figure (create, measure, remove) so nothing
 * leaks between runs.
 */
export async function runBenchmark(container: HTMLElement, opts: BenchOptions): Promise<BenchRun> {
  let map: MlMap | null = null;
  // Captured outside the try so a later throw still reports how long the
  // style took — that number is half the diagnosis.
  let loadMs: number | null = null;
  let loadTimedOut = false;
  try {
    map = new MlMap({
      container,
      style: opts.style,
      center: [-98.5, 39.0],
      zoom: 4,
      interactive: false,
      attributionControl: false,
      trackResize: false,
      ...(opts.pixelRatio != null ? { pixelRatio: opts.pixelRatio } : {}),
    });
    const load = await loadedOrTimeout(map, LOAD_BUDGET_MS);
    loadMs = load.loadMs;
    loadTimedOut = load.timedOut;

    // A style that never finished loading cannot accept new layers and has no
    // layer list to report. Measure the frames anyway — loadTimedOut tells the
    // reader those frames came from a still-loading map.
    const styleReady = map.isStyleLoaded();
    if (styleReady) opts.setup?.(map);

    const deltas: number[] = [];
    let last = performance.now();
    const onRender = () => {
      const now = performance.now();
      deltas.push(now - last);
      last = now;
    };
    map.on("render", onRender);

    last = performance.now();
    const t0 = performance.now();
    for (const leg of LEGS) {
      map.easeTo({ ...leg, duration: LEG_MS });
      await wait(LEG_MS + 120);
    }
    const wallMs = performance.now() - t0;
    map.off("render", onRender);

    const layerCount = styleReady ? map.getStyle().layers.length : null;
    const stats = frameStats(deltas, wallMs);
    return {
      key: opts.key,
      label: opts.label,
      layerCount,
      stats,
      loadMs,
      loadTimedOut,
      ...(stats ? {} : { error: "no frames rendered (tab backgrounded or WebGL suspended)" }),
    };
  } catch (err) {
    return {
      key: opts.key,
      label: opts.label,
      layerCount: null,
      stats: null,
      loadMs,
      loadTimedOut,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    map?.remove();
  }
}

/** Fetch the site coordinates so one run can measure the app's own point layer. */
export async function fetchSitePoints(): Promise<GeoJSON.FeatureCollection> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/sites.json`);
  if (!res.ok) throw new Error(`sites.json: HTTP ${res.status}`);
  const sites = (await res.json()) as { longitude: number | null; latitude: number | null }[];
  return {
    type: "FeatureCollection",
    features: sites
      .filter((s) => s.longitude != null && s.latitude != null)
      .map((s) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [s.longitude!, s.latitude!] },
        properties: {},
      })),
  };
}

/** Mirrors the app's sites-circles paint closely enough to cost the same. */
export function addSiteCircles(map: MlMap, fc: GeoJSON.FeatureCollection): void {
  map.addSource("diag-sites", { type: "geojson", data: fc });
  map.addLayer({
    id: "diag-sites-circles",
    type: "circle",
    source: "diag-sites",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 3, 10, 7],
      "circle-color": "#e8442a",
      "circle-stroke-color": "#7a1d10",
      "circle-stroke-width": 1,
    },
  });
}

/** Every third-party host the app depends on, with a cheap URL to time. */
export const REACH_TARGETS: { host: string; url: string }[] = [
  { host: "cdn.arcgis.com", url: "https://cdn.arcgis.com/sharing/rest/content/items/27e89eb03c1e4341a1d75e597f0291e6/resources/styles/root.json" },
  { host: "basemaps.arcgis.com", url: "https://basemaps.arcgis.com/arcgis/rest/services/World_Basemap_v2/VectorTileServer/tile/0/0/0.pbf" },
  { host: "services.arcgisonline.com", url: "https://services.arcgisonline.com/arcgis/rest/services/Elevation/World_Hillshade/MapServer/tile/0/0/0" },
  { host: "basemap.nationalmap.gov", url: "https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/0/0/0" },
  { host: "carto.nationalmap.gov", url: "https://carto.nationalmap.gov/arcgis/rest/services/geonames/MapServer?f=json" },
  { host: "services2.arcgis.com", url: "https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/NID_v1/FeatureServer/0?f=json" },
  { host: "services9.arcgis.com", url: "https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/Live_Stream_Gauges_v1/FeatureServer/0?f=json" },
  { host: "api.water.usgs.gov", url: "https://api.water.usgs.gov/nldi/linked-data" },
  { host: "SDMDataAccess.sc.egov.usda.gov", url: "https://SDMDataAccess.sc.egov.usda.gov/Spatial/SDM.wms?SERVICE=WMS&REQUEST=GetCapabilities" },
];

/**
 * Time each dependency. `no-cors` deliberately ignores the CORS result — this
 * measures whether the network reaches the host at all and how long that
 * takes, which is what a proxy or firewall changes. An abort budget keeps a
 * blackholed host from stalling the page.
 */
export async function probeReach(targets = REACH_TARGETS, timeoutMs = 8000): Promise<ReachResult[]> {
  return Promise.all(
    targets.map(async ({ host, url }) => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      const t0 = performance.now();
      try {
        await fetch(url, { mode: "no-cors", cache: "no-store", signal: ctrl.signal });
        return { host, ok: true, ms: Math.round(performance.now() - t0), detail: "reachable" };
      } catch (err) {
        const detail = ctrl.signal.aborted ? `no response within ${timeoutMs} ms` : err instanceof Error ? err.message : String(err);
        return { host, ok: false, ms: Math.round(performance.now() - t0), detail };
      } finally {
        clearTimeout(timer);
      }
    }),
  );
}

export function collectTimings(): TimingLike[] {
  return performance.getEntriesByType("resource").map((e) => {
    const r = e as PerformanceResourceTiming;
    return {
      name: r.name,
      duration: r.duration,
      nextHopProtocol: r.nextHopProtocol,
      encodedBodySize: r.encodedBodySize,
      decodedBodySize: r.decodedBodySize,
      transferSize: r.transferSize,
    };
  });
}

/**
 * The four legs of the comparison: raster floor, vector cost, vector without
 * device-pixel-ratio scaling, and raster plus the app's own point layer.
 * Each is reported independently so one failure does not sink the rest.
 */
export async function runAllBenchmarks(
  container: HTMLElement,
  onProgress: (label: string) => void,
): Promise<BenchRun[]> {
  const runs: BenchRun[] = [];

  onProgress("USGS raster basemap");
  runs.push(await runBenchmark(container, { key: "usgs", label: "USGS raster basemap", style: buildUsgsStyle() }));

  let esriStyle: StyleSpecification | null = null;
  try {
    esriStyle = await fetchEsriTopoStyle();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const failed = { layerCount: null, stats: null, loadMs: null, loadTimedOut: false, error: `style unavailable: ${message}` };
    runs.push({ key: "esri", label: "Esri vector basemap", ...failed });
    runs.push({ key: "esri-half", label: "Esri vector basemap at half resolution", ...failed });
  }
  if (esriStyle) {
    onProgress("Esri vector basemap");
    runs.push(await runBenchmark(container, { key: "esri", label: "Esri vector basemap", style: esriStyle }));
    // Half the linear resolution is a quarter of the pixels. Under software
    // rasterization fill rate dominates, so this is the one lever left when
    // the GPU is unavailable — measure how much it actually buys.
    onProgress("Esri vector basemap at half resolution");
    runs.push(
      await runBenchmark(container, {
        key: "esri-half",
        label: "Esri vector basemap at half resolution",
        style: esriStyle,
        pixelRatio: Math.max(0.5, window.devicePixelRatio / 2),
      }),
    );
  }

  onProgress("USGS raster plus site circles");
  try {
    const fc = await fetchSitePoints();
    runs.push(
      await runBenchmark(container, {
        key: "usgs-sites",
        label: `USGS raster plus ${fc.features.length} site circles`,
        style: buildUsgsStyle(),
        setup: (map) => addSiteCircles(map, fc),
      }),
    );
  } catch (err) {
    runs.push({
      key: "usgs-sites",
      label: "USGS raster plus site circles",
      layerCount: null,
      stats: null,
      loadMs: null,
      loadTimedOut: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return runs;
}
