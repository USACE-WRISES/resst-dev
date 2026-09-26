// The Library's publication index: one record per literature survey (465),
// joined to its sites through the explicit entry links, with every keyword
// field tokenised once. Search, facets and sorting are pure functions over
// it, unit-tested in Node. Keyword statistics are always per publication:
// the entry table repeats a publication once per site.

import type { AppData, LiteratureSurvey, Site } from "../lib/types";
import type { LibrarySort, LibrarySortKey, LibraryState, LitScope } from "../state/store";
import { keywordTokens, tallyRecords, type Tally } from "../lib/keywords";

/** The survey's text fields (its coordinates are numbers). */
export type LitTextField = { [K in keyof LiteratureSurvey]: LiteratureSurvey[K] extends string ? K : never }[keyof LiteratureSurvey];

export interface LitField {
  field: LitTextField;
  label: string;
  /** Completes "publications record …". */
  noun: string;
}

/** The literature keyword fields with controlled vocabularies (Geography is
    free text and the four topic flags are booleans; neither is charted). */
export const LIT_FIELDS: readonly LitField[] = [
  { field: "purpose", label: "Purpose", noun: "a purpose" },
  { field: "sustainable_sediment_management", label: "Sustainable sediment management", noun: "a sediment management approach" },
  { field: "modeling", label: "Modeling", noun: "a modeling method" },
  { field: "data_collection", label: "Data collection", noun: "a data collection type" },
  { field: "adaptive_management", label: "Adaptive management", noun: "an adaptive management theme" },
  { field: "sediment_characteristic", label: "Sediment characteristic", noun: "a sediment characteristic" },
  { field: "sediment_source", label: "Sediment source", noun: "a sediment source" },
  { field: "document_type", label: "Document type", noun: "a document type" },
  { field: "risk_and_uncertainty", label: "Risk and uncertainty", noun: "a risk or uncertainty theme" },
  { field: "special_cases", label: "Special cases", noun: "a special case" },
  { field: "land_use", label: "Land use", noun: "a land use" },
  { field: "channel_type", label: "Channel type", noun: "a channel type" },
];

/** The Yes / Not Applicable topic flags. */
export const TOPIC_FLAGS: ReadonlyArray<{ field: LitTextField; label: string }> = [
  { field: "covered_topics_ecohydrology", label: "Ecohydrology" },
  { field: "covered_topics_ecohydraulics", label: "Ecohydraulics" },
  { field: "covered_topics_ecological_systems", label: "Ecological systems" },
  { field: "covered_topics_future_conditions", label: "Future conditions" },
];

export interface FacetDef {
  field: string;
  label: string;
  /** tokens: a keyword field; flag: a Yes/NA field (one value, "Yes"); decade: from the year. */
  kind: "tokens" | "flag" | "decade";
}

export interface FacetGroup {
  title: string;
  facets: FacetDef[];
}

const tokenFacet = (field: string): FacetDef => {
  const f = LIT_FIELDS.find((x) => x.field === field);
  if (!f) throw new Error(`unknown literature field ${field}`);
  return { field, label: f.label, kind: "tokens" };
};

export const DECADE_FIELD = "decade";

export const FACET_GROUPS: readonly FacetGroup[] = [
  { title: "Document type", facets: [tokenFacet("document_type")] },
  { title: "Decade", facets: [{ field: DECADE_FIELD, label: "Decade", kind: "decade" }] },
  { title: "Focus", facets: [tokenFacet("purpose"), tokenFacet("sustainable_sediment_management"), tokenFacet("adaptive_management")] },
  { title: "Methods", facets: [tokenFacet("data_collection"), tokenFacet("modeling")] },
  { title: "Sediment", facets: [tokenFacet("sediment_characteristic"), tokenFacet("sediment_source")] },
  { title: "Setting", facets: [tokenFacet("land_use"), tokenFacet("channel_type")] },
  { title: "Topics covered", facets: TOPIC_FLAGS.map((f) => ({ field: f.field, label: f.label, kind: "flag" as const })) },
  { title: "Risk and special cases", facets: [tokenFacet("risk_and_uncertainty"), tokenFacet("special_cases")] },
];

