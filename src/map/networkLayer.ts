// The network-explorer map highlight: one nw-net GeoJSON source rendered by
// kind-filtered layers — upstream dams (purple), the downstream chain (green)
// with a dashed SCHEMATIC connector (straight dam-to-dam segments, explicitly
// not the river course), and the river-mouth node (navy, labeled). All ids
// are nw-prefixed so basemap swaps carry them (basemaps.ts predicates).
//
// Upstream renders as dots only — a Missouri-basin dam has tens of thousands
// of upstream reservoirs, and a straight-line tree at that scale is noise;
// the single downstream chain is where the connector earns its place.

import type { GeoJSONSource, Map as MlMap } from "maplibre-gl";
import type { Feature, FeatureCollection } from "geojson";
import { FLAG, type SedimentCore } from "../sediment/types";
import { downstreamChain, upstreamSet } from "../sediment/network";
import { NET_DOWN, NET_MOUTH, NET_UP } from "./palette";
import type { NetworkMode } from "../state/store";

const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };

export function installNetworkLayers(map: MlMap): void {
  map.addSource("nw-net", { type: "geojson", data: EMPTY });
  // Connector under the site circles; dam dots above circles but under the
  // selection ring; mouth node + label on top of everything.
  map.addLayer(
    {
      id: "nw-conn",
      type: "line",
      source: "nw-net",
      filter: ["==", ["get", "kind"], "conn"],
      paint: { "line-color": NET_DOWN, "line-width": 1.75, "line-dasharray": [2, 2], "line-opacity": 0.85 },
    },
    "sites-circles",
  );
  const dot = (id: string, kind: string, color: string) =>
    map.addLayer(
      {
        id,
        type: "circle",
        source: "nw-net",
        filter: ["==", ["get", "kind"], kind],
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 3, 9, 6],
          "circle-color": color,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1,
          "circle-opacity": 0.92,
        },
      },
      "sites-selected",
    );
  dot("nw-up", "up", NET_UP);
  dot("nw-down", "down", NET_DOWN);
  map.addLayer({
    id: "nw-mouth",
    type: "circle",
    source: "nw-net",
    filter: ["==", ["get", "kind"], "mouth"],
    paint: {
      "circle-radius": 7,
      "circle-color": NET_MOUTH,
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 2,
    },
  });
  map.addLayer({
    id: "nw-mouth-label",
    type: "symbol",
    source: "nw-net",
    filter: ["==", ["get", "kind"], "mouth"],
    minzoom: 4,
    layout: {
      "text-field": ["get", "name"],
      "text-font": ["Noto Sans Regular"],
      "text-size": 11,
      "text-anchor": "top",
      "text-offset": [0, 0.8],
      "text-optional": true,
    },
    paint: { "text-color": NET_MOUTH, "text-halo-color": "#f7f7f7", "text-halo-width": 1.2 },
  });
}

/**
 * Render the highlight for `row` in the given mode; returns the highlighted
 * coordinates (selected dam included) for fitting, or null when cleared.
 */
export function updateNetworkHighlight(
  map: MlMap,
  core: SedimentCore,
  row: number | null,
  mode: NetworkMode,
): Array<[number, number]> | null {
  const src = map.getSource("nw-net") as GeoJSONSource | undefined;
  if (!src) return null;
  if (row == null || mode === "none") {
    src.setData(EMPTY);
    return null;
  }
  const feats: Feature[] = [];
  const coords: Array<[number, number]> = [[core.lon[row], core.lat[row]]];
  const pt = (r: number, kind: string, withName = false): Feature => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [core.lon[r], core.lat[r]] },
    properties: withName ? { kind, name: core.names[r] } : { kind },
  });
  if (mode !== "down") {
    for (const r of upstreamSet(core, row)) {
      feats.push(pt(r, "up"));
      coords.push([core.lon[r], core.lat[r]]);
    }
  }
  if (mode !== "up") {
    const line: Array<[number, number]> = [[core.lon[row], core.lat[row]]];
    for (const r of downstreamChain(core, row)) {
      const isMouth = (core.flags[r] & FLAG.MOUTH) !== 0;
      feats.push(pt(r, isMouth ? "mouth" : "down", isMouth));
      line.push([core.lon[r], core.lat[r]]);
      coords.push([core.lon[r], core.lat[r]]);
    }
    if (line.length > 1) {
      feats.push({ type: "Feature", geometry: { type: "LineString", coordinates: line }, properties: { kind: "conn" } });
    }
  }
  src.setData({ type: "FeatureCollection", features: feats });
  return coords;
}
