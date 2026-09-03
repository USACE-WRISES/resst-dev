// The interactive map: Leaflet, drawing with DOM elements and image tiles.
// Chosen over WebGL because USACE workstations run the app through remote
// browser isolation, which streams every canvas from a cloud browser at a few
// frames per second while DOM content is mirrored and animates locally
// (notes/2026-09-02-usace-map-lag-isolation-and-plan.md). It boots on the
// persisted basemap (Esri's raster World Topographic Map by default, USGS
// Topo as the public-domain alternative), draws the filtered sites in the
// original app's symbology (red circles, yellow outline, blue name labels),
// and hosts the search box, the Select tools (selectTools.ts), the reference
// overlays, the network explorer highlight, and the national inventory layer.
//
// Selection drives the details panel, tables, popup, and highlight rings.
// The national inventory layer (all ~57k modeled reservoirs) is a canvas
// drawn from typed arrays (leaflet/national.ts); the map's own click handler
// routes a hit on one of its dots after the site markers above it have had
// theirs.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { L } from "./leaflet/leaflet";
import type { Site } from "../lib/types";
import { actions, type AppState } from "../state/store";
import { registerMapCommands } from "./mapBus";
import { MapToolbar } from "./MapToolbar";
import { BasemapPicker } from "./BasemapPicker";
import { popupHtml, reservoirPopupHtml } from "./popupHtml";
import { startSelectSession, recomputeRiver, type RiverPick, type SessionCtx, type ToolMsg } from "./selectTools";
import type { ToolMap } from "./toolMap";
import { updateOverlays, scheduleOverlayRefresh, retryOverlay, disposeOverlays } from "./overlays";
import { ensureCore, getCore } from "../sediment/data";
import { createPanes } from "./leaflet/panes";
import { BASEMAP_TILES, createBasemapLayer } from "./leaflet/basemap";
import { RING_STYLE, SiteMarkers } from "./leaflet/sites";
import { SiteLabels } from "./leaflet/labels";
import { openPopup } from "./leaflet/popups";
import { createPlaceMarker } from "./leaflet/placeMarker";
import { NetworkLayers } from "./leaflet/network";
import { NationalLayer } from "./leaflet/national";
import { LeafletOverlays } from "./leaflet/overlays";
import { createLeafletToolMap } from "./leaflet/toolMapLeaflet";
import { lz, mz } from "./leaflet/zoom";

export interface MapPanelProps {
  /** Filtered sites currently shown on the map. */
  sites: Site[];
  /** Full site list (search suggestions). */
  allSites: Site[];
  siteById: Map<string, Site>;
  /** ResNet ShortID → site_id — routes national-layer clicks on documented dams to the site experience. */
  siteByShortId: Map<number, string>;
  state: AppState;
}

// Initial view — the captured CONUS extent the original app opened on.
const CONUS_BOUNDS = L.latLngBounds([30.8881, -116.7544], [46.6079, -79.9282]);
/** Camera animations take 700 ms (Leaflet counts seconds). */
const FLY = { duration: 0.7 };

/** Read-only handles for the e2e suite and console debugging. Zooms and
    points use the app's 512 px zoom basis and lon/lat order, like the map
    commands, so specs never deal with Leaflet's conventions. */
interface MapHandles {
  counts(): {
    sites: number;
    selected: number;
    labels: number;
    network: number;
    basin: number;
    sketch: number;
    /** 1 while a completed Select highlight (basin / river corridor / polygon) is drawn. */
    highlight: number;
    national: number;
    reservoir: number;
    overlays: Record<string, number>;
  };
  /** Network highlight features by kind (up / down / mouth / conn). */
  networkKinds(): Record<string, number>;
  nationalVisible(): boolean;
  nationalMetric(): string;
  /** Whether screening currently masks the national dots. */
  screeningMasked(): boolean;
  basemapUrl(): string;
  isMoving(): boolean;
  tilesLoaded(): boolean;
  /** Camera helpers in the app's zoom basis (no animation). */
  jumpTo(lon: number, lat: number, zoom: number): void;
  getCenter(): { lng: number; lat: number };
  getZoom(): number;
  /** Container pixel of a lon/lat. */
  project(lon: number, lat: number): { x: number; y: number };
}
type Handles = { __resstMap?: L.Map; __resstMapInfo?: MapHandles };