export const FACET_BY_FIELD: ReadonlyMap<string, FacetDef> = new Map(FACET_GROUPS.flatMap((g) => g.facets).map((f) => [f.field, f]));

/** The title of the filter group that holds a field (null if none does). */
export const groupOfField = (field: string): string | null => FACET_GROUPS.find((g) => g.facets.some((f) => f.field === field))?.title ?? null;

export interface Publication {
  lit: LiteratureSurvey;
  id: string;
  title: string;
  year: number | null;
  /** No associated sites: general literature. */
  isGeneral: boolean;
  /** Sites linked through the entry table. */
  sites: Site[];
  /** Legacy site names with no matching site record. */
  legacyNames: string[];
  /** Tokens per field: every keyword field, the topic flags ("Yes") and the decade. */
  tokens: Record<string, string[]>;
  /** Lower-cased text the search box matches. */
  haystack: string;
}

export const decadeOf = (year: number | null): string | null => (year == null ? null : `${Math.floor(year / 10) * 10}s`);

const parseYear = (raw: string): number | null => (/^\d{4}$/.test(raw.trim()) ? Number(raw.trim()) : null);

export function buildPublications(data: AppData): Publication[] {
  const siteIdsByLit = new Map<string, Set<string>>();
  const legacyByLit = new Map<string, Set<string>>();
  for (const e of data.entries) {
    if (e.site_id) {
      let set = siteIdsByLit.get(e.lit_id);
      if (!set) siteIdsByLit.set(e.lit_id, (set = new Set()));
      set.add(e.site_id);
    } else if (e.site_name.trim()) {
      let set = legacyByLit.get(e.lit_id);
      if (!set) legacyByLit.set(e.lit_id, (set = new Set()));
      set.add(e.site_name.trim());
    }
  }
  return data.literature.map((lit) => {
    const sites = [...(siteIdsByLit.get(lit.lit_id) ?? [])]
      .map((id) => data.siteById.get(id))
      .filter((s): s is Site => !!s)
      .sort((a, b) => a.site_name.localeCompare(b.site_name));
    const legacyNames = [...(legacyByLit.get(lit.lit_id) ?? [])].sort();
    const year = parseYear(lit.year);
    const tokens: Record<string, string[]> = {};
    for (const f of LIT_FIELDS) tokens[f.field] = keywordTokens(lit[f.field]);
    for (const f of TOPIC_FLAGS) tokens[f.field] = /^yes$/i.test(lit[f.field].trim()) ? ["Yes"] : [];
    const decade = decadeOf(year);
    tokens[DECADE_FIELD] = decade ? [decade] : [];
    const haystack = [lit.title, lit.author, lit.year, lit.doi, lit.document_type, lit.geography, ...sites.map((s) => s.site_name), ...legacyNames]
      .join(" ")
      .toLowerCase();
    return {
      lit,
      id: lit.lit_id,
      title: lit.title.trim() || "(untitled)",
      year,
      isGeneral: lit.site_names === "",
      sites,
      legacyNames,
      tokens,
      haystack,
    };
  });
}

const publicationCache = new WeakMap<AppData, readonly Publication[]>();
/** The publication index for the loaded data, built once and shared by the
    Dashboard and the Library (whichever opens first builds it). */
export function publicationsFor(data: AppData): readonly Publication[] {
  let pubs = publicationCache.get(data);
  if (!pubs) publicationCache.set(data, (pubs = buildPublications(data)));
  return pubs;
}

export type LibraryQuery = Pick<LibraryState, "query" | "scope" | "facets" | "siteId">;

export const inScope = (p: Publication, scope: LitScope): boolean =>
  scope === "all" || (scope === "general" ? p.isGeneral : !p.isGeneral);

const hasValue = (tokens: string[] | undefined, value: string): boolean => {
  const key = value.toLowerCase();
  return !!tokens && tokens.some((t) => t.toLowerCase() === key);
};

/** Whether a publication carries any of the facet's selected values (OR). */
export const matchesFacet = (p: Publication, field: string, values: readonly string[]): boolean =>
  values.length === 0 || values.some((v) => hasValue(p.tokens[field], v));

/** The publications matching every criterion; `ignoreFacet` leaves one facet
    out (its own option counts are computed against everything else). */
