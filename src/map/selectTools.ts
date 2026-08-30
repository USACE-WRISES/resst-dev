// The map Select tool sessions. MapPanel arms a tool by running
// startSelectSession inside an effect keyed on state.mapTool; the returned
// cleanup (effect teardown = Esc, Cancel/Done, one-shot completion, mode
// switch, unmount) removes listeners, aborts in-flight queries, clears the
// draw scratch layer, and restores the map handlers it disabled.
//
// Shared semantics across every mode: one-shot (a completed selection disarms
// — river instead enters a refine stage ended by Done/Esc), Shift at the
// completing gesture ADDS to the current selection, zero hits keep the tool
// armed with a hint message, and Esc never reverts an applied selection.

import type { GeoJSONSource, Map as MlMap, MapMouseEvent } from "maplibre-gl";
import type { Feature, FeatureCollection, Position } from "geojson";
import { actions, getState, type MapTool } from "../state/store";
import type { Site } from "../lib/types";
import { getHucIndex, getStaticOverlayFC } from "./overlays";
import { findHucAt, riverPartsByName, wrapLon } from "./localQueries";
import {
  corridorOf,
  metersPerPixel,
  milesToMeters,
  partsNearSeed,
  pointInRings,
  pointToPartsMeters,
  withinCorridor,
  type Corridor,
  type Pt,
} from "./spatial";

/** Hint-bar feedback. kind "river" marks the refine stage (Cancel → Done). */
export type ToolMsg = { kind: "busy" | "empty" | "error" | "river"; text: string };

/** The picked river, kept for live distance recomputes. `base` is the
 * selection a Shift-pick unions with (empty for a plain pick). */
export interface RiverPick {
  corridor: Corridor;
  base: string[];
  name: string;
}

export interface SessionCtx {
  map: MlMap;
  container: HTMLDivElement;
  /** The .select-box rubber-band div (box mode only). */
  boxEl: HTMLDivElement;
  /** Filtered sites currently on the map — the tools respect active filters. */
  sites: () => Site[];
  setMsg: (m: ToolMsg | null) => void;
  riverRef: { current: RiverPick | null };
  /** Handshake with MapPanel's selection effect: a completing gesture sets
   * this so its own selectSites doesn't clear the highlight it just drew. */
  keepHighlightRef: { current: boolean };
}

const EMPTY_FC: FeatureCollection = { type: "FeatureCollection", features: [] };

/* The hint bar's polygon Finish button reaches the live session through this
 * registry (the mapBus pattern — the session is imperative, not React). */
let sessionCommands: { finish?: () => void } | null = null;
export const selectSessionCommands = (): { finish?: () => void } | null => sessionCommands;

export function startSelectSession(tool: Exclude<MapTool, "none">, ctx: SessionCtx): () => void {
  // Shift+drag is ours while armed (additive select) — keep maplibre's
  // boxZoom from claiming it. Restored on teardown.
  ctx.map.boxZoom.disable();
  ctx.map.getCanvas().style.cursor = "crosshair";
  const onEsc = (e: KeyboardEvent) => {
    if (e.key === "Escape") actions.setMapTool("none");
  };
  window.addEventListener("keydown", onEsc);
  const stop =
    tool === "box" ? startBox(ctx)
    : tool === "polygon" ? startPolygon(ctx)
    : tool === "river" ? startRiver(ctx)
    : startHuc(tool, ctx);
  return () => {
    try {
      stop();
      ctx.map.boxZoom.enable();
      ctx.map.getCanvas().style.cursor = "";
    } catch {
      /* app teardown order: the map may already be removed */
    }
    window.removeEventListener("keydown", onEsc);
    sessionCommands = null;
    ctx.setMsg(null);
  };
}

/** Filtered sites matching `test`, skipping records without coordinates. The
 * ±360 retries cover maplibre's unwrapped longitudes (a shape drawn on a
 * wrapped world copy) — the dataset itself spans lon −158…+177. */
