// The interactive map: USGS National Map topo basemap (public domain, no API
// key — decision D4; a control under the zoom buttons toggles to the original
// app's Esri Topographic basemap) with the filtered Sites layer rendered in
// the current app's symbology: red circles, yellow outline, blue site-name
// labels above (ported from the service drawingInfo + web-map labelingInfo).
// Clicking a point selects the site; the Select tool drags a box to select
// several; the search box matches site names. Selection drives the details
// panel, tables, popup, and highlight rings.

import { useEffect, useRef, useState } from "react";
import {
  Map as MlMap,
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
import { MAP_VIEWS } from "../config/mapViews.generated";
import { registerMapCommands } from "./mapBus";
import { SearchControl } from "./SearchControl";
import { MapToolPanels } from "./MapToolPanels";
import { installOverlays, updateOverlays, scheduleOverlayRefresh, retryOverlay, disposeOverlays } from "./overlays";
import { applyBasemap, buildUsgsStyle } from "./basemaps";
import { BasemapControl } from "./BasemapControl";

// Initial view = the app's "Default" map view (the captured CONUS extent).
const DEFAULT_VIEW = MAP_VIEWS[0];

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

function popupHtml(site: Site): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const rows = SITE_DETAIL_FIELDS.filter((f) => f !== "site_name")
    .map((f) => {
      const v = site[f];
      return v ? `<div class="popup-row"><span>${esc(SITE_FIELD_LABELS[f] ?? f)}</span><b>${esc(String(v))}</b></div>` : "";
    })
    .join("");
  return `<div class="site-popup"><h3>${esc(site.site_name)}</h3>${rows}</div>`;
}

export function MapPanel({ sites, allSites, siteById, state }: {
  /** Filtered sites currently shown on the map. */
  sites: Site[];
  /** Full site list (search suggestions). */
  allSites: Site[];
  siteById: Map<string, Site>;
  state: AppState;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const popupRef = useRef<Popup | null>(null);
  const loadedRef = useRef(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const boxSelectActiveRef = useRef(state.boxSelectActive);
  boxSelectActiveRef.current = state.boxSelectActive;
  const selectedIds = state.selectedSiteIds;
  const overlaysRef = useRef(state.overlays);
  overlaysRef.current = state.overlays;
  const basemapRef = useRef(state.basemap);
  basemapRef.current = state.basemap;
  const [zoomTick, setZoomTick] = useState(4);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new MlMap({
      container: containerRef.current,
      style: buildUsgsStyle(),
      bounds: DEFAULT_VIEW.bounds,
      // Same padding the Views cards use, so picking "Default" reproduces this view.
      fitBoundsOptions: { padding: 20 },
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    // Read-only handle for the e2e suite (and console debugging).
    (window as unknown as { __resstMap?: MlMap }).__resstMap = map;
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new BasemapControl(), "top-right"); // stacks directly under the zoom buttons
    map.addControl(new ScaleControl({ unit: "imperial" }), "bottom-left");

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
      fitBounds(b) {
        map.fitBounds(new LngLatBounds([b[0], b[1]], [b[2], b[3]]), { padding: 20, duration: 700 });
      },
      refreshOverlay(key) {
        retryOverlay(map, key, overlaysRef.current);
      },
    });

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
        if (boxSelectActiveRef.current) return;
        const siteId = e.features?.[0]?.properties?.site_id as string | undefined;
        if (siteId) actions.selectSite(siteId);
      });
      map.on("mouseenter", "sites-circles", () => {
        if (!boxSelectActiveRef.current) map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "sites-circles", () => (map.getCanvas().style.cursor = ""));

      // Reference overlays render beneath the sites layers.
      installOverlays(map);
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
      // A persisted Esri choice applies after install; the constructor always
      // starts from the USGS style so an offline start still renders a map.
      if (basemapRef.current !== "usgs") void applyBasemap(map, basemapRef.current);
    });

    // Keep the canvas sized to the grid cell (panels collapse, drawers open,
    // the window resizes) — MapLibre doesn't observe its container itself.
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      registerMapCommands(null);
      disposeOverlays(); // cancel timers/aborts before the map goes away
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
    map.setFilter("sites-selected", ["in", ["get", "site_id"], ["literal", selectedIds]]);
    popupRef.current?.remove();
    popupRef.current = null;
    if (selectedIds.length !== 1) return;
    const site = siteById.get(selectedIds[0]);
    if (!site || site.longitude == null || site.latitude == null) return;
    popupRef.current = new Popup({ closeButton: true, maxWidth: "320px", offset: 10 })
      .setLngLat([site.longitude, site.latitude])
      .setHTML(popupHtml(site))
      .addTo(map);
    map.flyTo({ center: [site.longitude, site.latitude], zoom: Math.max(map.getZoom(), 8), duration: 700 });
  }, [selectedIds, siteById]);

  // Box-select tool: while armed, drag draws a rectangle; on release every
  // rendered (i.e., currently filtered) site inside it becomes selected.
  useEffect(() => {
    const map = mapRef.current;
    const container = containerRef.current;
    if (!map || !container) return;
    if (!state.boxSelectActive) return;

    map.dragPan.disable();
    map.getCanvas().style.cursor = "crosshair";
    let start: { x: number; y: number } | null = null;
    const boxEl = boxRef.current!;

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
      const x = Math.min(start.x, p.x), y = Math.min(start.y, p.y);
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
      const ids = features.map((f) => f.properties?.site_id as string).filter(Boolean);
      if (ids.length) actions.selectSites(ids);
      else actions.setBoxSelectActive(false);
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
      map.getCanvas().style.cursor = "";
    };
  }, [state.boxSelectActive]);

  return (
    <div className="map-panel-wrap">
      <div ref={containerRef} className="map-panel" role="application" aria-label="Map of reservoir sediment sites" />
      <div ref={boxRef} className="select-box" aria-hidden="true" />
      <div className="map-toolbar">
        <SearchControl sites={allSites} />
        <button
          type="button"
          className={state.boxSelectActive ? "map-tool active" : "map-tool"}
          aria-pressed={state.boxSelectActive}
          title="Select sites by dragging a box"
          onClick={() => actions.setBoxSelectActive(!state.boxSelectActive)}
        >
          ⬚ Select
        </button>
        <MapToolPanels state={state} zoom={zoomTick} />
      </div>
    </div>
  );
}
