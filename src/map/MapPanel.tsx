// The interactive map: USGS National Map topo basemap (public domain, no API
// key — decision D4) with the filtered Sites layer rendered in the current
// app's symbology: red circles, yellow outline, blue site-name labels above
// (ported from the service drawingInfo + web-map labelingInfo). Clicking a
// point selects the site (details panel + table sync); a popup mirrors the
// web map's site popup fields.

import { useEffect, useRef } from "react";
import {
  Map as MlMap,
  Popup,
  NavigationControl,
  ScaleControl,
  type GeoJSONSource,
  type MapLayerMouseEvent,
  type StyleSpecification,
} from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Site } from "../lib/types";
import { SITE_DETAIL_FIELDS, SITE_FIELD_LABELS } from "../config/fields";
import { actions } from "../state/store";

// Initial view ≈ the web map's saved extent (CONUS-wide).
const INITIAL_CENTER: [number, number] = [-91.6, 38.5];
const INITIAL_ZOOM = 3.4;

const BASE_STYLE: StyleSpecification = {
  version: 8,
  // Glyphs are required for the site-name text layer. TODO(M7): self-host the
  // font PBFs under public/fonts to remove the third-party dependency.
  glyphs: "https://fonts.openmaptiles.org/{fontstack}/{range}.pbf",
  sources: {
    usgsTopo: {
      type: "raster",
      tiles: ["https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      maxzoom: 16,
      attribution: "USGS The National Map: National Boundaries Dataset, 3DEP Elevation Program, Geographic Names Information System, National Hydrography Dataset, National Land Cover Database, National Structures Dataset, and National Transportation Dataset",
    },
  },
  layers: [
    { id: "background", type: "background", paint: { "background-color": "#e8ede9" } },
    { id: "usgs-topo", type: "raster", source: "usgsTopo" },
  ],
};

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

export function MapPanel({ sites, siteById, selectedSiteId }: {
  sites: Site[];
  siteById: Map<string, Site>;
  selectedSiteId: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const popupRef = useRef<Popup | null>(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new MlMap({
      container: containerRef.current,
      style: BASE_STYLE,
      center: INITIAL_CENTER,
      zoom: INITIAL_ZOOM,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new ScaleControl({ unit: "imperial" }), "bottom-left");

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
        filter: ["==", ["get", "site_id"], ""],
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
        const f = e.features?.[0];
        const siteId = f?.properties?.site_id as string | undefined;
        if (!siteId) return;
        actions.selectSite(siteId);
      });
      map.on("mouseenter", "sites-circles", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "sites-circles", () => (map.getCanvas().style.cursor = ""));

      loadedRef.current = true;
      (map.getSource("sites") as GeoJSONSource).setData(sitesToGeoJSON(sitesRef.current));
    });

    return () => {
      map.remove();
      mapRef.current = null;
      loadedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the source in sync with the filtered sites.
  const sitesRef = useRef(sites);
  sitesRef.current = sites;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    (map.getSource("sites") as GeoJSONSource | undefined)?.setData(sitesToGeoJSON(sites));
  }, [sites]);

  // Selection: highlight ring + popup, and fly to the site when selected
  // from outside the map (table row, search).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    map.setFilter("sites-selected", ["==", ["get", "site_id"], selectedSiteId ?? ""]);
    popupRef.current?.remove();
    popupRef.current = null;
    if (!selectedSiteId) return;
    const site = siteById.get(selectedSiteId);
    if (!site || site.longitude == null || site.latitude == null) return;
    popupRef.current = new Popup({ closeButton: true, maxWidth: "320px", offset: 10 })
      .setLngLat([site.longitude, site.latitude])
      .setHTML(popupHtml(site))
      .addTo(map);
    const target: [number, number] = [site.longitude, site.latitude];
    const cur = map.getCenter();
    const dist = Math.hypot(cur.lng - target[0], cur.lat - target[1]);
    if (dist > 0.0001) map.flyTo({ center: target, zoom: Math.max(map.getZoom(), 8), duration: 700 });
  }, [selectedSiteId, siteById]);

  return <div ref={containerRef} className="map-panel" role="application" aria-label="Map of reservoir sediment sites" />;
}