function matchSites(sites: Site[], test: (p: Pt) => boolean): string[] {
  const out: string[] = [];
  for (const s of sites) {
    if (s.longitude == null || s.latitude == null) continue;
    const lon = s.longitude;
    const lat = s.latitude;
    if (test([lon, lat]) || test([lon + 360, lat]) || test([lon - 360, lat])) out.push(s.site_id);
  }
  return out;
}

function setHighlight(map: MlMap, f: Feature | null): void {
  (map.getSource("ov-select") as GeoJSONSource | undefined)?.setData(
    f ? { type: "FeatureCollection", features: [f] } : EMPTY_FC,
  );
}

function applySelection(
  ctx: SessionCtx,
  ids: string[],
  opts: { additive: boolean; disarm: boolean; highlight: Feature | null },
): void {
  const final = opts.additive ? [...getState().selectedSiteIds, ...ids] : ids; // selectSites dedupes
  setHighlight(ctx.map, opts.highlight);
  ctx.keepHighlightRef.current = true; // consumed by MapPanel's selection effect
  actions.selectSites(final);
  if (opts.disarm) actions.setMapTool("none");
}

/** True for keydowns that belong to a focused control, not the map gesture. */
const keyBelongsToControl = (e: KeyboardEvent): boolean => {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "BUTTON" || t.isContentEditable);
};

// ---------------------------------------------------------------- box -------

function startBox(ctx: SessionCtx): () => void {
  const { map, container, boxEl } = ctx;
  map.dragPan.disable();
  let start: { x: number; y: number } | null = null;

  const toLocal = (e: MouseEvent) => {
    const r = container.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onDown = (e: MouseEvent) => {
    start = toLocal(e);
    boxEl.style.display = "block";
  };
  const onMove = (e: MouseEvent) => {
    if (!start) return;
    const p = toLocal(e);
    const x = Math.min(start.x, p.x);
    const y = Math.min(start.y, p.y);
    boxEl.style.left = `${x}px`;
    boxEl.style.top = `${y}px`;
    boxEl.style.width = `${Math.abs(p.x - start.x)}px`;
    boxEl.style.height = `${Math.abs(p.y - start.y)}px`;
  };
  const onUp = (e: MouseEvent) => {
    if (!start) return;
    const p = toLocal(e);
    const sw: [number, number] = [Math.min(start.x, p.x), Math.min(start.y, p.y)];
    const ne: [number, number] = [Math.max(start.x, p.x), Math.max(start.y, p.y)];
    start = null;
    boxEl.style.display = "none";
    boxEl.style.width = "0";
    const features = map.queryRenderedFeatures([sw, ne], { layers: ["sites-circles"] });
    const ids = [...new Set(features.map((f) => f.properties?.site_id as string).filter(Boolean))];
    if (!ids.length) {
      ctx.setMsg({ kind: "empty", text: "No sites in that box. Drag again, or press Esc to stop." });
      return;
    }
    applySelection(ctx, ids, { additive: e.shiftKey, disarm: true, highlight: null });
  };
  const canvas = map.getCanvas();
  canvas.addEventListener("mousedown", onDown);
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
  return () => {
    canvas.removeEventListener("mousedown", onDown);
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
    boxEl.style.display = "none";
    map.dragPan.enable();
  };
}

// ------------------------------------------------------------ polygon -------

function startPolygon(ctx: SessionCtx): () => void {
  const { map } = ctx;
  map.doubleClickZoom.disable();
  const verts: Position[] = [];
  let cursor: Position | null = null;

  const draw = () => {
    const feats: Feature[] = [];
    const path = cursor ? [...verts, cursor] : [...verts];
    if (path.length >= 2)
      feats.push({
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: path.length >= 3 ? [...path, path[0]] : path },
      });
    if (path.length >= 3)
      feats.push({
        type: "Feature",
        properties: {},
        geometry: { type: "Polygon", coordinates: [[...path, path[0]]] },
      });
    for (const v of verts)
      feats.push({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: v } });
    (map.getSource("ov-draw") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: feats });
  };

  const finish = (additive: boolean) => {
    const ring = [...verts];
    // The second click of a double-click lands ~0 px from the last vertex — drop it.
    if (ring.length >= 2) {
      const a = map.project(ring[ring.length - 1] as [number, number]);
      const b = map.project(ring[ring.length - 2] as [number, number]);
      if (Math.hypot(a.x - b.x, a.y - b.y) < 6) ring.pop();
    }
    if (ring.length < 3) {
      ctx.setMsg({ kind: "empty", text: "A polygon needs at least 3 corners; keep clicking." });
      return;
    }
    const ids = matchSites(ctx.sites(), (p) => pointInRings(p, [ring]));
    if (!ids.length) {
      verts.length = 0;
      cursor = null;
      draw();
      ctx.setMsg({ kind: "empty", text: "No sites inside that polygon. Draw again, or press Esc to stop." });
      return;
    }
    applySelection(ctx, ids, {
      additive,
      disarm: true,
      highlight: { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[...ring, ring[0]]] } },
    });
  };

  const onClick = (e: MapMouseEvent) => {
    verts.push([e.lngLat.lng, e.lngLat.lat]);
    draw();
  };
  const onMove = (e: MapMouseEvent) => {
    if (!verts.length) return;
    cursor = [e.lngLat.lng, e.lngLat.lat];
    draw();
  };
  const onDbl = (e: MapMouseEvent) => {
    e.preventDefault();
    finish(e.originalEvent.shiftKey);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !keyBelongsToControl(e)) finish(e.shiftKey);
  };
  map.on("click", onClick);
  map.on("mousemove", onMove);
  map.on("dblclick", onDbl);
  window.addEventListener("keydown", onKey);
  sessionCommands = { finish: () => finish(false) };
  return () => {
    map.off("click", onClick);
    map.off("mousemove", onMove);
    map.off("dblclick", onDbl);
    window.removeEventListener("keydown", onKey);
    (map.getSource("ov-draw") as GeoJSONSource | undefined)?.setData(EMPTY_FC);
    map.doubleClickZoom.enable();
  };
}

