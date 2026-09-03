// National screening: transparent, combinable criteria over the modeled
// inventory (never an opaque composite score — owner decision). One
// predicate, matchesRow(), serves the count readout, the CSV export, and the
// map (leaflet/national.ts masks the dots that fail it).
//
// "No documented management" means NOT crosswalked to a RESST site — exact
// and transparent (a fuzzy nearest-site radius would silently mask real gaps).

import { FLAG, M3_PER_ACFT, type SedimentCore } from "./types";

export interface ScreeningState {
  active: boolean;
  /** Percent-capacity-lost thresholds (2025). Min excludes unknowns; max also excludes unknowns. */
  pctLost2025Min: number | null;
  pctLost2025Max: number | null;
  pctLost2050Min: number | null;
  storageMinAcFt: number | null;
  rateMinAcFtYr: number | null;
  terminalOnly: boolean;
  surveyedOnly: boolean;
  documented: "any" | "documented" | "undocumented";
  /** Dictionary indexes into core.dicts (null = any). */
  state: number | null;
  owner: number | null;
  purpose: number | null;
}

export const EMPTY_SCREENING: ScreeningState = {
  active: false,
  pctLost2025Min: null,
  pctLost2025Max: null,
  pctLost2050Min: null,
  storageMinAcFt: null,
  rateMinAcFtYr: null,
  terminalOnly: false,
  surveyedOnly: false,
  documented: "any",
  state: null,
  owner: null,
  purpose: null,
};

/** The gap-analysis quadrants (ideas doc §7) as preset criteria. Wording
    guardrail: these surface "potential opportunities" and "reservoirs
    warranting further evaluation" — never "needs intervention". */
export const GAP_PRESETS: Array<{ key: string; label: string; hint: string; apply: Partial<ScreeningState> }> = [
  {
    key: "managed-high",
    label: "Documented + high sedimentation",
    hint: "Potential case studies: management underway where modeled losses are large",
    apply: { documented: "documented", pctLost2025Min: 25 },
  },
  {
    key: "managed-low",
    label: "Documented + low sedimentation",
    hint: "Possibly proactive management",
    apply: { documented: "documented", pctLost2025Max: 25 },
  },
  {
    key: "gap-high",
    label: "Undocumented + high sedimentation",
    hint: "Potential sediment-management opportunities warranting further evaluation",
    apply: { documented: "undocumented", pctLost2025Min: 25 },
  },
  {
    key: "gap-low",
    label: "Undocumented + low sedimentation",
    hint: "Lower current priority",
    apply: { documented: "undocumented", pctLost2025Max: 25 },
  },
];

const pctLost = (sed: number, capOrig: number): number | null =>
  Number.isFinite(capOrig) && capOrig > 0 && Number.isFinite(sed) ? (100 * sed) / capOrig : null;

/** Modeled-reservoir count (mouth nodes excluded). */
export function damCount(core: SedimentCore): number {
  let n = 0;
  for (let r = 0; r < core.n; r++) if (!(core.flags[r] & FLAG.MOUTH)) n++;
  return n;
}

/** JS predicate over a core row (mouth rows never match). */
export function matchesRow(core: SedimentCore, documentedShortIds: ReadonlySet<number>, row: number, s: ScreeningState): boolean {
  const flags = core.flags[row];
  if (flags & FLAG.MOUTH) return false;
  const pl25 = pctLost(core.sed2025[row], core.capOrig[row]);
  const pl50 = pctLost(core.sed2050[row], core.capOrig[row]);
  if (s.pctLost2025Min != null && (pl25 == null || pl25 < s.pctLost2025Min)) return false;
  if (s.pctLost2025Max != null && (pl25 == null || pl25 > s.pctLost2025Max)) return false;
  if (s.pctLost2050Min != null && (pl50 == null || pl50 < s.pctLost2050Min)) return false;
  if (s.storageMinAcFt != null && !(core.maxStor[row] / M3_PER_ACFT >= s.storageMinAcFt)) return false;
  if (s.rateMinAcFtYr != null) {
    const rate = (core.sed2025[row] - core.sed2015[row]) / 10 / M3_PER_ACFT;
    if (!Number.isFinite(rate) || rate < s.rateMinAcFtYr) return false;
  }
  if (s.terminalOnly && !(flags & FLAG.TERMINAL)) return false;
  if (s.surveyedOnly && !(flags & FLAG.HAS_SURVEYS)) return false;
  const doc = documentedShortIds.has(core.ids[row]);
  if (s.documented === "documented" && !doc) return false;
  if (s.documented === "undocumented" && doc) return false;
  if (s.state != null && core.state[row] !== s.state) return false;
  if (s.owner != null && core.owner[row] !== s.owner) return false;
  if (s.purpose != null && core.purpose[row] !== s.purpose) return false;
  return true;
}

export interface ScreenSummary {
  matches: number;
  total: number;
  rows: number[];
}

/** Count (and list) matching rows — 57k iterations, ~1 ms. */
export function screenCore(core: SedimentCore, documentedShortIds: ReadonlySet<number>, s: ScreeningState): ScreenSummary {
  const rows: number[] = [];
  let total = 0;
  for (let r = 0; r < core.n; r++) {
    if (core.flags[r] & FLAG.MOUTH) continue;
    total++;
    if (matchesRow(core, documentedShortIds, r, s)) rows.push(r);
  }
  return { matches: rows.length, total, rows };
}
