// The four result-table tabs, ported from the Experience Builder table widget
// (widget_29). Per approved improvement D8, the Site Literature tab shows the
// same site-linked view its counter uses (the current app showed the full
// 1,410-row base table there — a documented inconsistency).

import { LITERATURE_FIELD_LABELS, SITE_FIELD_LABELS } from "./fields";

export type TabId = "sites" | "siteLit" | "generalLit" | "allLit";

export interface TabDef {
  id: TabId;
  label: string;
  /** Field the tab's search box matches (ported per-tab searchFields). */
  searchField: string;
  columns: Array<{ field: string; label: string }>;
}

const litColumns = (withSite: boolean) =>
  [
    ...(withSite ? [{ field: "site_name", label: "Site" }] : []),
    "title",
    "year",
    "author",
    "doi",
    "document_type",
    "purpose",
    "data_collection",
    "modeling",
    "adaptive_management",
    "sediment_characteristic",
    "sediment_source",
    "covered_topics_ecohydrology",
    "covered_topics_ecohydraulics",
    "covered_topics_ecological_systems",
    "covered_topics_future_conditions",
    "risk_and_uncertainty",
    "special_cases",
    "geography",
    "sustainable_sediment_management",
    "land_use",
    "channel_type",
    ...(withSite ? [] : [{ field: "site_names", label: "Sites" }]),
  ].map((c) => (typeof c === "string" ? { field: c, label: LITERATURE_FIELD_LABELS[c] ?? c } : c));

export const TABS: TabDef[] = [
  {
    id: "sites",
    label: "Sites",
    searchField: "site_name",
    columns: [
      "site_name",
      "nid_id",
      "responsible_districtagency",
      "address",
      "city",
      "site_type",
      "sediment_release",
      "ecological_concern",
      "analysis",
    ].map((f) => ({ field: f, label: SITE_FIELD_LABELS[f] ?? f })),
  },
  { id: "siteLit", label: "Site Literature", searchField: "title", columns: litColumns(true) },
  { id: "generalLit", label: "General Literature", searchField: "title", columns: litColumns(false) },
  { id: "allLit", label: "All Literature", searchField: "title", columns: litColumns(false) },
];
