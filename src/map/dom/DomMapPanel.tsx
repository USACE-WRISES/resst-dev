// The Leaflet map panel: the same props, commands (mapBus), toolbar, popups
// and Select tools as the MapLibre panel, drawn with DOM elements and image
// tiles so it stays smooth where WebGL is software-rendered or streamed by a
// remote browser (see engine.ts). Loaded by dynamic import from MapHost, so
// Leaflet compiles to its own chunk.
//
// Not drawn here yet (Phase 2 of the transition): the national reservoir
// layer and its screening filter. The Layers popover says so in this engine,
// and a persisted "on" is switched off on mount so nothing claims to show it.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { L } from "./leaflet";
import type { MapPanelProps } from "../MapPanel";
import { actions } from "../../state/store";
import { registerMapCommands } from "../mapBus";
import { MapToolbar } from "../MapToolbar";
import { BasemapPicker } from "../BasemapPicker";
import { popupHtml, reservoirPopupHtml } from "../popupHtml";
import { startSelectSession, recomputeRiver, type RiverPick, type SessionCtx, type ToolMsg } from "../selectTools";
import type { ToolMap } from "../toolMap";
import { updateOverlays, scheduleOverlayRefresh, retryOverlay, disposeOverlays } from "../overlays";
import { getCore } from "../../sediment/data";
import { createPanes } from "./panes";
import { BASEMAP_TILES, createBasemapLayer } from "./basemap";
import { RING_STYLE, SiteMarkers } from "./sites";
import { SiteLabels } from "./labels";
import { openPopup } from "./popups";
import { createPlaceMarker } from "./placeMarker";
import { NetworkLayers } from "./network";
import { LeafletOverlays } from "./overlays";
import { createLeafletToolMap } from "./toolMapLeaflet";
import { lz, mz } from "./zoom";

// Initial view — the captured CONUS extent the original app opened on.
const CONUS_BOUNDS = L.latLngBounds([30.8881, -116.7544], [46.6079, -79.9282]);
/** Camera animations match the MapLibre panel's 700 ms (Leaflet counts seconds). */
const FLY = { duration: 0.7 };

/** Read-only handles for the e2e suite and console debugging. */
interface DomHandles {
  engine: "leaflet";
  counts(): {
    sites: number;
    selected: number;
    labels: number;
    network: number;
    basin: number;
    sketch: number;
    overlays: Record<string, number>;
  };
  basemapUrl(): string;
  isMoving(): boolean;
  tilesLoaded(): boolean;
}
type Handles = { __resstLeaflet?: L.Map; __resstDom?: DomHandles };

const roundZoom = (map: L.Map) => Math.round(mz(map.getZoom()) * 10) / 10;

export default function DomMapPanel({ sites, allSites, siteById, siteByShortId, state }: MapPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const toolMapRef = useRef<ToolMap | null>(null);
  const overlaysRef = useRef<LeafletOverlays | null>(null);
  const siteMarkersRef = useRef<SiteMarkers | null>(null);
  const labelsRef = useRef<SiteLabels | null>(null);
  const networkRef = useRef<NetworkLayers | null>(null);
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
  const overlaysVisibleRef = useRef(state.overlays);
  overlaysVisibleRef.current = state.overlays;
  const basemapRef = useRef(state.basemap);
  basemapRef.current = state.basemap;
  const nationalRef = useRef(state.nationalLayer);
  nationalRef.current = state.nationalLayer;
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
      // No on-map attribution control (parity with the MapLibre panel); the
      // credits live in the footer's basemap label and Help → About.
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
        // Inside the map container, unlike MapLibre's control corner, so
        // clicks and wheel events must not reach the map.
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
    const select = L.layerGroup().addTo(map);
    const sketch = L.layerGroup().addTo(map);
    const toolMap = createLeafletToolMap(map, { select, sketch });
    toolMapRef.current = toolMap;

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
    // Phase 1: no national layer in this engine. A persisted "on" would show
    // a checked box drawing nothing (and Screening would claim to filter it).
    if (nationalRef.current.on) actions.setNationalLayer(false);

    const handles = window as unknown as Handles;
    handles.__resstLeaflet = map;
    handles.__resstDom = {
      engine: "leaflet",
      counts: () => ({
        sites: siteMarkers.markers.size,
        selected: ringsRef.current.size,
        labels: labels.count,
        network: network.count,
        basin: network.basinCount,
        sketch: sketch.getLayers().length,
        overlays: overlays.counts(),
      }),
      basemapUrl: () => BASEMAP_TILES[basemapRef.current],
      isMoving: () => movingRef.current,
      tilesLoaded: () => tilesLoadedRef.current,
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
      basemapLayerRef.current = null;
      delete handles.__resstLeaflet;
      delete handles.__resstDom;
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
      <MapToolbar engine="leaflet" state={state} allSites={allSites} siteByShortId={siteByShortId} zoom={zoomTick} toolMsg={toolMsg} />
      {createPortal(<BasemapPicker basemap={state.basemap} status={state.basemapStatus} />, basemapHostRef.current)}
    </div>
  );
}
