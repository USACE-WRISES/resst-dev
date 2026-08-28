// Reference overlays (decision D6): loaded on demand from the same public
// services the current app uses, zoom-gated, all off by default. Feature
// overlays fetch the current viewport (bbox query, capped) on toggle and on
// map move; SSURGO renders as a WMS raster. A failed fetch degrades
// gracefully — the layer just stays empty (risk R5).

import type { Map as MlMap } from "maplibre-gl";
import type { GeoJSONSource } from "maplibre-gl";
import type { FeatureCollection } from "geojson";

export interface OverlayDef {
  key: string;
  label: string;
  kind: "points" | "lines" | "polygons" | "wms";
  url: string;
  /** Below this zoom the overlay is not fetched/drawn (matches the web map's scale gating). */
  minZoom: number;
  color: string;
  outFields?: string;
}

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
  {
    key: "huc2",
    label: "USGS HUC 2 boundaries",
    kind: "polygons",
    url: "https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/Watershed_Boundary_Dataset_HUC_2s/FeatureServer/0",
    minZoom: 2,
    color: "#6a3d9a",
    outFields: "huc2,name",
  },
  {
    key: "huc4",
    label: "USGS HUC 4 boundaries",
    kind: "polygons",
    url: "https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/Watershed_Boundary_Dataset_HUC_4s/FeatureServer/0",
    minZoom: 4,
    color: "#8e44ad",
    outFields: "huc4,name",
  },
  {
    key: "huc6",
    label: "USGS HUC 6 boundaries",
    kind: "polygons",
    url: "https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/Watershed_Boundary_Dataset_HUC_6s/FeatureServer/0",
    minZoom: 5,
    color: "#9b59b6",
    outFields: "huc6,name",
  },
  {
    key: "huc8",
    label: "USGS HUC 8 boundaries",
    kind: "polygons",
    url: "https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/Watershed_Boundary_Dataset_HUC_8s/FeatureServer/0",
    minZoom: 6,
    color: "#b07cc6",
    outFields: "huc8,name",
  },
  {
    key: "rivers",
    label: "North America Rivers",
    kind: "lines",
    url: "https://services7.arcgis.com/oF9CDB4lUYF7Um9q/arcgis/rest/services/North_America_Lakes_and_Rivers/FeatureServer/0",
    minZoom: 4,
    color: "#2980d9",
    outFields: "NAME",
  },
  {
    key: "ssurgo",
    label: "SSURGO Soils (USDA)",
    kind: "wms",
    url: "https://SDMDataAccess.sc.egov.usda.gov/Spatial/SDM.wms",
    minZoom: 12,
    color: "#c8a24b",
  },
];

const srcId = (key: string) => `ov-${key}`;
const layerId = (key: string) => `ov-${key}-layer`;

/** Add the (empty) sources/layers once, below the sites layers. */
export function installOverlays(map: MlMap): void {
  for (const def of OVERLAYS) {
    if (def.kind === "wms") {
      map.addSource(srcId(def.key), {
        type: "raster",
        tiles: [
          `${def.url}?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=mapunitpoly&STYLES=&FORMAT=image%2Fpng&TRANSPARENT=true&SRS=EPSG%3A3857&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}`,
        ],
        tileSize: 256,
        minzoom: def.minZoom,
        attribution: "USDA NRCS SSURGO",
      });
      map.addLayer(
        { id: layerId(def.key), type: "raster", source: srcId(def.key), layout: { visibility: "none" }, paint: { "raster-opacity": 0.6 } },
        "sites-circles",
      );
      continue;
    }
    map.addSource(srcId(def.key), { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    if (def.kind === "points") {
      map.addLayer(
        {
          id: layerId(def.key),
          type: "circle",
          source: srcId(def.key),
          layout: { visibility: "none" },
          paint: { "circle-radius": 4, "circle-color": def.color, "circle-opacity": 0.85, "circle-stroke-color": "#ffffff", "circle-stroke-width": 0.8 },
        },
        "sites-circles",
      );
    } else {
      map.addLayer(
        {
          id: layerId(def.key),
          type: "line",
          source: srcId(def.key),
          layout: { visibility: "none" },
          paint: { "line-color": def.color, "line-width": def.kind === "polygons" ? 1.4 : 1.2, "line-opacity": 0.9 },
        },
        "sites-circles",
      );
    }
  }
}

const lastFetch = new Map<string, string>();

async function fetchOverlay(map: MlMap, def: OverlayDef): Promise<void> {
  const b = map.getBounds();
  const bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].map((v) => v.toFixed(3)).join(",");
  const cacheKey = `${def.key}:${bbox}`;
  if (lastFetch.get(def.key) === cacheKey) return;
  lastFetch.set(def.key, cacheKey);
  const params = new URLSearchParams({
    where: "1=1",
    geometry: bbox,
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: def.outFields ?? "*",
    outSR: "4326",
    resultRecordCount: "2000",
    f: "geojson",
  });
  try {
    const res = await fetch(`${def.url}/query?${params}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const fc = (await res.json()) as FeatureCollection;
    if (!fc.features) throw new Error("no features in response");
    (map.getSource(srcId(def.key)) as GeoJSONSource | undefined)?.setData(fc);
  } catch (err) {
    console.warn(`Overlay ${def.key} failed to load; leaving it empty.`, err);
  }
}

/** Sync layer visibility + (re)fetch visible feature overlays for the viewport. */
export function updateOverlays(map: MlMap, visible: Record<string, boolean>): void {
  const zoom = map.getZoom();
  for (const def of OVERLAYS) {
    const lid = layerId(def.key);
    if (!map.getLayer(lid)) continue;
    const on = !!visible[def.key];
    map.setLayoutProperty(lid, "visibility", on ? "visible" : "none");
    if (on && def.kind !== "wms" && zoom >= def.minZoom) void fetchOverlay(map, def);
  }
}

/** Overlays currently gated out by zoom (for the layers panel hint). */
export function gatedOverlays(zoom: number, visible: Record<string, boolean>): string[] {
  return OVERLAYS.filter((d) => visible[d.key] && zoom < d.minZoom).map((d) => d.label);
}
