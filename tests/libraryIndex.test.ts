// The Library's publication index (src/library/index.ts) over the real
// generated data: one record per survey, sites joined through the entry
// links, search terms all required, facets OR within and AND across with
// option counts that ignore their own selection, and sorting by any column.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { AppData, LiteratureEntry, LiteratureSurvey, Site } from "../src/lib/types";
import { EMPTY_LIBRARY } from "../src/state/store";
import { NA_TOKENS } from "../src/lib/keywords";
import {
  DECADE_FIELD,
  FACET_BY_FIELD,
  FACET_GROUPS,
  LIT_FIELDS,
  buildPublications,
  facetCounts,
  groupOfField,
  nextSort,
  publicationsFor,
  scopeCounts,
  searchPublications,
  siteNames,
  sortPublications,
  syncRowCount,
  type Publication,
} from "../src/library/index";

const load = (name: string) => JSON.parse(readFileSync(`public/data/${name}`, "utf8"));
const sites = load("sites.json") as Site[];
const literature = load("literature.json") as LiteratureSurvey[];
const entries = load("literature_entries.json") as LiteratureEntry[];

// The same joins src/lib/data.ts builds at startup.
const entriesBySite = new Map<string, LiteratureEntry[]>();
for (const e of entries) {
  if (!e.site_id) continue;
  const list = entriesBySite.get(e.site_id);
  if (list) list.push(e);
  else entriesBySite.set(e.site_id, [e]);
}
const data = {
  sites,
  literature,
  entries,
  nid: [],
  manifest: { generated: "", counts: {}, sha256: {} },
  entriesBySite,
  nidById: new Map(),
  siteById: new Map(sites.map((s) => [s.site_id, s])),
  litById: new Map(literature.map((l) => [l.lit_id, l])),
  siteSediment: new Map(),
  siteByShortId: new Map(),
} as AppData;

const pubs = buildPublications(data);
const q = (partial: Partial<typeof EMPTY_LIBRARY>) => ({ ...EMPTY_LIBRARY, ...partial });
const facet = (field: string) => FACET_BY_FIELD.get(field)!;

describe("buildPublications", () => {
  it("indexes one publication per survey with the app's counter scopes", () => {
    expect(pubs).toHaveLength(465);
    expect(scopeCounts(pubs)).toEqual({ all: 465, site: 251, general: 214 });
  });
  it("joins sites through the entry links and keeps legacy names", () => {
    const withSites = pubs.filter((p) => p.sites.length > 0);
    expect(withSites.length).toBeGreaterThan(200);
    const tuttle = pubs.filter((p) => p.sites.some((s) => s.site_id === "tuttle-creek"));
    expect(tuttle).toHaveLength(6); // the parity baseline: Tuttle Creek has 6 entries
    expect(pubs.some((p) => p.legacyNames.length > 0)).toBe(true);
  });
  it("tokenises every keyword field, the topic flags and the decade, never a not-applicable value", () => {
    for (const p of pubs) {
      for (const f of LIT_FIELDS) for (const t of p.tokens[f.field]) expect(NA_TOKENS.has(t.toLowerCase())).toBe(false);
      if (p.year != null) expect(p.tokens[DECADE_FIELD]).toEqual([`${Math.floor(p.year / 10) * 10}s`]);
    }
    expect(pubs.filter((p) => p.tokens.covered_topics_ecohydrology.length > 0)).toHaveLength(57);
  });
});

describe("searchPublications", () => {
  it("requires every search term somewhere in the citation, geography or site names", () => {
    const hits = searchPublications(pubs, q({ query: "tuttle creek" }));
    expect(hits.length).toBeGreaterThanOrEqual(6);
    for (const p of hits) expect(p.haystack).toContain("tuttle");
    expect(searchPublications(pubs, q({ query: "tuttle zzzz" }))).toHaveLength(0);
  });
  it("narrows to a site's publications", () => {
    expect(searchPublications(pubs, q({ siteId: "tuttle-creek" }))).toHaveLength(6);
  });
  it("applies facets: OR within one, AND across, on the scope", () => {
    expect(searchPublications(pubs, q({ facets: { document_type: ["Journal Article"] } }))).toHaveLength(168);
    expect(searchPublications(pubs, q({ facets: { document_type: ["journal article", "Book"] } }))).toHaveLength(168 + 33);
    const both = searchPublications(pubs, q({ facets: { document_type: ["Journal Article"], purpose: ["Analysis"] } }));
    expect(both.length).toBeLessThan(168);
    for (const p of both) expect(p.tokens.purpose.map((t) => t.toLowerCase())).toContain("analysis");
    expect(searchPublications(pubs, q({ scope: "general", facets: { document_type: ["Journal Article"] } })).every((p) => p.isGeneral)).toBe(true);
  });
});

