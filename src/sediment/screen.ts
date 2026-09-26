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

export interface GapPreset {
  key: string;
  /** The question as the Screening panel lists it. */
  title: string;
  /** The plain-language rule the question applies. */
  criteria: string;
  hint: string;
  apply: Partial<ScreeningState>;
}

/** The gap-analysis quadrants (ideas doc §7) as the Screening panel's
    starting questions, listed high-loss first. Each sets only the two
    quadrant dimensions (documented, 2025 loss); every other criterion is a
    refinement that survives switching questions. Wording guardrail: these
    surface "potential opportunities" and "reservoirs warranting further
    evaluation", never "needs intervention". A reservoir at exactly 25% sits
    in both loss rows, as the predicate's inclusive bounds have always had it. */
export const GAP_PRESETS: GapPreset[] = [
  {
    key: "managed-high",
    title: "Potential case studies",
    criteria: "Documented · 25% or more lost by 2025",
    hint: "Potential case studies: management underway where modeled losses are large",
    apply: { documented: "documented", pctLost2025Min: 25 },
  },
  {
    key: "gap-high",
    title: "Potential opportunities",
    criteria: "Not documented · 25% or more lost by 2025",
    hint: "Potential sediment-management opportunities warranting further evaluation",
    apply: { documented: "undocumented", pctLost2025Min: 25 },
  },
  {
    key: "managed-low",
    title: "Possibly proactive",
    criteria: "Documented · 25% or less lost by 2025",
    hint: "Possibly proactive management",
    apply: { documented: "documented", pctLost2025Max: 25 },
  },
  {
    key: "gap-low",
    title: "Lower current priority",
    criteria: "Not documented · 25% or less lost by 2025",
    hint: "Lower current priority",
    apply: { documented: "undocumented", pctLost2025Max: 25 },
  },
];

/** The criteria a question sets; applying one clears the others' values. */
const QUADRANT_RESET: Partial<ScreeningState> = { documented: "any", pctLost2025Min: null, pctLost2025Max: null };

/** Criteria after choosing a question: its quadrant values, refinements kept. */
export function withPreset(s: ScreeningState, preset: GapPreset): ScreeningState {
  return { ...s, ...QUADRANT_RESET, ...preset.apply };
}

/** Criteria after un-choosing the current question (refinements kept). */
export function withoutPreset(s: ScreeningState): ScreeningState {
  return { ...s, ...QUADRANT_RESET };
}

/** Whether the criteria currently answer this question (refinements may be added on top). */
export function presetMatches(s: ScreeningState, preset: GapPreset): boolean {
  return (
    s.documented === (preset.apply.documented ?? "any") &&
    s.pctLost2025Min === (preset.apply.pctLost2025Min ?? null) &&
    s.pctLost2025Max === (preset.apply.pctLost2025Max ?? null)
  );
}

/** Criteria the Refine section owns (everything a question leaves alone). */
const REFINE_DEFAULTS: Partial<ScreeningState> = {
  pctLost2050Min: null,
  storageMinAcFt: null,
  rateMinAcFtYr: null,
  terminalOnly: false,
  surveyedOnly: false,
  state: null,
  owner: null,
  purpose: null,
};

/** How many refinements (non-question criteria) are set. */
export function refineCount(s: ScreeningState): number {
  let n = 0;
  for (const [k, v] of Object.entries(REFINE_DEFAULTS)) if (s[k as keyof ScreeningState] !== v) n++;
  return n;
}

/** True when no criterion is set (screening then filters nothing). */
export function isEmptyScreening(s: ScreeningState): boolean {
  for (const [k, v] of Object.entries(EMPTY_SCREENING)) {
    if (k === "active") continue;
    if (s[k as keyof ScreeningState] !== v) return false;
  }
  return true;
}

/** Matching-reservoir count per question under the current refinements —
    exactly what choosing that question would show (4 × ~57k rows, a few ms). */
export function quadrantCounts(
  core: SedimentCore,
  documentedShortIds: ReadonlySet<number>,
  s: ScreeningState,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of GAP_PRESETS) out[p.key] = screenCore(core, documentedShortIds, withPreset(s, p)).matches;
  return out;
}

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
