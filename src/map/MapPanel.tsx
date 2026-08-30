// The interactive map: boots on the USGS National Map topo style (public
// domain, no API key — decision D4) and swaps to the default Esri Topographic
// basemap — the original app's look — once loaded; a picker under the zoom
// buttons toggles between them. The filtered Sites layer renders in
// the current app's symbology: red circles, yellow outline, blue site-name
// labels above (ported from the service drawingInfo + web-map labelingInfo).
// Clicking a point selects the site; the Select menu arms box / polygon /
// HUC-basin / near-a-river selection sessions (selectTools.ts); the search
// box matches site names and USGS GNIS places. Selection drives the details
// panel, tables, popup, and highlight rings.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Map as MlMap,
  Marker,
  Popup,
  NavigationControl,
  ScaleControl,
  LngLatBounds,
  type GeoJSONSource,
  type MapLayerMouseEvent,
} from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Site } from "../lib/types";
import { SITE_DETAIL_FIELDS, SITE_FIELD_LABELS } from "../config/fields";
import { actions, type AppState } from "../state/store";
import { registerMapCommands } from "./mapBus";
import { SearchControl } from "./SearchControl";
import { MapToolPanels } from "./MapToolPanels";
import { SelectMenu } from "./SelectMenu";
import { SelectHintBar } from "./SelectHintBar";
import { startSelectSession, recomputeRiver, type RiverPick, type SessionCtx, type ToolMsg } from "./selectTools";
import { installOverlays, updateOverlays, scheduleOverlayRefresh, retryOverlay, disposeOverlays } from "./overlays";
import { installNetworkLayers, updateNetworkHighlight } from "./networkLayer";
import { installNationalLayers, resetNationalLayerMemo, setNationalSelected, updateNationalLayer } from "./nationalLayer";
import { ensureCore, getCore } from "../sediment/data";
import { formatPct, formatVolumeAcft, pctLost } from "../sediment/format";
import { FLAG, type SedimentCore } from "../sediment/types";
import { applyBasemap, buildUsgsStyle, fetchEsriTopoStyle } from "./basemaps";
import { BasemapControl } from "./BasemapControl";
import { BasemapPicker } from "./BasemapPicker";

// Initial view — the captured CONUS extent the original app opened on.
const CONUS_BOUNDS: [number, number, number, number] = [-116.7544, 30.8881, -79.9282, 46.6079];

function sitesToGeoJSON(sites: Site[]): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: sites
      .filter((s) => s.longitude != null && s.latitude != null)
      .map((s) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [s.longitude!, s.latitude!] },
        properties: { site_id: s.site_id, site_name: s.site_name },
      })),
  };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function popupHtml(site: Site): string {
  const rows = SITE_DETAIL_FIELDS.filter((f) => f !== "site_name")
    .map((f) => {
      const v = site[f];
      return v ? `<div class="popup-row"><span>${esc(SITE_FIELD_LABELS[f] ?? f)}</span><b>${esc(String(v))}</b></div>` : "";
    })
    .join("");
  return `<div class="site-popup"><h3>${esc(site.site_name)}</h3>${rows}</div>`;
}

/** Compact popup for a national-inventory reservoir (not a documented site). */
function reservoirPopupHtml(core: SedimentCore, row: number): string {
  const name = core.names[row] || `NID ${core.nids[row]}`;
  const state = core.state[row] >= 0 ? core.dicts.state[core.state[row]] : "";
  const lost = pctLost(Number.isFinite(core.sed2025[row]) ? core.sed2025[row] : null, Number.isFinite(core.capOrig[row]) ? core.capOrig[row] : null);
  const rows = [
    state ? `<div class="popup-row"><span>State</span><b>${esc(state)}</b></div>` : "",
    `<div class="popup-row"><span>Max storage</span><b>${esc(formatVolumeAcft(core.maxStor[row]))}</b></div>`,
    lost != null ? `<div class="popup-row"><span>Est. capacity lost (2025)</span><b>${esc(formatPct(lost))}</b></div>` : "",
    `<div class="popup-row"><span>Evidence</span><b>${core.flags[row] & FLAG.HAS_SURVEYS ? "Measured surveys (RESSED)" : "Modeled only"}</b></div>`,
  ].join("");
  return `<div class="site-popup"><h3>${esc(name)}</h3>${rows}<p class="popup-note">No documented RESST sediment-management record — details in the panel.</p></div>`;
}

