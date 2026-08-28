// Derived data: filtered record sets, counters, and the current selection's
// linked records. Pure functions of (data, state); memoized on identity since
// the store replaces objects on every change.

import type { AppData, LiteratureEntry, LiteratureSurvey, NidRecord, Site } from "../lib/types";
import { applyFilters, type FilterState } from "../filters/engine";
import { FILTER_DEFS } from "../config/filters.generated";
import type { AppState } from "./store";

export interface Derived {
  /** Sites after the Site Keywords filters. */
  sites: Site[];
  /** All 1,410 entries after Site Literature Keywords filters. */
  entriesAll: LiteratureEntry[];
  /** The site-linked view of the above — drives the counter and the tab. */
  siteLit: LiteratureEntry[];
  /** All 466 surveys after General Literature Keywords filters. */
  literatureAll: LiteratureSurvey[];
  /** The general view (no associated sites) — counter and tab. */
  generalLit: LiteratureSurvey[];
  counts: { sites: number; siteLit: number; generalLit: number };
  selection: {
    site: Site | null;
    entries: LiteratureEntry[];
    nid: NidRecord | null;
  };
}

let cacheKey: { data: AppData; filters: FilterState; selectedSiteId: string | null } | null = null;
let cacheVal: Derived | null = null;

export function derive(data: AppData, state: AppState): Derived {
  if (
    cacheVal &&
    cacheKey &&
    cacheKey.data === data &&
    cacheKey.filters === state.filters &&
    cacheKey.selectedSiteId === state.selectedSiteId
  ) {
    return cacheVal;
  }

  const sites = applyFilters(data.sites, FILTER_DEFS, state.filters, "sites");
  const entriesAll = applyFilters(data.entries, FILTER_DEFS, state.filters, "siteLit");
  const siteLit = entriesAll.filter((e) => e.site_name !== "");
  const literatureAll = applyFilters(data.literature, FILTER_DEFS, state.filters, "generalLit");
  const generalLit = literatureAll.filter((l) => l.site_names === "");

  const site = state.selectedSiteId ? (data.siteById.get(state.selectedSiteId) ?? null) : null;
  const selection = {
    site,
    entries: site ? (data.entriesBySite.get(site.site_id) ?? []) : [],
    nid: site && site.nid_id ? (data.nidById.get(site.nid_id) ?? null) : null,
  };

  cacheKey = { data, filters: state.filters, selectedSiteId: state.selectedSiteId };
  cacheVal = {
    sites,
    entriesAll,
    siteLit,
    literatureAll,
    generalLit,
    counts: { sites: sites.length, siteLit: siteLit.length, generalLit: generalLit.length },
    selection,
  };
  return cacheVal;
}
