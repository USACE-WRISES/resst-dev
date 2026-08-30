// The national inventory layer: all ~57k modeled reservoirs (ResNet rows
// minus the synthetic mouth nodes) as one nat-reservoirs GeoJSON source,
// styled by a picked RATTES metric. Deliberately NOT an OverlayDef — it has
// a metric picker, custom click routing, and (later) screening filters.
//
// Design rules baked in:
// - nat-circles renders BELOW sites-circles: the documented sites always
//   sit on top, which itself communicates how rare documented management is.
// - No text layer for the national set (57k labels is the known perf trap).
// - Metric switches are setPaintProperty only; screening will be setFilter —
//   the 57k-feature setData happens once per session.

import type { GeoJSONSource, Map as MlMap } from "maplibre-gl";
import type { DataDrivenPropertyValueSpecification, ExpressionSpecification } from "maplibre-gl";
import type { Feature, FeatureCollection } from "geojson";
import { FLAG, M3_PER_ACFT, type SedimentCore } from "../sediment/types";
import type { NationalMetric } from "../state/store";

export const NAT_UNKNOWN = "#b8c2cb"; // no-storage / no-model rows

/** Sequential 5-step ramp (BuPu-ish): avoids the site red/yellow, selection
    cyan, Select teal, and the network purple/green. */
const RAMP = ["#e0ecf4", "#9ebcda", "#8c96c6", "#8856a7", "#810f7c"];
/** Evidence categorical pair. */
const EV_MEASURED = "#08519c";
const EV_MODELED = "#9ecae1";

interface MetricDef {
  label: string;
  /** Feature property + ascending stops for the step ramp (numeric metrics). */
  prop: string;
  stops?: number[];
  /** Legend rows, top = highest. */
  legend: Array<{ color: string; label: string }>;
}

export const NATIONAL_METRICS: Record<NationalMetric, MetricDef> = {
  pctLost2025: {
    label: "Percent capacity lost (2025)",
    prop: "pl25",
    stops: [0, 10, 25, 50, 75],
    legend: [
      { color: RAMP[4], label: "≥75% lost" },
      { color: RAMP[3], label: "50–75%" },
      { color: RAMP[2], label: "25–50%" },
      { color: RAMP[1], label: "10–25%" },
      { color: RAMP[0], label: "<10%" },
      { color: NAT_UNKNOWN, label: "No storage / not modeled" },
    ],
  },
  pctLost2050: {
    label: "Projected percent lost (2050)",
    prop: "pl50",
    stops: [0, 10, 25, 50, 75],
    legend: [
      { color: RAMP[4], label: "≥75% lost by 2050" },
      { color: RAMP[3], label: "50–75%" },
      { color: RAMP[2], label: "25–50%" },
      { color: RAMP[1], label: "10–25%" },
      { color: RAMP[0], label: "<10%" },
      { color: NAT_UNKNOWN, label: "No storage / not modeled" },
    ],
  },
  rate: {
    label: "Est. annual sedimentation rate",
    prop: "rateAf",
    stops: [0, 10, 100, 1000, 10000],
    legend: [
      { color: RAMP[4], label: "≥10k ac-ft/yr" },
      { color: RAMP[3], label: "1k–10k" },
      { color: RAMP[2], label: "100–1k" },
      { color: RAMP[1], label: "10–100" },
      { color: RAMP[0], label: "<10 ac-ft/yr" },
      { color: NAT_UNKNOWN, label: "Not modeled" },
    ],
  },
  storage: {
    label: "Storage capacity",
    prop: "storAf",
    stops: [0, 1000, 10000, 100000, 1000000],
    legend: [
      { color: RAMP[4], label: "≥1M ac-ft" },
      { color: RAMP[3], label: "100k–1M" },
      { color: RAMP[2], label: "10k–100k" },
      { color: RAMP[1], label: "1k–10k" },
      { color: RAMP[0], label: "<1k ac-ft" },
    ],
  },
  evidence: {
    label: "RATTES model class",
    prop: "cls",
    legend: [
      { color: EV_MEASURED, label: "Survey-constrained (repeat surveys in the RATTES compilation)" },
      { color: EV_MODELED, label: "Statistical prediction" },
    ],
  },
};

/** circle-color expression for a metric (pure — unit-tested). */
export function paintForMetric(metric: NationalMetric): DataDrivenPropertyValueSpecification<string> {
  const def = NATIONAL_METRICS[metric];
  if (!def.stops) {
    return ["match", ["get", def.prop], 1, EV_MEASURED, EV_MODELED] as ExpressionSpecification;
  }
  const expr: unknown[] = ["step", ["get", def.prop], NAT_UNKNOWN];
  def.stops.forEach((stop, i) => expr.push(stop, RAMP[Math.min(i, RAMP.length - 1)]));
  return expr as ExpressionSpecification;
}