const roundZoom = (map: L.Map) => Math.round(mz(map.getZoom()) * 10) / 10;

export function MapPanel({ sites, allSites, siteById, siteByShortId, state }: MapPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const toolMapRef = useRef<ToolMap | null>(null);
  const overlaysRef = useRef<LeafletOverlays | null>(null);
  const siteMarkersRef = useRef<SiteMarkers | null>(null);
  const labelsRef = useRef<SiteLabels | null>(null);
  const networkRef = useRef<NetworkLayers | null>(null);
  const natLayerRef = useRef<NationalLayer | null>(null);
  const basemapLayerRef = useRef<L.TileLayer | null>(null);
  const popupRef = useRef<L.Popup | null>(null);
  const placeMarkerRef = useRef<L.Marker | null>(null);
  const ringsRef = useRef(new Map<string, L.CircleMarker>());
  const reservoirRingRef = useRef<L.CircleMarker | null>(null);
  const networkCoordsRef = useRef<Array<[number, number]> | null>(null);
  const movingRef = useRef(false);
  const tilesLoadedRef = useRef(false);
  // Ref mirrors for the install-once closures.
  const mapToolRef = useRef(state.mapTool);
  mapToolRef.current = state.mapTool;
  const keepHighlightRef = useRef(false);
  const riverRef = useRef<RiverPick | null>(null);
  const sitesRef = useRef(sites);
  sitesRef.current = sites;
  const siteByIdRef = useRef(siteById);
  siteByIdRef.current = siteById;
  const siteByShortIdRef = useRef(siteByShortId);
  siteByShortIdRef.current = siteByShortId;
  const overlaysVisibleRef = useRef(state.overlays);
  overlaysVisibleRef.current = state.overlays;
  const basemapRef = useRef(state.basemap);
  basemapRef.current = state.basemap;
  const [toolMsg, setToolMsg] = useState<ToolMsg | null>(null);
  const [zoomTick, setZoomTick] = useState(4);
  const selectedIds = state.selectedSiteIds;
  // The basemap picker is React; Leaflet places its host in the top-right
  // control stack under the zoom buttons, and React portals into it.
  const basemapHostRef = useRef<HTMLDivElement | null>(null);
  if (!basemapHostRef.current) {
    const el = document.createElement("div");
    el.className = "basemap-host";
    basemapHostRef.current = el;
  }

  const retirePlaceMarker = () => {
    const pm = placeMarkerRef.current;
    placeMarkerRef.current = null;
    pm?.remove();
  };

  useEffect(() => {
    const el = containerRef.current;
    const host = basemapHostRef.current;
    if (!el || mapRef.current || !host) return;
    const map = L.map(el, {
      zoomControl: false,
      // No on-map attribution control (owner request); the credits live in
      // the footer's basemap label and Help → About → Credits.
      attributionControl: false,
      zoomSnap: 0.25,
      minZoom: lz(2),
      maxZoom: lz(17),
      worldCopyJump: false,
    });
    mapRef.current = map;
    createPanes(map);
    // Before any listener, so the initial fit is not a "gesture".
    map.fitBounds(CONUS_BOUNDS, { padding: [20, 20], animate: false });
    L.control.zoom({ position: "topright" }).addTo(map);
    const PickerControl = L.Control.extend({
      onAdd() {
        // Inside the map container, so clicks and wheel events on the picker
        // must not reach the map.
        L.DomEvent.disableClickPropagation(host);
        L.DomEvent.disableScrollPropagation(host);
        return host;
      },
      onRemove() {
        /* the host div outlives the control */
      },
    });
    new PickerControl({ position: "topright" }).addTo(map);
    L.control.scale({ imperial: true, metric: false, position: "bottomleft" }).addTo(map);

    const overlays = new LeafletOverlays(map, () => movingRef.current);
    overlaysRef.current = overlays;
    const siteMarkers = new SiteMarkers(map, (id) => {
      if (mapToolRef.current !== "none") return; // an armed Select session owns clicks
      actions.selectSite(id);
    });
    siteMarkersRef.current = siteMarkers;
    const labels = new SiteLabels(
      map,
      () => siteMarkers.markers,
      (id) => siteByIdRef.current.get(id)?.site_name ?? id,
    );
    labelsRef.current = labels;
    const network = new NetworkLayers(map);
    networkRef.current = network;
    const national = new NationalLayer(map);
    natLayerRef.current = national;
    const select = L.layerGroup().addTo(map);
    const sketch = L.layerGroup().addTo(map);
    const toolMap = createLeafletToolMap(map, { select, sketch });
    toolMapRef.current = toolMap;

    // National dots. The site markers sit above the canvas and handle their
    // own clicks (the map click still bubbles), so a click that reached a
    // marker is not ours; otherwise the dot under the pointer is routed — a
    // documented dam to its site experience, any other to ReservoirDetails.
    map.on("click", (e: L.LeafletMouseEvent) => {
      if (mapToolRef.current !== "none") return; // an armed Select session owns clicks
      const target = e.originalEvent.target as Element | null;
      if (target?.closest?.(".leaflet-interactive")) return;
      const core = getCore();
      const row = national.hitTest(map.mouseEventToContainerPoint(e.originalEvent));
      if (row == null || !core) return;
      const shortId = core.ids[row];
      const siteId = siteByShortIdRef.current.get(shortId);
      if (siteId) actions.selectSite(siteId);
      else actions.selectReservoir(String(shortId));
    });
    let hoverPending = false;
    map.on("mousemove", (e: L.LeafletMouseEvent) => {
      if (hoverPending || mapToolRef.current !== "none") return;
      hoverPending = true;
      const pt = map.mouseEventToContainerPoint(e.originalEvent);
      requestAnimationFrame(() => {
        hoverPending = false;
        if (mapToolRef.current !== "none") return;
        el.style.cursor = national.hitTest(pt) != null ? "pointer" : "";
      });
    });

    map.on("movestart", () => {
      movingRef.current = true;
    });
    map.on("moveend", () => {
      movingRef.current = false;
      setZoomTick(roundZoom(map));
      labels.refresh();
      // Debounced: rapid pans supersede each other instead of stacking fetches.
      scheduleOverlayRefresh(overlays, () => overlaysVisibleRef.current);
    });
    map.on("zoomend", () => network.onZoomEnd());

    const fitCoords = (pts: Array<[number, number]>) => {
      const bounds = L.latLngBounds(pts.map(([lon, lat]) => [lat, lon] as [number, number]));
      map.flyToBounds(bounds, { padding: [60, 60], maxZoom: lz(9), ...FLY });
    };
    registerMapCommands({
      fitToSites(list) {
        const pts = list.filter((s) => s.longitude != null && s.latitude != null);
        if (!pts.length) return;
        const bounds = L.latLngBounds(pts.map((s) => [s.latitude!, s.longitude!] as [number, number]));
        map.flyToBounds(bounds, { padding: [60, 60], maxZoom: lz(10), ...FLY });
      },
      flyTo(lon, lat, zoom = 9) {
        map.flyTo([lat, lon], lz(Math.max(mz(map.getZoom()), zoom)), FLY);
      },
      showPlaceMarker(lon, lat, label) {
        retirePlaceMarker();
        const m = createPlaceMarker(map, lon, lat, label);
        // The pin is a temporary highlight: closing its popup (the ✕, or a map
        // click) dismisses the whole pin. Identity-guarded: removing the marker
        // closes its popup, which fires this again.
        m.on("popupclose", () => {
          if (placeMarkerRef.current === m) retirePlaceMarker();
        });
        placeMarkerRef.current = m;
      },
      clearPlaceMarker() {
        retirePlaceMarker();
      },
      refreshOverlay(key) {
        retryOverlay(overlays, key, overlaysVisibleRef.current);
      },
      highlightNetwork(row, mode) {
        const core = getCore();
        if (!core) return;
        if (mode === "none") {
          networkCoordsRef.current = null;
          network.clear();
          return;
        }
        const coords = network.show(core, row, mode);
        networkCoordsRef.current = coords;
        if (coords.length) fitCoords(coords);
      },
      clearNetworkHighlight() {
        networkCoordsRef.current = null;
        network.clear();
      },
      fitNetwork() {
        if (networkCoordsRef.current?.length) fitCoords(networkCoordsRef.current);
      },
      fitToPoints(pts) {
        if (pts.length) fitCoords(pts);
      },
      showBasin(feature) {
        network.showBasin(feature);
      },
      clearBasin() {
        network.clearBasin();
      },
    });

    setZoomTick(roundZoom(map));
    siteMarkers.sync(sitesRef.current);
    labels.refresh();
    updateOverlays(overlays, overlaysVisibleRef.current);

    const handles = window as unknown as Handles;
    handles.__resstMap = map;
    handles.__resstMapInfo = {
      counts: () => ({
        sites: siteMarkers.markers.size,
        selected: ringsRef.current.size,
        labels: labels.count,
        network: network.count,
        basin: network.basinCount,
        sketch: sketch.getLayers().length,
        highlight: select.getLayers().length,
        national: national.drawn,
        reservoir: reservoirRingRef.current ? 1 : 0,
        overlays: overlays.counts(),
      }),
      networkKinds: () => network.kinds(),
      nationalVisible: () => national.isVisible,
      nationalMetric: () => national.currentMetric,
      screeningMasked: () => national.isMasked,
      basemapUrl: () => BASEMAP_TILES[basemapRef.current],
      isMoving: () => movingRef.current,
      tilesLoaded: () => tilesLoadedRef.current,
      jumpTo: (lon, lat, zoom) => map.setView([lat, lon], lz(zoom), { animate: false }),
      getCenter: () => {
        const c = map.getCenter();
        return { lng: c.lng, lat: c.lat };
      },
      getZoom: () => mz(map.getZoom()),
      project: (lon, lat) => {
        const p = map.latLngToContainerPoint([lat, lon]);
        return { x: p.x, y: p.y };
      },
    };

    // Keep the map sized to the grid cell (panels collapse, drawers open, the
    // table divider drags). No blank-frame hazard here: Leaflet only
    // re-measures and re-centres.
    const ro = new ResizeObserver(() => map.invalidateSize({ animate: false }));
    ro.observe(el);

    return () => {
      ro.disconnect();
      registerMapCommands(null);
      disposeOverlays(); // cancel timers/aborts before the map goes away
      popupRef.current?.remove();
      popupRef.current = null;
      retirePlaceMarker();
      for (const r of ringsRef.current.values()) r.remove();
      ringsRef.current.clear();
      reservoirRingRef.current?.remove();
      reservoirRingRef.current = null;
      network.remove();
      national.remove();
      overlays.remove();
      labels.clear();
      siteMarkers.remove();
      map.remove();
      mapRef.current = null;
      toolMapRef.current = null;
      overlaysRef.current = null;
      siteMarkersRef.current = null;
      labelsRef.current = null;
      networkRef.current = null;
      natLayerRef.current = null;
      basemapLayerRef.current = null;
      delete handles.__resstMap;
      delete handles.__resstMapInfo;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Basemap: swap the tile layer (runs on mount too, adding the first one).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const old = basemapLayerRef.current;
    if (old) map.removeLayer(old);
    const layer = createBasemapLayer(state.basemap);
    tilesLoadedRef.current = false;
    layer.on("loading", () => {
      tilesLoadedRef.current = false;
    });
    layer.on("load", () => {
      tilesLoadedRef.current = true;
    });
    layer.addTo(map);
    basemapLayerRef.current = layer;
  }, [state.basemap]);

  // Overlay visibility changes → sync layers + fetch what's now on.
  useEffect(() => {
    const overlays = overlaysRef.current;
    if (!overlays) return;
    updateOverlays(overlays, state.overlays);
  }, [state.overlays]);

  // National inventory layer: visibility + metric. The core feeds the canvas
  // once per instance; the ensureCore resolution flips sedimentStatus.core,
  // which re-runs this effect.
  useEffect(() => {
    const nat = natLayerRef.current;
    if (!nat) return;
    const core = getCore();
    if (core) {
      nat.setCore(core);
      nat.setMetric(state.nationalLayer.metric);
      nat.setScreening(state.screening, new Set(siteByShortId.keys()));
    }
    nat.setVisible(state.nationalLayer.on);
    if (state.nationalLayer.on && !core) void ensureCore().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.nationalLayer, state.sedimentStatus.core, siteByShortId]);

  // Screening criteria hide the non-matching dots (the panel's count says
  // what is hidden).
  useEffect(() => {
    natLayerRef.current?.setScreening(state.screening, new Set(siteByShortId.keys()));
  }, [state.screening, siteByShortId]);

  // Keep the markers in sync with the filtered sites (a diff by id: the
  // array's identity changes on every selection).
  useEffect(() => {
    const markers = siteMarkersRef.current;
    if (!markers) return;
    markers.sync(sites);
    labelsRef.current?.refresh();
  }, [sites]);

  // Selection: highlight rings; popup + fly only for a single selection.
  useEffect(() => {
    const map = mapRef.current;
    const toolMap = toolMapRef.current;
    if (!map || !toolMap) return;
    // A Select gesture that just drew its basin/river/polygon outline flags
    // keepHighlightRef; every other selection change retires the outline.
    if (keepHighlightRef.current) keepHighlightRef.current = false;
    else toolMap.setHighlight(null);
    const rings = ringsRef.current;
    const wanted = new Set(selectedIds);
    for (const [id, r] of rings) {
      if (wanted.has(id)) continue;
      r.remove();
      rings.delete(id);
    }
    for (const id of selectedIds) {
      if (rings.has(id)) continue;
      const s = siteById.get(id);
      if (!s || s.longitude == null || s.latitude == null) continue;
      rings.set(id, L.circleMarker([s.latitude, s.longitude], RING_STYLE).addTo(map));
    }
    popupRef.current?.remove();
    popupRef.current = null;
    // Selecting sites retires the temporary place-search pin.
    if (selectedIds.length > 0) retirePlaceMarker();
    if (selectedIds.length !== 1) return;
    const site = siteById.get(selectedIds[0]);
    if (!site || site.longitude == null || site.latitude == null) return;
    popupRef.current = openPopup(map, site.longitude, site.latitude, popupHtml(site));
    map.flyTo([site.latitude, site.longitude], lz(Math.max(mz(map.getZoom()), 8)), FLY);
  }, [selectedIds, siteById]);

  // Selected national reservoir (reachable from Comparables even without the
  // national layer): ring + compact popup + fly-to. Declared after the site
  // effect for the same ordering reason as in the MapLibre panel.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    reservoirRingRef.current?.remove();
    reservoirRingRef.current = null;
    const shortId = state.selectedReservoirId;
    if (!shortId) return;
    const core = getCore();
    const row = core?.rowById.get(Number(shortId));
    if (!core || row == null) return; // core still loading — re-runs on status flip
    popupRef.current?.remove();
    retirePlaceMarker();
    const lon = core.lon[row];
    const lat = core.lat[row];
    reservoirRingRef.current = L.circleMarker([lat, lon], RING_STYLE).addTo(map);
    popupRef.current = openPopup(map, lon, lat, reservoirPopupHtml(core, row));
    map.flyTo([lat, lon], lz(Math.max(mz(map.getZoom()), 8)), FLY);
  }, [state.selectedReservoirId, state.sedimentStatus.core]);

  // Armed Select tool → one session per arming (selectTools.ts). The effect
  // cleanup IS the disarm path.
  const sessionCtx = (map: ToolMap): SessionCtx => ({
    map,
    boxEl: boxRef.current!,
    sites: () => sitesRef.current,
    setMsg: setToolMsg,
    riverRef,
    keepHighlightRef,
  });
  useEffect(() => {
    const map = toolMapRef.current;
    if (!map || state.mapTool === "none") return;
    return startSelectSession(state.mapTool, sessionCtx(map));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.mapTool]);

  // Near-a-river refine stage: distance edits recompute the selection live.
  useEffect(() => {
    const map = toolMapRef.current;
    if (!map || state.mapTool !== "river" || !riverRef.current) return;
    const t = setTimeout(() => recomputeRiver(sessionCtx(map)), 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.riverDistanceMiles, state.mapTool]);

  return (
    <div className="map-panel-wrap">
      <div ref={containerRef} className="map-panel" role="application" aria-label="Map of reservoir sediment sites" />
      <div ref={boxRef} className="select-box" aria-hidden="true" />
      <MapToolbar state={state} allSites={allSites} siteByShortId={siteByShortId} zoom={zoomTick} toolMsg={toolMsg} />
      {createPortal(<BasemapPicker basemap={state.basemap} />, basemapHostRef.current)}
    </div>
  );
}
