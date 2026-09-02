// Which map engine this page load uses. Transitional: MapLibre (WebGL) stays
// the default while the Leaflet map is brought to parity; machines whose
// WebGL runs on a software rasterizer (remote browser isolation, VMs) get the
// Leaflet map, and either can be forced for comparison. The choice is made
// once per load, synchronously, so the app never mounts one engine and then
// swaps to the other.

import { classifyRenderer, type RenderClass } from "../lib/renderClass";

export type MapEngine = "maplibre" | "leaflet";

/** localStorage key; absent means automatic. Set by hand — no UI during the transition. */
export const ENGINE_STORAGE_KEY = "resst.mapEngine";
/** URL override, `?map=leaflet` or `?map=maplibre`. Session only, never persisted. */
export const ENGINE_URL_PARAM = "map";
/** sessionStorage memo of the WebGL probe, so one context is created per session. */
export const RENDER_CLASS_SESSION_KEY = "resst.renderClass";

export function parseEngine(raw: string | null | undefined): MapEngine | null {
  return raw === "leaflet" || raw === "maplibre" ? raw : null;
}

/**
 * Precedence: URL, stored choice, then the software-WebGL rule. `renderClass`
 * is a thunk so the WebGL probe runs only when nothing explicit decides.
 */
export function resolveEngine(
  urlParam: string | null | undefined,
  stored: string | null | undefined,
  renderClass: () => RenderClass,
): MapEngine {
  return parseEngine(urlParam) ?? parseEngine(stored) ?? (renderClass() === "software" ? "leaflet" : "maplibre");
}

/** One throwaway WebGL context, classified and memoized for the session. */
export function detectRenderClass(): RenderClass {
  if (typeof document === "undefined") return "unknown";
  try {
    const memo = sessionStorage.getItem(RENDER_CLASS_SESSION_KEY);
    if (memo === "software" || memo === "hardware" || memo === "unknown") return memo;
  } catch {
    /* storage blocked: probe on every load */
  }
  let cls: RenderClass = "unknown";
  try {
    const canvas = document.createElement("canvas");
    const gl = (canvas.getContext("webgl2") ?? canvas.getContext("webgl")) as
      | WebGLRenderingContext
      | WebGL2RenderingContext
      | null;
    if (gl) {
      const dbg = gl.getExtension("WEBGL_debug_renderer_info");
      cls = classifyRenderer(dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : null);
      // Free it: browsers cap live contexts and the map needs its own.
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
  } catch {
    cls = "unknown";
  }
  try {
    sessionStorage.setItem(RENDER_CLASS_SESSION_KEY, cls);
  } catch {
    /* ignore */
  }
  return cls;
}

let memo: MapEngine | null = null;

/** The engine for this page load, decided once. */
export function currentEngine(): MapEngine {
  if (memo) return memo;
  let url: string | null = null;
  let stored: string | null = null;
  try {
    url = new URLSearchParams(location.search).get(ENGINE_URL_PARAM);
  } catch {
    /* no location (node) */
  }
  try {
    stored = localStorage.getItem(ENGINE_STORAGE_KEY);
  } catch {
    /* storage blocked */
  }
  memo = resolveEngine(url, stored, detectRenderClass);
  return memo;
}
