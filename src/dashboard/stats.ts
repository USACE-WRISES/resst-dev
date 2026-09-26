// The Dashboard's national statistics over the documented database and the
// modeled inventory. Everything is computed from the loaded data, nothing is
// hard-coded, and every rule is the one the rest of the app already applies:
// the map legend's loss classes (nationalLayer.ts), the Screening panel's
// quadrants and thresholds (screen.ts), the crosswalk's documented set.
// Mouth rows never count as reservoirs. Pure: unit-tested in Node.

import type { Site } from "../lib/types";
import type { SiteDim } from "../state/store";
import { FLAG, type SedimentCore, type SiteSedimentLink } from "../sediment/types";
import { pctLost } from "../sediment/format";
import { metricValue, NATIONAL_METRICS } from "../map/nationalLayer";
import { EMPTY_SCREENING, GAP_PRESETS, screenCore, withPreset, type GapPreset } from "../sediment/screen";
import { codeForName } from "./states";

export { NA_TOKENS, isNaToken, keywordTokens, tallyKeyword, tallyRecords, groupOther } from "../lib/keywords";

/** The site keyword fields the Dashboard charts (the free-text agency field is not one). */
export const SITE_DIMS: ReadonlyArray<{ field: SiteDim; label: string; noun: string }> = [
  { field: "sediment_release", label: "Sediment release", noun: "a sediment release method" },
  { field: "ecological_concern", label: "Ecological concern", noun: "an ecological concern" },
  { field: "analysis", label: "Analysis", noun: "an analysis" },
  { field: "site_type", label: "Site type", noun: "a site type" },
];

/** Modeled share of original capacity lost by 2025 for an inventory row (null = not modeled). */
export const rowPct = (core: SedimentCore, row: number): number | null => pctLost(core.sed2025[row], core.capOrig[row]);

