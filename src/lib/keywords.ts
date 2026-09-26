// Keyword statistics shared by the Dashboard charts and the Library facets.
// A keyword field is a comma list; a record with two keywords counts once
// under each. Tallies key on the lower-cased token (the data carries case
// variants such as "Water supply" and "Water Supply") and label each group
// with its most frequent spelling. "Not applicable" in its several spellings
// is data absence, never a keyword. Pure: unit-tested in Node.

import { splitKeywords } from "./display";

/** Spellings of "not applicable" found in the data (compared lower-cased). */
export const NA_TOKENS: ReadonlySet<string> = new Set(["not applicable", "na", "n/a", "not_applicable"]);

export const isNaToken = (token: string): boolean => NA_TOKENS.has(token.trim().toLowerCase());

/** A keyword field's real values: comma-split, trimmed, deduplicated, NA dropped. */
export const keywordTokens = (raw: string | null | undefined): string[] => splitKeywords(raw).filter((t) => !isNaToken(t));

export interface Tally<T> {
  /** Lower-cased token. */
  key: string;
  /** The most frequent spelling. */
  label: string;
  /** Records carrying the keyword. */
  count: number;
  items: T[];
}

export interface RecordTally<T> {
  total: number;
  /** Records with at least one real keyword. */
  withValue: number;
  /** Records with more than one keyword (their counts overlap). */
  multi: number;
  /** Largest first, ties alphabetical. */
  tallies: Tally<T>[];
}

/** Tally records by the tokens `tokensOf` yields for each. */
export function tallyRecords<T>(records: readonly T[], tokensOf: (record: T) => string[]): RecordTally<T> {
  const groups = new Map<string, { spellings: Map<string, number>; items: T[] }>();
  let withValue = 0;
  let multi = 0;
  for (const r of records) {
    const tokens = tokensOf(r);
    if (tokens.length === 0) continue;
    withValue++;
    if (tokens.length > 1) multi++;
    for (const t of tokens) {
      const key = t.toLowerCase();
      let g = groups.get(key);
      if (!g) groups.set(key, (g = { spellings: new Map(), items: [] }));
      g.spellings.set(t, (g.spellings.get(t) ?? 0) + 1);
      g.items.push(r);
    }
  }
  const tallies: Tally<T>[] = [];
  for (const [key, g] of groups) {
    let label = key;
    let best = 0;
    for (const [spelling, n] of g.spellings) {
      if (n > best) {
        best = n;
        label = spelling;
      }
    }
    tallies.push({ key, label, count: g.items.length, items: g.items });
  }
  tallies.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  return { total: records.length, withValue, multi, tallies };
}

/** Tally records by one comma-list keyword field. */
export function tallyKeyword<T extends object>(records: readonly T[], field: keyof T & string): RecordTally<T> {
  return tallyRecords(records, (r) => keywordTokens(String((r as Record<string, unknown>)[field] ?? "")));
}

/** A chart's slices: the largest `max` tallies, the rest merged into one
    "Other" slice (only when that slice would hold at least two keywords).
    Items are deduplicated by `idOf`; the merged count stays the keyword
    mentions, so the slice keeps its share of the chart. */
export function groupOther<T>(tallies: Tally<T>[], max: number, idOf: (item: T) => string): Tally<T>[] {
  if (tallies.length <= max + 1) return tallies;
  const rest = tallies.slice(max);
  const seen = new Set<string>();
  const items: T[] = [];
  let count = 0;
  for (const t of rest) {
    count += t.count;
    for (const it of t.items) {
      const id = idOf(it);
      if (seen.has(id)) continue;
      seen.add(id);
      items.push(it);
    }
  }
  return [...tallies.slice(0, max), { key: "other", label: `Other (${rest.length} keywords)`, count, items }];
}
