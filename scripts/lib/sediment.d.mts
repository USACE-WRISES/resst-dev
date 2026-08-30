// Hand-maintained declarations for sediment.mjs — tsconfig has no allowJs, and
// tests/*.test.ts import these helpers. Keep in sync with the implementation.

export function fmtSig(v: number | null | undefined, sig: number): string;
export function fmtFixed(v: number | null | undefined, decimals: number): string;
export function buildJsonArray<T>(values: readonly T[], fmt: (v: T, i: number) => string): string;

export const GRID: readonly number[];
export function rattesCol(year: number): number;
export function gridStartIndex(yr0: number | null | undefined): number;
export function streamRattes(path: string, onRow: (shortId: number, cells: string[]) => void): Promise<number>;

export function parsePyIdList(str: string | null | undefined): number[];
export function canonNid(s: string | null | undefined): string;

export const ACFT_TO_M3: number;
export const AC_TO_M2: number;
export const PCF_TO_KGM3: number;
export const RESSED_STAT: { AREA: number; CAPACITY: number; SED_INTERVAL: number; DRY_WEIGHT: number };

export function canonSurveyMethod(v: string | null | undefined): string;
export function canonSurveySub(v: string | null | undefined): string;
export function tidyAgency(v: string | null | undefined): string;

export interface RessedSurvey {
  year: number;
  date: string;
  pool: string;
  method: string;
  sub: string;
  note: string;
  cap: number | null;
  area: number | null;
  sedTot: number | null;
  dryWt: number | null;
}
export interface RessedReservoir {
  id: string;
  name: string;
  nid: string;
  lon: number | null;
  lat: number | null;
  state: string;
  began: number | null;
  agency: string;
  supplier: string;
  surveys: RessedSurvey[];
}
export function normalizeRessed(json: unknown): {
  reservoirs: RessedReservoir[];
  dropped: { badYear: number };
  /** Surveys kept with a date but no public stat values. */
  dateOnly: number;
};
export function dedupeRessedNids(reservoirs: readonly RessedReservoir[]): Map<string, number>;

export function nameTokens(s: string | null | undefined): Set<string>;
export function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number;
export function haversineMeters(lon1: number, lat1: number, lon2: number, lat2: number): number;
