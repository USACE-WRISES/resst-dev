// The national inventory layer's metrics and styling: all ~57k modeled
// reservoirs (ResNet rows minus the synthetic mouth nodes), coloured by a
// picked RATTES metric. Deliberately NOT an OverlayDef — it has a metric
// picker, custom click routing, and screening filters. The drawing lives in
// leaflet/national.ts; everything here is pure and unit-tested.
//
// Design rules baked in:
// - The national dots render BELOW the documented sites, which itself
//   communicates how rare documented management is.
// - No labels for the national set (57k labels is the known perf trap).

import { M3_PER_ACFT, type SedimentCore } from "../sediment/types";
import type { NationalMetric } from "../state/store";

export const NAT_UNKNOWN = "#b8c2cb"; // no-storage / no-model rows

/** Sequential 5-step ramp (BuPu-ish): avoids the site red/yellow, selection
    cyan, Select teal, and the network purple/green. */
export const RAMP = ["#e0ecf4", "#9ebcda", "#8c96c6", "#8856a7", "#810f7c"];
/** Evidence categorical pair. */
export const EV_MEASURED = "#08519c";
export const EV_MODELED = "#9ecae1";

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

const r1 = (v: number) => Math.round(v * 10) / 10;

/** The metric's value for a core row (-1 for unknown numerics; the evidence
    class as is), rounded the way the screening readout rounds. */
export function metricValue(core: SedimentCore, row: number, metric: NationalMetric): number {
  switch (metric) {
    case "pctLost2025":
    case "pctLost2050": {
      const capOrig = core.capOrig[row];
      if (!(Number.isFinite(capOrig) && capOrig > 0)) return -1;
      const sed = metric === "pctLost2025" ? core.sed2025[row] : core.sed2050[row];
      return r1((100 * sed) / capOrig);
    }
    case "rate": {
      const rate = Number.isFinite(core.sed2025[row]) ? (core.sed2025[row] - core.sed2015[row]) / 10 : NaN;
      return Number.isFinite(rate) ? r1(rate / M3_PER_ACFT) : -1;
    }
    case "storage":
      return Number.isFinite(core.maxStor[row]) ? Math.round(core.maxStor[row] / M3_PER_ACFT) : -1;
    case "evidence":
      return core.evd[row];
  }
}

/** The colour a row gets under a metric: a step ramp for the numeric metrics
    (below the first stop = unknown; otherwise the last stop ≤ value), the
    measured/modeled pair for the evidence class. */
export function colorForRow(core: SedimentCore, row: number, metric: NationalMetric): string {
  const def = NATIONAL_METRICS[metric];
  const v = metricValue(core, row, metric);
  if (!def.stops) return v === 1 ? EV_MEASURED : EV_MODELED;
  let color = NAT_UNKNOWN;
  def.stops.forEach((stop, i) => {
    if (v >= stop) color = RAMP[Math.min(i, RAMP.length - 1)];
  });
  return color;
}

/** Radius multiplier from storage (sqrt-ish via log): 0.75×–1.9×. */
export function radiusScale(core: SedimentCore, row: number): number {
  const stor = core.maxStor[row];
  return Number.isFinite(stor) && stor > 0 ? Math.min(1.9, Math.max(0.75, 0.35 * Math.log10(stor) - 1)) : 0.75;
}

const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
/** circle-radius: 1.6·rs at MapLibre zoom 3 → 5·rs at zoom 9, linear between. */
export const natRadius = (rs: number, mapZoom: number): number => (1.6 + 3.4 * clamp01((mapZoom - 3) / 6)) * rs;
/** circle-opacity: 0.55 at zoom 3 → 0.85 at zoom 8. */
export const natOpacity = (mapZoom: number): number => 0.55 + 0.3 * clamp01((mapZoom - 3) / 5);
/** circle-stroke-width: none below zoom 6, 0.75 px from 6. */
export const natStrokeWidth = (mapZoom: number): number => (mapZoom >= 6 ? 0.75 : 0);