export function MapPanel({ sites, allSites, siteById, siteByShortId, state }: {
  /** Filtered sites currently shown on the map. */
  sites: Site[];
  /** Full site list (search suggestions). */
  allSites: Site[];
  siteById: Map<string, Site>;
  /** ResNet ShortID → site_id — routes national-layer clicks on documented dams to the site experience. */
  siteByShortId: Map<number, string>;
  state: AppState;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const popupRef = useRef<Popup | null>(null);
  // The place-search pin (a DOM marker — it survives basemap setStyle swaps).
  const placeMarkerRef = useRef<Marker | null>(null);
  const loadedRef = useRef(false);
  const boxRef = useRef<HTMLDivElement>(null);
  // Ref mirror for the install-once map closures (site click, hover cursor).
  const mapToolRef = useRef(state.mapTool);
  mapToolRef.current = state.mapTool;
  // Set by a completing Select gesture so the selection effect keeps the
  // basin/river/polygon highlight that gesture just drew.
  const keepHighlightRef = useRef(false);
  // The live river pick (near-a-river refine stage) for distance recomputes.
  const riverRef = useRef<RiverPick | null>(null);
  // The current network highlight's coordinates (for the Zoom-to-network refit).
  const networkCoordsRef = useRef<Array<[number, number]> | null>(null);
  const [toolMsg, setToolMsg] = useState<ToolMsg | null>(null);
  const selectedIds = state.selectedSiteIds;
  const overlaysRef = useRef(state.overlays);
  overlaysRef.current = state.overlays;
  const siteByShortIdRef = useRef(siteByShortId);
  siteByShortIdRef.current = siteByShortId;
  const nationalRef = useRef(state.nationalLayer);
  nationalRef.current = state.nationalLayer;
  const basemapRef = useRef(state.basemap);
  basemapRef.current = state.basemap;
  const [zoomTick, setZoomTick] = useState(4);
  // The basemap picker is React, but maplibre places it: we own the element,
  // maplibre parents it in the top-right stack, and React portals into it.
  const basemapHostRef = useRef<HTMLDivElement | null>(null);
  if (!basemapHostRef.current) {
    const el = document.createElement("div");
    el.className = "maplibregl-ctrl"; // never maplibregl-ctrl-group — see BasemapControl
    basemapHostRef.current = el;
  }

  useEffect(() => {
    const basemapHost = basemapHostRef.current;
    if (!containerRef.current || mapRef.current || !basemapHost) return;
    const map = new MlMap({
      container: containerRef.current,
      style: buildUsgsStyle(),
      bounds: CONUS_BOUNDS,
      fitBoundsOptions: { padding: 20 },
      // No on-map attribution control (owner request); the credits live in the
      // footer's basemap label and Help → About → Credits.
      attributionControl: false,
      // Our own ResizeObserver below owns resizing (unthrottled resize+redraw
      // per frame); maplibre's built-in observer throttles at 50ms and would
      // double the work — and wipe our synchronous redraws mid-drag.
      trackResize: false,
    });
    mapRef.current = map;
    // Read-only handle for the e2e suite (and console debugging).
    (window as unknown as { __resstMap?: MlMap }).__resstMap = map;
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new BasemapControl(basemapHost), "top-right"); // stacks directly under the zoom buttons
    map.addControl(new ScaleControl({ unit: "imperial" }), "bottom-left");

    // Warm the Esri style download in parallel with the USGS boot so the
    // post-load swap lands as soon as possible. Errors are applyBasemap's job
    // (a failed promise is evicted from the memo, so its retry refetches).
    if (basemapRef.current === "esri") void fetchEsriTopoStyle().catch(() => {});

    registerMapCommands({
      fitToSites(list) {
        const pts = list.filter((s) => s.longitude != null && s.latitude != null);
        if (!pts.length) return;
        const bounds = pts.reduce(
          (b, s) => b.extend([s.longitude!, s.latitude!]),
          new LngLatBounds([pts[0].longitude!, pts[0].latitude!], [pts[0].longitude!, pts[0].latitude!]),
        );
        map.fitBounds(bounds, { padding: 60, maxZoom: 10, duration: 700 });
      },
      flyTo(lon, lat, zoom = 9) {
        map.flyTo({ center: [lon, lat], zoom: Math.max(map.getZoom(), zoom), duration: 700 });
      },
      showPlaceMarker(lon, lat, label) {
        placeMarkerRef.current?.remove();
        const popup = new Popup({ offset: 25, maxWidth: "280px" }).setText(label); // setText escapes
        const m = new Marker() // default maplibre pin — matches the original app's drop-a-pin behavior
          .setLngLat([lon, lat])
          .setPopup(popup)
          .addTo(map);
        // The pin is a temporary highlight: closing its popup (the ✕, or any
        // map click) dismisses the whole pin. The identity guard makes this
        // re-entrancy safe — remove() fires "close" synchronously while a
        // replacement is being installed.
        popup.on("close", () => {
          if (placeMarkerRef.current === m) {
            placeMarkerRef.current = null;
            m.remove();
          }
        });
        m.togglePopup(); // open the name immediately
        placeMarkerRef.current = m;
      },
      clearPlaceMarker() {
        placeMarkerRef.current?.remove();
        placeMarkerRef.current = null;
      },
      refreshOverlay(key) {
        retryOverlay(map, key, overlaysRef.current);
      },
      highlightNetwork(row, mode) {
        const core = getCore();
        if (!core || !loadedRef.current) return;
        const coords = updateNetworkHighlight(map, core, row, mode);
        networkCoordsRef.current = coords;
        if (coords && coords.length) fitCoords(coords);
      },
      clearNetworkHighlight() {
        networkCoordsRef.current = null;
        const core = getCore();
        if (core && loadedRef.current) updateNetworkHighlight(map, core, null, "none");
      },
      fitNetwork() {
        if (networkCoordsRef.current?.length) fitCoords(networkCoordsRef.current);
      },
    });

    function fitCoords(pts: Array<[number, number]>) {
      const bounds = pts.reduce((b, p) => b.extend(p), new LngLatBounds(pts[0], pts[0]));
      map.fitBounds(bounds, { padding: 60, maxZoom: 9, duration: 700 });
    }

    map.on("load", () => {
      map.addSource("sites", { type: "geojson", data: sitesToGeoJSON([]) });
      // Symbology ported from the service renderer: red circle, yellow outline, size 8.
      map.addLayer({
        id: "sites-circles",
        type: "circle",
        source: "sites",
        paint: {
          "circle-radius": 5.5,
          "circle-color": "#ff0000",
          "circle-stroke-color": "#ffff00",
          "circle-stroke-width": 1,
        },
      });
      map.addLayer({
        id: "sites-selected",
        type: "circle",
        source: "sites",
        filter: ["in", ["get", "site_id"], ["literal", []]],
        paint: {
          "circle-radius": 9,
          "circle-color": "rgba(0,255,255,0.25)",
          "circle-stroke-color": "#00ffff",
          "circle-stroke-width": 2.5,
        },
      });
      // Labels ported from the web map: blue Arial ~10px, white halo, above center.
      map.addLayer({
        id: "sites-labels",
        type: "symbol",
        source: "sites",
        minzoom: 6,
        layout: {
          "text-field": ["get", "site_name"],
          "text-font": ["Noto Sans Regular"],
          "text-size": 11,
          "text-anchor": "bottom",
          "text-offset": [0, -0.7],
          "text-optional": true,
        },
        paint: {
          "text-color": "#0044ff",
          "text-halo-color": "#f7f7f7",
          "text-halo-width": 1,
        },
      });

      map.on("click", "sites-circles", (e: MapLayerMouseEvent) => {
        if (mapToolRef.current !== "none") return; // an armed Select session owns clicks
        const siteId = e.features?.[0]?.properties?.site_id as string | undefined;
        if (siteId) actions.selectSite(siteId);
      });
      map.on("mouseenter", "sites-circles", () => {
        if (mapToolRef.current === "none") map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "sites-circles", () => {
        if (mapToolRef.current === "none") map.getCanvas().style.cursor = "";
      });

      // Reference overlays render beneath the sites layers.
      installOverlays(map);

      // Select-tool scratch layers, both ov-prefixed so basemap swaps carry
      // them (with their current data) across setStyle. ov-select = the
      // chosen basin/river/polygon highlight, under the site circles;
      // ov-draw = the in-progress polygon sketch, above everything.
      const emptyFC: FeatureCollection = { type: "FeatureCollection", features: [] };
      map.addSource("ov-select", { type: "geojson", data: emptyFC });
      map.addLayer(
        {
          id: "ov-select-fill",
          type: "fill",
          source: "ov-select",
          filter: ["==", ["geometry-type"], "Polygon"],
          paint: { "fill-color": "#00a0b0", "fill-opacity": 0.08 },
        },
        "sites-circles",
      );
      map.addLayer(
        {
          id: "ov-select-line",
          type: "line",
          source: "ov-select",
          paint: { "line-color": "#00a0b0", "line-width": 2.5, "line-opacity": 0.9 },
        },
        "sites-circles",
      );
      map.addSource("ov-draw", { type: "geojson", data: emptyFC });
      map.addLayer({
        id: "ov-draw-fill",
        type: "fill",
        source: "ov-draw",
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: { "fill-color": "#00a0b0", "fill-opacity": 0.12 },
      });
      map.addLayer({
        id: "ov-draw-line",
        type: "line",
        source: "ov-draw",
        filter: ["==", ["geometry-type"], "LineString"],
        paint: { "line-color": "#00a0b0", "line-width": 2, "line-dasharray": [2, 1.5] },
      });
      map.addLayer({
        id: "ov-draw-vertex",
        type: "circle",
        source: "ov-draw",
        filter: ["==", ["geometry-type"], "Point"],
        paint: {
          "circle-radius": 4,
          "circle-color": "#ffffff",
          "circle-stroke-color": "#00a0b0",
          "circle-stroke-width": 2,
        },
      });

      // Network-explorer highlight layers (nw-*), driven via mapBus by the
      // details panel's Reservoir Network section.
      installNetworkLayers(map);

      // National inventory layer (nat-*): all ~57k modeled reservoirs beneath
      // the documented sites; hidden until toggled on under Layers.
      installNationalLayers(map);
      map.on("click", "nat-circles", (e: MapLayerMouseEvent) => {
        if (mapToolRef.current !== "none") return; // an armed Select session owns clicks
        // A documented site under the cursor wins — its own handler fires.
        if (map.queryRenderedFeatures(e.point, { layers: ["sites-circles"] }).length) return;
        const shortId = e.features?.[0]?.properties?.shortId as number | undefined;
        if (shortId == null) return;
        const siteId = siteByShortIdRef.current.get(shortId);
        if (siteId) actions.selectSite(siteId);
        else actions.selectReservoir(String(shortId));
      });
      map.on("mouseenter", "nat-circles", () => {
        if (mapToolRef.current === "none") map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "nat-circles", () => {
        if (mapToolRef.current === "none") map.getCanvas().style.cursor = "";
      });
      map.on("moveend", () => {
        // Debounced: rapid pans supersede each other instead of stacking fetches.
        scheduleOverlayRefresh(map, () => overlaysRef.current);
        setZoomTick(Math.round(map.getZoom() * 10) / 10);
      });

      loadedRef.current = true;
      // The constructor fitted the Default bounds; report the real zoom so the
      // zoom-gated overlay notes are accurate before the first moveend.
      setZoomTick(Math.round(map.getZoom() * 10) / 10);
      (map.getSource("sites") as GeoJSONSource).setData(sitesToGeoJSON(sitesRef.current));
      updateOverlays(map, overlaysRef.current);
      // National layer state set while the map was still loading applies now
      // (the store effects below early-return until loadedRef flips).
      updateNationalLayer(map, getCore(), siteByShortIdRef.current, nationalRef.current.on, nationalRef.current.metric);
      if (nationalRef.current.on && !getCore()) void ensureCore().catch(() => {});
      // The constructor always boots the USGS style so an offline start still
      // renders a map; the active basemap (default Esri, or a persisted
      // choice) applies right after install.
      if (basemapRef.current !== "usgs") void applyBasemap(map, basemapRef.current);
    });

    // Keep the canvas sized to the grid cell (panels collapse, drawers open,
    // the table divider drags, the window resizes). resize() zero-clears the
    // WebGL buffer and only SCHEDULES a repaint for the next frame — and RO
    // callbacks run after rAF, so without the synchronous redraw() every
    // resized frame would composite a blank (white) canvas: the divider-drag
    // flash. resize+redraw in one task is maplibre's own trackResize pattern,
    // minus its 50ms throttle (which would lag the divider); the built-in
    // observer is disabled via trackResize: false above.
    const ro = new ResizeObserver(() => {
      map.resize();
      map.redraw();
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      registerMapCommands(null);
      disposeOverlays(); // cancel timers/aborts before the map goes away
      resetNationalLayerMemo(); // the next map instance needs a fresh setData
      placeMarkerRef.current?.remove();
      placeMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
      loadedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Overlay visibility changes → sync layers + fetch what's now on.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    updateOverlays(map, state.overlays);
  }, [state.overlays]);

  // National inventory layer: visibility + metric. The one-time 57k setData
  // happens inside updateNationalLayer once the core arrives (the ensureCore
  // resolution flips sedimentStatus.core, re-running this effect).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    updateNationalLayer(map, getCore(), siteByShortId, state.nationalLayer.on, state.nationalLayer.metric);
    if (state.nationalLayer.on && !getCore()) void ensureCore().catch(() => {});
  }, [state.nationalLayer, state.sedimentStatus.core, siteByShortId]);

  // Basemap toggles → swap styles; app sources/layers ride across the swap.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    void applyBasemap(map, state.basemap);
  }, [state.basemap]);

  // Keep the source in sync with the filtered sites.
  const sitesRef = useRef(sites);
  sitesRef.current = sites;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    (map.getSource("sites") as GeoJSONSource | undefined)?.setData(sitesToGeoJSON(sites));
  }, [sites]);

  // Selection: highlight rings; popup + fly only for a single selection.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    // A Select gesture that just drew its basin/river/polygon outline flags
    // keepHighlightRef; every other selection change (table row, search, site
    // click, Clear) retires the outline along with the old selection.
    if (keepHighlightRef.current) keepHighlightRef.current = false;
    else (map.getSource("ov-select") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: [] });
    map.setFilter("sites-selected", ["in", ["get", "site_id"], ["literal", selectedIds]]);
    popupRef.current?.remove();
    popupRef.current = null;
    // Selecting sites (map click, table row, search) retires the temporary
    // place-search pin — the site popup and a stale pin never show together.
    if (selectedIds.length > 0) {
      placeMarkerRef.current?.remove();
      placeMarkerRef.current = null;
    }
    if (selectedIds.length !== 1) return;
    const site = siteById.get(selectedIds[0]);
    if (!site || site.longitude == null || site.latitude == null) return;
    popupRef.current = new Popup({ closeButton: true, maxWidth: "320px", offset: 10 })
      .setLngLat([site.longitude, site.latitude])
      .setHTML(popupHtml(site))
      .addTo(map);
    map.flyTo({ center: [site.longitude, site.latitude], zoom: Math.max(map.getZoom(), 8), duration: 700 });
  }, [selectedIds, siteById]);

  // Selected national reservoir: highlight ring + compact popup + fly-to.
  // Declared AFTER the site-selection effect so a site→reservoir switch runs
  // the site cleanup (popup removal) FIRST and this popup survives the commit;
  // the reverse switch clears the ring here, then the site effect popups.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const shortId = state.selectedReservoirId;
    setNationalSelected(map, shortId ? Number(shortId) : null);
    if (!shortId) return;
    const core = getCore();
    const row = core?.rowById.get(Number(shortId));
    if (!core || row == null) return; // core still loading — re-runs on status flip
    popupRef.current?.remove();
    placeMarkerRef.current?.remove();
    placeMarkerRef.current = null;
    popupRef.current = new Popup({ closeButton: true, maxWidth: "320px", offset: 10 })
      .setLngLat([core.lon[row], core.lat[row]])
      .setHTML(reservoirPopupHtml(core, row))
      .addTo(map);
    map.flyTo({ center: [core.lon[row], core.lat[row]], zoom: Math.max(map.getZoom(), 8), duration: 700 });
  }, [state.selectedReservoirId, state.sedimentStatus.core]);

  // Armed Select tool → one session per arming (selectTools.ts). The effect
  // cleanup IS the disarm path: Esc, Cancel/Done, one-shot completion, mode
  // switch, and unmount all run it.
  const sessionCtx = (map: MlMap): SessionCtx => ({
    map,
    container: containerRef.current!,
    boxEl: boxRef.current!,
    sites: () => sitesRef.current,
    setMsg: setToolMsg,
    riverRef,
    keepHighlightRef,
  });
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !containerRef.current || state.mapTool === "none") return;
    return startSelectSession(state.mapTool, sessionCtx(map));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.mapTool]);

  // Near-a-river refine stage: distance edits recompute the selection live.
  // Debounced so typing "25" doesn't apply at "2". `sites` stays out of the
  // deps deliberately — the filtered array's identity changes on every
  // selection, and depending on it would loop through selectSites.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || state.mapTool !== "river" || !riverRef.current) return;
    const t = setTimeout(() => recomputeRiver(sessionCtx(map)), 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.riverDistanceMiles, state.mapTool]);

  return (
    <div className="map-panel-wrap">
      <div ref={containerRef} className="map-panel" role="application" aria-label="Map of reservoir sediment sites" />
      <div ref={boxRef} className="select-box" aria-hidden="true" />
      <div className="map-toolbar">
        <SearchControl sites={allSites} />
        <SelectMenu tool={state.mapTool} distance={state.riverDistanceMiles} hasSelection={selectedIds.length > 0} />
        <MapToolPanels state={state} zoom={zoomTick} />
        {state.mapTool !== "none" && (
          <SelectHintBar
            tool={state.mapTool}
            msg={toolMsg}
            distance={state.riverDistanceMiles}
            // HUC tool keys double as overlay keys; box/polygon resolve to
            // nothing and stay false.
            overlayLoading={state.overlayStatus[state.mapTool === "river" ? "rivers" : state.mapTool] === "loading"}
          />
        )}
      </div>
      {createPortal(<BasemapPicker basemap={state.basemap} status={state.basemapStatus} />, basemapHostRef.current)}
    </div>
  );
}