describe("facetCounts", () => {
  it("counts options under every other criterion, ignoring the facet's own selection", () => {
    const own = facetCounts(pubs, q({ facets: { document_type: ["Journal Article"] } }), facet("document_type"));
    expect(own.find((t) => t.label === "Book")?.count).toBe(33); // siblings keep their counts
    const other = facetCounts(pubs, q({ facets: { document_type: ["Journal Article"] } }), facet("purpose"));
    expect(other.reduce((s, t) => Math.max(s, t.count), 0)).toBeLessThanOrEqual(168);
  });
  it("lists decades newest first and flags as a single Yes option", () => {
    const decades = facetCounts(pubs, q({}), facet(DECADE_FIELD)).map((t) => t.label);
    expect(decades[0] > decades[decades.length - 1]).toBe(true);
    expect(facetCounts(pubs, q({}), facet("covered_topics_ecohydrology"))).toMatchObject([{ label: "Yes", count: 57 }]);
  });
  it("covers every facet field in the groups", () => {
    for (const g of FACET_GROUPS) for (const f of g.facets) expect(FACET_BY_FIELD.get(f.field)).toBe(f);
  });
});

describe("sortPublications", () => {
  const years = (list: Publication[]) => list.map((p) => p.year);
  const firstSite = (p: Publication) => siteNames(p)[0]?.toLowerCase() ?? null;
  it("sorts by year both ways, unknown years last either way", () => {
    for (const dir of ["desc", "asc"] as const) {
      const ys = years(sortPublications(pubs, { key: "year", dir }));
      const known = ys.filter((y): y is number => y != null);
      expect(ys.slice(0, known.length)).toEqual(known);
      for (let i = 1; i < known.length; i++) expect(dir === "desc" ? known[i - 1] >= known[i] : known[i - 1] <= known[i]).toBe(true);
    }
  });
  it("sorts by title both ways", () => {
    const asc = sortPublications(pubs, { key: "title", dir: "asc" });
    for (let i = 1; i < asc.length; i++) expect(asc[i - 1].title.localeCompare(asc[i].title) <= 0).toBe(true);
    const desc = sortPublications(pubs, { key: "title", dir: "desc" });
    expect(desc[0].title).toBe(asc[asc.length - 1].title);
  });
  it("sorts by the first site, general literature last either way", () => {
    for (const dir of ["asc", "desc"] as const) {
      const list = sortPublications(pubs, { key: "site", dir });
      const keys = list.map(firstSite);
      const named = keys.filter((k): k is string => k != null);
      expect(named.length).toBe(251);
      expect(keys.slice(named.length).every((k) => k == null)).toBe(true);
      for (let i = 1; i < named.length; i++) {
        const c = named[i - 1].localeCompare(named[i]);
        expect(dir === "asc" ? c <= 0 : c >= 0).toBe(true);
      }
    }
  });
  it("a header click reverses its own column and starts another in its first direction", () => {
    expect(nextSort({ key: "year", dir: "desc" }, "year")).toEqual({ key: "year", dir: "asc" });
    expect(nextSort({ key: "year", dir: "asc" }, "title")).toEqual({ key: "title", dir: "asc" });
    expect(nextSort({ key: "title", dir: "asc" }, "title")).toEqual({ key: "title", dir: "desc" });
    expect(nextSort({ key: "title", dir: "desc" }, "year")).toEqual({ key: "year", dir: "desc" });
    expect(nextSort({ key: "year", dir: "desc" }, "site")).toEqual({ key: "site", dir: "asc" });
  });
});

describe("groupOfField", () => {
  it("names the filter group that holds a field", () => {
    expect(groupOfField("document_type")).toBe("Document type");
    expect(groupOfField("purpose")).toBe("Focus");
    expect(groupOfField("modeling")).toBe("Methods");
    expect(groupOfField("covered_topics_ecohydrology")).toBe("Topics covered");
    expect(groupOfField(DECADE_FIELD)).toBe("Decade");
    expect(groupOfField("geography")).toBeNull();
  });
});

describe("syncRowCount", () => {
  const list = (ids: string) => ids.split("").map((id) => ({ id }));
  const built = (ids: string) => new Set(ids.split(""));
  it("keeps every row of a reorder or a narrower list: nothing new to build", () => {
    expect(syncRowCount(list("edcba"), built("abcde"), 2)).toBe(5);
    expect(syncRowCount(list("bd"), built("abcde"), 0)).toBe(2);
  });
  it("stops at the first new row past the budget, keeping built rows before it", () => {
    // built a, c; new b, d, e, f; budget 2: a (built) b (1) c (built) d (2), then e is the third new row
    expect(syncRowCount(list("abcdef"), built("ac"), 2)).toBe(4);
  });
  it("builds only the budget of a disjoint list, and all of a short one", () => {
    expect(syncRowCount(list("vwxyz"), built("abc"), 3)).toBe(3);
    expect(syncRowCount(list("xy"), built("abc"), 3)).toBe(2);
    expect(syncRowCount([], built("abc"), 3)).toBe(0);
  });
});

describe("publicationsFor", () => {
  it("builds the index once per data object and shares it", () => {
    const a = publicationsFor(data);
    expect(a).toHaveLength(465);
    expect(publicationsFor(data)).toBe(a);
  });
});