export function searchPublications(pubs: readonly Publication[], q: LibraryQuery, ignoreFacet?: string): Publication[] {
  const terms = q.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const facets = Object.entries(q.facets).filter(([field, values]) => field !== ignoreFacet && values.length > 0);
  return pubs.filter((p) => {
    if (!inScope(p, q.scope)) return false;
    if (q.siteId && !p.sites.some((s) => s.site_id === q.siteId)) return false;
    if (terms.some((t) => !p.haystack.includes(t))) return false;
    return facets.every(([field, values]) => matchesFacet(p, field, values));
  });
}

/** Option counts for one facet under every other criterion (the facet's own
    selection ignored, so unselected siblings keep their counts). Decades
    list newest first; everything else largest first. */
export function facetCounts(pubs: readonly Publication[], q: LibraryQuery, facet: FacetDef): Tally<Publication>[] {
  const base = searchPublications(pubs, q, facet.field);
  const tallies = tallyRecords(base, (p) => p.tokens[facet.field] ?? []).tallies;
  if (facet.kind === "decade") tallies.sort((a, b) => b.label.localeCompare(a.label));
  return tallies;
}

/** The names a publication's Site column shows: linked sites first (by
    name), then legacy names with no site record. */
export const siteNames = (p: Publication): string[] => [...p.sites.map((s) => s.site_name), ...p.legacyNames];

/** The direction a column sorts in on its first click. */
export const FIRST_DIR: Record<LibrarySortKey, LibrarySort["dir"]> = { year: "desc", title: "asc", site: "asc" };

/** A header click: the same column reverses; another column starts in its first direction. */
export const nextSort = (cur: LibrarySort, key: LibrarySortKey): LibrarySort =>
  cur.key === key ? { key, dir: cur.dir === "asc" ? "desc" : "asc" } : { key, dir: FIRST_DIR[key] };

/** Sorts by one column. Blanks (an unknown year; no site) always sort last,
    whichever the direction; ties fall back to newest first, then the title. */
export function sortPublications(list: readonly Publication[], sort: LibrarySort): Publication[] {
  const sign = sort.dir === "asc" ? 1 : -1;
  const byTitle = (a: Publication, b: Publication) => a.title.localeCompare(b.title);
  const byYearDesc = (a: Publication, b: Publication) => (b.year ?? -Infinity) - (a.year ?? -Infinity);
  const siteKey = new Map(list.map((p) => [p.id, siteNames(p)[0]?.toLowerCase() ?? null]));
  const blankLast = (a: unknown, b: unknown) => (a == null ? 1 : 0) - (b == null ? 1 : 0);
  const primary = (a: Publication, b: Publication): number => {
    if (sort.key === "title") return sign * byTitle(a, b);
    if (sort.key === "year") return blankLast(a.year, b.year) || (a.year != null && b.year != null ? sign * (a.year - b.year) : 0);
    const ka = siteKey.get(a.id) ?? null;
    const kb = siteKey.get(b.id) ?? null;
    return blankLast(ka, kb) || (ka != null && kb != null ? sign * ka.localeCompare(kb) : 0);
  };
  return [...list].sort((a, b) => primary(a, b) || byYearDesc(a, b) || byTitle(a, b));
}

/** How many rows of a new result list to build in the render that answers a
    click: every row already built (memoized, so it only moves) plus up to
    `budget` new ones, in list order. The table builds the rest in background
    steps. A reorder or a narrower list therefore builds nothing new at once. */
export function syncRowCount(next: ReadonlyArray<{ id: string }>, built: ReadonlySet<string>, budget: number): number {
  let fresh = 0;
  for (let i = 0; i < next.length; i++) {
    if (built.has(next[i].id)) continue;
    fresh++;
    if (fresh > budget) return i;
  }
  return next.length;
}

export const scopeCounts = (pubs: readonly Publication[]): Record<LitScope, number> => ({
  all: pubs.length,
  site: pubs.filter((p) => !p.isGeneral).length,
  general: pubs.filter((p) => p.isGeneral).length,
});

/** How a selected facet value reads as a chip. */
export const facetValueLabel = (facet: FacetDef, value: string): string => (facet.kind === "flag" ? facet.label : value);
