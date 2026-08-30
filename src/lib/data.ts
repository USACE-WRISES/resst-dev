// Loads the generated runtime data (public/data/*.json plus the small
// sediment/sites.json crosswalk) and builds the lookup indexes the app joins
// on. Fetched once at startup.

import type { SiteSedimentLink } from "../sediment/types";
import type { AppData, DataManifest, LiteratureEntry, LiteratureSurvey, NidRecord, Site } from "./types";

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${import.meta.env.BASE_URL}${path}`);
  if (!res.ok) throw new Error(`Failed to load ${path}: HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export async function loadAppData(): Promise<AppData> {
  const [sites, literature, entries, nid, manifest, sediment] = await Promise.all([
    fetchJson<Site[]>("data/sites.json"),
    fetchJson<LiteratureSurvey[]>("data/literature.json"),
    fetchJson<LiteratureEntry[]>("data/literature_entries.json"),
    fetchJson<NidRecord[]>("data/nid.json"),
    fetchJson<DataManifest>("data/manifest.json"),
    fetchJson<{ sites: SiteSedimentLink[] }>("sediment/sites.json"),
  ]);

  const entriesBySite = new Map<string, LiteratureEntry[]>();
  for (const e of entries) {
    if (!e.site_id) continue;
    const list = entriesBySite.get(e.site_id);
    if (list) list.push(e);
    else entriesBySite.set(e.site_id, [e]);
  }

  return {
    sites,
    literature,
    entries,
    nid,
    manifest,
    entriesBySite,
    nidById: new Map(nid.map((n) => [n.nidid, n])),
    siteById: new Map(sites.map((s) => [s.site_id, s])),
    litById: new Map(literature.map((l) => [l.lit_id, l])),
    siteSediment: new Map(sediment.sites.map((l) => [l.site_id, l])),
    siteByShortId: new Map(sediment.sites.map((l) => [l.short_id, l.site_id])),
  };
}