// ---------------------------------------------------------------- huc -------

function startHuc(tool: "huc2" | "huc4" | "huc6" | "huc8", ctx: SessionCtx): () => void {
  const { map } = ctx;
  // Boundaries visible to aim at (arming also kicks the one-time snapshot
  // download); deliberately left on after disarm — Layers turns it off.
  if (!getState().overlays[tool]) actions.setOverlay(tool, true);
  const level = tool.replace("huc", "HUC-");

  const onClick = (e: MapMouseEvent) => {
    const index = getHucIndex(tool);
    if (!index) {
      // Snapshot not resident yet — status-aware, like the river session.
      const st = getState().overlayStatus[tool];
      ctx.setMsg(
        st === "error"
          ? { kind: "error", text: `The ${level} boundaries failed to load. Use Layers → Retry, then click again.` }
          : { kind: "busy", text: `The ${level} boundaries are still loading; try again in a moment.` },
      );
      return;
    }
    const hit = findHucAt(index, [wrapLon(e.lngLat.lng), e.lngLat.lat]);
    if (!hit) {
      ctx.setMsg({ kind: "empty", text: `That point is outside every ${level} basin. Click inside a boundary.` });
      return;
    }
    const ids = matchSites(ctx.sites(), (p) => pointInRings(p, hit.rings));
    if (!ids.length) {
      ctx.setMsg({
        kind: "empty",
        text: `No sites shown in ${hit.name || hit.id}. Try another basin or loosen the filters.`,
      });
      return;
    }
    applySelection(ctx, ids, {
      additive: e.originalEvent.shiftKey,
      disarm: true,
      // All rings (outer + holes) render correctly as one even-odd Polygon.
      highlight: { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: hit.rings } },
    });
  };
  map.on("click", onClick);
  return () => map.off("click", onClick);
}