/**
 * Build the 57k-point FeatureCollection from the decoded core. Mouth nodes
 * are excluded (they are junction markers, not reservoirs). Properties are
 * precomputed for paint + screening; unknown numerics use -1 so step
 * expressions fall into the leading "unknown" color.
 */
export function buildNationalGeoJSON(core: SedimentCore, siteByShortId: ReadonlyMap<number, string>): FeatureCollection {
  const features: Feature[] = [];
  const r1 = (v: number) => Math.round(v * 10) / 10;
  for (let i = 0; i < core.n; i++) {
    if (core.flags[i] & FLAG.MOUTH) continue;
    const capOrig = core.capOrig[i];
    const hasCap = Number.isFinite(capOrig) && capOrig > 0;
    const pl25 = hasCap ? r1((100 * core.sed2025[i]) / capOrig) : -1;
    const pl50 = hasCap ? r1((100 * core.sed2050[i]) / capOrig) : -1;
    const rate = Number.isFinite(core.sed2025[i]) ? (core.sed2025[i] - core.sed2015[i]) / 10 : NaN;
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [core.lon[i], core.lat[i]] },
      properties: {
        row: i,
        shortId: core.ids[i],
        pl25,
        pl50,
        rateAf: Number.isFinite(rate) ? r1(rate / M3_PER_ACFT) : -1,
        storAf: Number.isFinite(core.maxStor[i]) ? Math.round(core.maxStor[i] / M3_PER_ACFT) : -1,
        ev: core.flags[i] & FLAG.HAS_SURVEYS ? 1 : 0,
        cls: core.evd[i],
        doc: siteByShortId.has(core.ids[i]) ? 1 : 0,
        term: core.flags[i] & FLAG.TERMINAL ? 1 : 0,
        st: core.state[i],
        own: core.owner[i],
        pur: core.purpose[i],
        // Radius multiplier from storage (sqrt-ish via log): 0.75×–1.9×.
        rs: Number.isFinite(core.maxStor[i]) && core.maxStor[i] > 0
          ? Math.min(1.9, Math.max(0.75, 0.35 * Math.log10(core.maxStor[i]) - 1))
          : 0.75,
      },
    });
  }
  return { type: "FeatureCollection", features };
}

export function installNationalLayers(map: MlMap): void {
  map.addSource("nat-reservoirs", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer(
    {
      id: "nat-circles",
      type: "circle",
      source: "nat-reservoirs",
      layout: { visibility: "none" },
      paint: {
        "circle-color": paintForMetric("pctLost2025"),
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          3,
          ["*", 1.6, ["get", "rs"]],
          9,
          ["*", 5, ["get", "rs"]],
        ],
        "circle-opacity": ["interpolate", ["linear"], ["zoom"], 3, 0.55, 8, 0.85],
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": ["step", ["zoom"], 0, 6, 0.75],
      },
    },
    "sites-circles",
  );
  map.addLayer(
    {
      id: "nat-selected",
      type: "circle",
      source: "nat-reservoirs",
      filter: ["==", ["get", "shortId"], -999999],
      paint: {
        "circle-radius": 9,
        "circle-color": "rgba(0,255,255,0.25)",
        "circle-stroke-color": "#00ffff",
        "circle-stroke-width": 2.5,
      },
    },
    "sites-circles",
  );
}

let appliedCore: SedimentCore | null = null;

/** Sync visibility/metric; feeds the source once per core (memoized). */
export function updateNationalLayer(
  map: MlMap,
  core: SedimentCore | null,
  siteByShortId: ReadonlyMap<number, string>,
  on: boolean,
  metric: NationalMetric,
): void {
  if (!map.getLayer("nat-circles")) return;
  map.setLayoutProperty("nat-circles", "visibility", on ? "visible" : "none");
  map.setLayoutProperty("nat-selected", "visibility", on ? "visible" : "none");
  if (!on || !core) return;
  if (appliedCore !== core) {
    (map.getSource("nat-reservoirs") as GeoJSONSource | undefined)?.setData(buildNationalGeoJSON(core, siteByShortId));
    appliedCore = core;
  }
  map.setPaintProperty("nat-circles", "circle-color", paintForMetric(metric));
}

/** Highlight ring for the selected national reservoir (null clears). */
export function setNationalSelected(map: MlMap, shortId: number | null): void {
  if (!map.getLayer("nat-selected")) return;
  map.setFilter("nat-selected", ["==", ["get", "shortId"], shortId ?? -999999]);
}

/** The applied-core memo must reset when the map instance is torn down. */
export function resetNationalLayerMemo(): void {
  appliedCore = null;
}