/** Row indexes of the modeled reservoirs (mouth rows excluded). */
export function damRows(core: SedimentCore): number[] {
  const out: number[] = [];
  for (let r = 0; r < core.n; r++) if (!(core.flags[r] & FLAG.MOUTH)) out.push(r);
  return out;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// ------------------------------------------------------ loss classes -------

export interface LossClass {
  key: string;
  label: string;
  color: string;
  count: number;
  rows: number[];
}

/** Reservoirs per map-legend class of percent capacity lost by 2025: the
    same rounding and breaks that colour the national layer. */
export function lossClasses(core: SedimentCore): LossClass[] {
  const def = NATIONAL_METRICS.pctLost2025;
  const legend = def.legend; // top = highest class; last = unknown
  const stops = def.stops!;
  const classes: LossClass[] = stops.map((_, i) => {
    const entry = legend[stops.length - 1 - i];
    return { key: `class-${i}`, label: entry.label, color: entry.color, count: 0, rows: [] };
  });
  const unknown: LossClass = { key: "unknown", label: "Not modeled", color: legend[legend.length - 1].color, count: 0, rows: [] };
  for (const r of damRows(core)) {
    const v = metricValue(core, r, "pctLost2025");
    let cls = unknown;
    if (v >= 0) {
      let i = 0;
      stops.forEach((stop, k) => {
        if (v >= stop) i = k;
      });
      cls = classes[i];
    }
    cls.count++;
    cls.rows.push(r);
  }
  return [...classes, unknown];
}

// ---------------------------------------------------------- quadrants ------

export interface Quadrant {
  preset: GapPreset;
  count: number;
  rows: number[];
}

export interface QuadrantStats {
  list: Quadrant[];
  /** Modeled reservoirs (the denominator). */
  dams: number;
  /** Reservoirs with no modeled loss: in neither loss column. */
  unknown: number;
  /** Reservoirs at exactly 25%: in both loss columns (inclusive bounds). */
  overlap: number;
}

/** The four gap-analysis quadrants exactly as the Screening panel counts them
    before any refinement. */
export function quadrantStats(core: SedimentCore, documentedIds: ReadonlySet<number>): QuadrantStats {
  const list = GAP_PRESETS.map((preset) => {
    const s = screenCore(core, documentedIds, withPreset(EMPTY_SCREENING, preset));
    return { preset, count: s.matches, rows: s.rows };
  });
  let dams = 0;
  let unknown = 0;
  let overlap = 0;
  for (const r of damRows(core)) {
    dams++;
    const p = rowPct(core, r);
    if (p == null) unknown++;
    else if (p === 25) overlap++;
  }
  return { list, dams, unknown, overlap };
}

// ------------------------------------------------------------ states -------

export interface StateStat {
  /** Index into core.dicts.state. */
  idx: number;
  name: string;
  code: string | null;
  dams: number;
  /** Reservoirs at 25% or more lost by the Screening rule (unrounded, inclusive). */
  high: number;
  rows: number[];
}

export interface StateStats {
  states: StateStat[];
  /** Reservoirs with no state recorded. */
  blank: number;
}

/** Reservoirs and high-loss reservoirs per state, by the Screening rule, so a
    state's count is what "Screen this state" finds on the map. */
export function byState(core: SedimentCore): StateStats {
  const states: StateStat[] = core.dicts.state.map((name, idx) => ({ idx, name, code: codeForName(name), dams: 0, high: 0, rows: [] }));
  let blank = 0;
  for (const r of damRows(core)) {
    const idx = core.state[r];
    if (idx < 0 || idx >= states.length) {
      blank++;
      continue;
    }
    const st = states[idx];
    st.dams++;
    st.rows.push(r);
    const p = rowPct(core, r);
    if (p != null && p >= 25) st.high++;
  }
  return { states, blank };
}

// ---------------------------------------------------------- headline -------

export interface VolumeSum {
  dams: number;
  capOrig: number;
  sed2025: number;
}

export interface Headline extends VolumeSum {
  /** Sediment as a share of original capacity, summed nationally. */
  pctVolume: number | null;
  /** Median share lost per modeled reservoir. */
  median: number | null;
  documented: VolumeSum;
}

const sumRows = (core: SedimentCore, rows: Iterable<number>): VolumeSum => {
  const out = { dams: 0, capOrig: 0, sed2025: 0 };
  for (const r of rows) {
    out.dams++;
    const cap = core.capOrig[r];
    const sed = core.sed2025[r];
    if (Number.isFinite(cap) && Number.isFinite(sed)) {
      out.capOrig += cap;
      out.sed2025 += sed;
    }
  }
  return out;
};

export function nationalHeadline(core: SedimentCore, documentedIds: ReadonlySet<number>): Headline {
  const rows = damRows(core);
  const all = sumRows(core, rows);
  const documented = sumRows(
    core,
    rows.filter((r) => documentedIds.has(core.ids[r])),
  );
  const pcts: number[] = [];
  for (const r of rows) {
    const p = rowPct(core, r);
    if (p != null) pcts.push(p);
  }
  return {
    ...all,
    pctVolume: all.capOrig > 0 ? (100 * all.sed2025) / all.capOrig : null,
    median: median(pcts),
    documented,
  };
}

// ------------------------------------------------- sites and reservoirs ----

/** ResNet ShortID → every RESST site linked to it (the crosswalk links some
    dams to two or three sites; data.ts's siteByShortId keeps only one). */
export function sitesByShortId(siteSediment: ReadonlyMap<string, SiteSedimentLink>): Map<number, string[]> {
  const out = new Map<number, string[]>();
  for (const link of siteSediment.values()) {
    const list = out.get(link.short_id);
    if (list) list.push(link.site_id);
    else out.set(link.short_id, [link.site_id]);
  }
  return out;
}

export interface LinkedLoss {
  /** Sites linked to a modeled reservoir with a modeled loss. */
  linked: number;
  median: number | null;
  /** Linked sites at 25% or more lost. */
  high: number;
}

/** Modeled 2025 loss across a set of documented sites, from the crosswalk's headline values. */
export function linkedLoss(sites: readonly Site[], siteSediment: ReadonlyMap<string, SiteSedimentLink>): LinkedLoss {
  const pcts: number[] = [];
  for (const s of sites) {
    const link = siteSediment.get(s.site_id);
    if (!link) continue;
    const p = pctLost(link.sed2025_m3, link.cap_orig_m3);
    if (p != null) pcts.push(p);
  }
  return { linked: pcts.length, median: median(pcts), high: pcts.filter((p) => p >= 25).length };
}

/** The `n` largest reservoirs by original capacity (storage when unmodeled). */
export function topByStorage(core: SedimentCore, rows: readonly number[], n: number): number[] {
  const size = (r: number) => (Number.isFinite(core.capOrig[r]) ? core.capOrig[r] : Number.isFinite(core.maxStor[r]) ? core.maxStor[r] : 0);
  return [...rows].sort((a, b) => size(b) - size(a)).slice(0, n);
}

/** A reservoir's display name; ResNet leaves some blank. */
export const reservoirName = (core: SedimentCore, row: number): string => core.names[row] || `NID ${core.nids[row]}`;