// -------------------------------------------------------------- river -------

function startRiver(ctx: SessionCtx): () => void {
  const { map } = ctx;
  // Arming kicks the one-time rivers-snapshot download.
  if (!getState().overlays.rivers) actions.setOverlay("rivers", true);

  const onClick = (e: MapMouseEvent) => {
    const click: Pt = [wrapLon(e.lngLat.lng), e.lngLat.lat];
    // Hit-test against the resident snapshot, not the render tree: dense
    // river data can overflow maplibre's 65,535-vertex line buckets and
    // silently drop segments from rendering, so queryRenderedFeatures misses
    // rivers that are plainly there. ~8 px of ground tolerance.
    const fc = getStaticOverlayFC("rivers");
    const hit = fc ? nearestRiverFeature(fc, click, 8 * metersPerPixel(map.getZoom(), click[1])) : null;
    if (!hit) {
      const st = getState().overlayStatus.rivers;
      ctx.setMsg(
        st === "loading" || !fc
          ? { kind: "busy", text: "River lines are still loading; try again in a moment." }
          : st === "error"
            ? { kind: "error", text: "The river layer failed to load. Use Layers → Retry, then click again." }
            : { kind: "empty", text: "No river there. Click directly on a blue line." },
      );
      return;
    }
    // The snapshot holds the whole continent, so the full course is local:
    // by-name parts for named rivers (namesakes clustered away by
    // partsNearSeed), the feature's own complete parts otherwise.
    const parts = hit.name ? partsNearSeed(riverPartsByName(fc!, hit.name), click) : hit.parts;
    if (!parts.length) {
      ctx.setMsg({ kind: "error", text: "Could not trace that river's course. Click it again." });
      return;
    }
    ctx.riverRef.current = {
      corridor: corridorOf(parts),
      base: e.originalEvent.shiftKey ? getState().selectedSiteIds : [],
      name: hit.name || "this stream",
    };
    recomputeRiver(ctx); // refine stage begins; distance edits re-enter here
  };
  map.on("click", onClick);
  return () => {
    map.off("click", onClick);
    ctx.riverRef.current = null;
  };
}

/** Refine stage: base ∪ within-distance, applied live. Also entered from
 * MapPanel's riverDistanceMiles effect. Never disarms — Done/Esc do. */
export function recomputeRiver(ctx: SessionCtx): void {
  const pick = ctx.riverRef.current;
  if (!pick) return;
  const mi = getState().riverDistanceMiles;
  const meters = milesToMeters(mi);
  const ids = matchSites(ctx.sites(), (p) => withinCorridor(p, pick.corridor, meters));
  applySelection(ctx, [...pick.base, ...ids], {
    additive: false,
    disarm: false,
    highlight: {
      type: "Feature",
      properties: {},
      geometry: { type: "MultiLineString", coordinates: pick.corridor.parts },
    },
  });
  ctx.setMsg({
    kind: "river",
    text: ids.length
      ? `${ids.length} site${ids.length === 1 ? "" : "s"} within ${mi} mi of ${pick.name}.`
      : `No sites within ${mi} mi of ${pick.name}. Increase the distance.`,
  });
}

/** The river feature (from the resident snapshot) nearest the click, or null
 * when none comes within `maxMeters`. */
function nearestRiverFeature(fc: FeatureCollection, click: Pt, maxMeters: number): { name: string; parts: Position[][] } | null {
  let best: { name: string; parts: Position[][] } | null = null;
  let bestD = Infinity;
  for (const f of fc.features) {
    if (f.geometry.type !== "MultiLineString") continue;
    const d = pointToPartsMeters(click, f.geometry.coordinates);
    if (d < bestD) {
      bestD = d;
      best = {
        name: String((f.properties as Record<string, unknown> | null)?.NameEn ?? "").trim(),
        parts: f.geometry.coordinates,
      };
    }
  }
  return bestD <= maxMeters ? best : null;
}
