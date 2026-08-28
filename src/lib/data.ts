// Loads the generated runtime data (public/data/*.json) and builds the
// lookup indexes the app joins on. Fetched once at startup.

import type { AppData, DataManifest, LiteratureEntry, LiteratureSurvey, NidRecord, Site } from "./types";

async function fetchJson<T>(name: string): Promise<T> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/${name}`);
  if (!res.ok) throw new Error(`Failed to load ${name}: HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export async function loadAppData(): Promise<AppData> {
  const [sites, literature, entries, nid, manifest] = await Promise.all([
    fetchJson<Site[]>("sites.json"),
    fetchJson<LiteratureSurvey[]>("literature.json"),
    fetchJson<LiteratureEntry[]>("literature_entries.json"),
    fetchJson<NidRecord[]>("nid.json"),
    fetchJson<DataManifest>("manifest.json"),
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
  };
}
