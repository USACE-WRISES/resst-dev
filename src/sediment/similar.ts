// The comparable-reservoir finder: "my reservoir has this problem — show me
// similar reservoirs, preferring ones with documented management" (ideas doc
// #5, the workflow that routes users back into the team's case-study data).
//
// Gower-style weighted distance over log-scaled physical variables; a
// component missing on EITHER side drops out and the remaining weights
// renormalize. The score is a RELATIVE similarity index (documented as such
// in Help) — round(100·exp(−2d)) — not a probability of anything.

import { FLAG, type SedimentCore } from "./types";

/** Component weights — one const so the owner can retune deliberately. */
export const SIMILARITY_WEIGHTS = {
  logStorage: 0.25,
  logDrainageArea: 0.2,
  age: 0.15,
  pctLost2025: 0.2,
  logAnnualRate: 0.1,
  /** Categorical penalties (added to the distance, outside the Gower mix). */
  purposeMismatch: 0.05,
  stateMismatch: 0.05,
} as const;

export interface SimilarMatch {
  row: number;
  /** Relative similarity index, 0–100. */
  score: number;
}

export interface SimilarResults {
  /** Top analogs among RESST-documented reservoirs — the point of the feature. */
  documented: SimilarMatch[];
  /** Top analogs among everything else. */
  overall: SimilarMatch[];
}

interface Profile {
  logStorage: number | null;
  logDa: number | null;
  age: number | null;
  pctLost: number | null;
  logRate: number | null;
  purpose: number;
  state: number;
}

function profile(core: SedimentCore, row: number): Profile {
  const stor = core.maxStor[row];
  const da = core.da[row];
  const capOrig = core.capOrig[row];
  const sed25 = core.sed2025[row];
  const rate = (sed25 - core.sed2015[row]) / 10;
  return {
    logStorage: Number.isFinite(stor) && stor > 0 ? Math.log10(stor) : null,
    logDa: Number.isFinite(da) && da > 0 ? Math.log10(da) : null,
    age: core.yrc[row] > 0 ? 2025 - core.yrc[row] : null,
    pctLost: Number.isFinite(capOrig) && capOrig > 0 && Number.isFinite(sed25) ? (100 * sed25) / capOrig : null,
    logRate: Number.isFinite(rate) && rate > 0 ? Math.log10(rate) : null,
    purpose: core.purpose[row],
    state: core.state[row],
  };
}

/** Weighted Gower distance between two profiles (lower = more similar). */
export function profileDistance(a: Profile, b: Profile): number {
  const W = SIMILARITY_WEIGHTS;
  const parts: Array<[number | null, number | null, number, number]> = [
    [a.logStorage, b.logStorage, 3, W.logStorage],
    [a.logDa, b.logDa, 3, W.logDrainageArea],
    [a.age, b.age, 75, W.age],
    [a.pctLost, b.pctLost, 50, W.pctLost2025],
    [a.logRate, b.logRate, 3, W.logAnnualRate],
  ];
  let sum = 0;
  let weight = 0;
  for (const [va, vb, span, w] of parts) {
    if (va == null || vb == null) continue; // Gower: drop and renormalize
    sum += w * Math.min(1, Math.abs(va - vb) / span);
    weight += w;
  }
  let d = weight > 0 ? sum / weight : 1;
  if (a.purpose >= 0 && b.purpose >= 0 && a.purpose !== b.purpose) d += W.purposeMismatch;
  if (a.state >= 0 && b.state >= 0 && a.state !== b.state) d += W.stateMismatch;
  return d;
}

export const scoreFromDistance = (d: number): number => Math.round(100 * Math.exp(-2 * d));

/**
 * Rank every other reservoir against `targetRow`. Deterministic: ties break
 * on ascending ShortID. Mouth nodes and zero-storage rows never rank.
 */
export function findSimilar(
  core: SedimentCore,
  targetRow: number,
  documentedShortIds: ReadonlySet<number>,
  limits: { documented: number; overall: number } = { documented: 8, overall: 5 },
): SimilarResults {
  const target = profile(core, targetRow);
  const doc: Array<{ row: number; d: number }> = [];
  const rest: Array<{ row: number; d: number }> = [];
  for (let r = 0; r < core.n; r++) {
    if (r === targetRow) continue;
    if (core.flags[r] & FLAG.MOUTH) continue;
    if (!(core.maxStor[r] > 0)) continue;
    const d = profileDistance(target, profile(core, r));
    (documentedShortIds.has(core.ids[r]) ? doc : rest).push({ row: r, d });
  }
  const rank = (list: Array<{ row: number; d: number }>, n: number): SimilarMatch[] =>
    list
      .sort((x, y) => x.d - y.d || core.ids[x.row] - core.ids[y.row])
      .slice(0, n)
      .map((x) => ({ row: x.row, score: scoreFromDistance(x.d) }));
  return { documented: rank(doc, limits.documented), overall: rank(rest, limits.overall) };
}
