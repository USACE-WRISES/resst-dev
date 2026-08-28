// Pure filtering engine — the behavioral core of RESST.
//
// Semantics are a verified port of the Experience Builder filter widgets
// (captured from live network where-clauses, then reproduced by REST query —
// see RESST-migration/07-assessment/RESST-migration-assessment.md §4):
//
//   - three independent filter domains: sites, site literature (entries),
//     general literature (surveys) — a filter never crosses domains;
//   - within one filter item, selected values combine with OR;
//   - across enabled items, AND;
//   - an enabled item with no values selected requires the field to be
//     non-blank (the widget's IS_NOT_BLANK guard, observed live);
//   - "contains" items match as substrings, "exact" items as whole
//     comma-delimited tokens; both case-insensitively, mirroring ArcGIS
//     hosted-layer LIKE/= behavior (the data carries case variants such as
//     "Flood Control" / "Flood control" that the current app treats as one).

export type FilterDomain = "sites" | "siteLit" | "generalLit";
export type MatchMode = "contains" | "exact";

export interface FilterDef {
  /** Stable key, `${domain}.${field}`. */
  key: string;
  domain: FilterDomain;
  /** Field name in the repo CSV schema for that domain's records. */
  field: string;
  label: string;
  match: MatchMode;
  /** Curated option list (order preserved from the current app). */
  options?: string[];
  /** Options are computed from the data at runtime instead. */
  dynamic?: boolean;
}

export interface FilterItemState {
  enabled: boolean;
  selected: string[];
}

export type FilterState = Record<string, FilterItemState>;

export const emptyItemState = (): FilterItemState => ({ enabled: false, selected: [] });

const isBlank = (v: unknown): boolean => v == null || String(v).trim() === "";

/** Case-insensitive substring match — ArcGIS `LIKE '%value%'`. */
export const containsValue = (field: unknown, value: string): boolean =>
  !isBlank(field) && String(field).toLowerCase().includes(value.toLowerCase());

/** Case-insensitive whole-token match against the comma-delimited field. */
export const hasToken = (field: unknown, value: string): boolean =>
  !isBlank(field) &&
  String(field)
    .split(",")
    .some((t) => t.trim().toLowerCase() === value.trim().toLowerCase());

export function recordMatchesItem(record: object, def: FilterDef, state: FilterItemState): boolean {
  if (!state.enabled) return true;
  const v = (record as Record<string, unknown>)[def.field];
  if (isBlank(v)) return false; // the IS_NOT_BLANK guard
  if (state.selected.length === 0) return true;
  const matchOne = def.match === "exact" ? hasToken : containsValue;
  return state.selected.some((sel) => matchOne(v, sel));
}

/** Apply every enabled filter of one domain (AND across items). */
export function applyFilters<T extends object>(
  records: T[],
  defs: FilterDef[],
  state: FilterState,
  domain: FilterDomain,
): T[] {
  const active = defs.filter((d) => d.domain === domain && state[d.key]?.enabled);
  if (active.length === 0) return records;
  return records.filter((r) => active.every((d) => recordMatchesItem(r, d, state[d.key]!)));
}

/** Distinct values for a dynamic filter item, case-insensitively deduplicated
 *  (first spelling wins), sorted alphabetically. */
export function dynamicOptions(records: object[], field: string): string[] {
  const seen = new Map<string, string>();
  for (const r of records) {
    const v = (r as Record<string, unknown>)[field];
    if (isBlank(v)) continue;
    for (const raw of String(v).split(",")) {
      const t = raw.trim();
      if (!t) continue;
      const key = t.toLowerCase();
      if (!seen.has(key)) seen.set(key, t);
    }
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}
