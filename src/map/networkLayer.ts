// The network-explorer highlight, as data: upstream dams, the downstream
// chain with a dashed SCHEMATIC connector (straight dam-to-dam segments,
// explicitly not the river course), and the river-mouth node (labeled). The
// map (leaflet/network.ts) and the report's snapshot figure both draw from
// this one builder.
//
// Upstream renders as dots only — a Missouri-basin dam has tens of thousands
// of upstream reservoirs, and a straight-line tree at that scale is noise;
// the single downstream chain is where the connector earns its place.

import type { Feature } from "geojson";
import { FLAG, type SedimentCore } from "../sediment/types";
import { downstreamChain, upstreamSet } from "../sediment/network";
import type { NetworkMode } from "../state/store";

export interface NetworkFeatureSet {
  features: Feature[];
  /** Highlighted coordinates (selected dam first) for view fitting. */
  coords: Array<[number, number]>;
}

/**
 * Pure feature builder for a network highlight. Features carry a `kind`
 * property: up / down / mouth (with `name`) / conn.
 */
export function buildNetworkFeatures(core: SedimentCore, row: number, mode: Exclude<NetworkMode, "none">): NetworkFeatureSet {
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
  return { features: feats, coords };
}
