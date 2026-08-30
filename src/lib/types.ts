// Record shapes exactly mirror the authoritative CSVs in data/ (built to
// public/data/*.json by scripts/build-data.mjs). All keyword fields hold
// comma-delimited multi-value strings; blank string = no value.

import type { SiteSedimentLink } from "../sediment/types";

export interface Site {
  site_id: string;
  site_name: string;
  nid_id: string;
  responsible_districtagency: string;
  address: string;
  city: string;
  site_type: string;
  sediment_release: string;
  ecological_concern: string;
  analysis: string;
  longitude: number | null;
  latitude: number | null;
}

export interface LiteratureSurvey {
  lit_id: string;
  title: string;
  year: string;
  author: string;
  doi: string;
  document_type: string;
  purpose: string;
  data_collection: string;
  modeling: string;
  adaptive_management: string;
  sediment_characteristic: string;
  sediment_source: string;
  covered_topics_ecohydrology: string;
  covered_topics_ecohydraulics: string;
  covered_topics_ecological_systems: string;
  covered_topics_future_conditions: string;
  risk_and_uncertainty: string;
  special_cases: string;
  geography: string;
  sustainable_sediment_management: string;
  land_use: string;
  channel_type: string;
  /** Comma-delimited display list of associated site names; blank = general literature. */
  site_names: string;
  longitude: number | null;
  latitude: number | null;
}

export interface LiteratureEntry {
  entry_id: string;
  lit_id: string;
  /** Explicit link to a site; blank for general literature and legacy unmatched names. */
  site_id: string;
  /** Display text as originally recorded (kept even when site_id is blank). */
  site_name: string;
  title: string;
  year: string;
  author: string;
  doi: string;
  document_type: string;
  purpose: string;
  data_collection: string;
  modeling: string;
  adaptive_management: string;
  sediment_characteristic: string;
  sediment_source: string;
  covered_topics_ecohydrology: string;
  covered_topics_ecohydraulics: string;
  covered_topics_ecological_systems: string;
  covered_topics_future_conditions: string;
  risk_and_uncertainty: string;
  special_cases: string;
  geography: string;
  sustainable_sediment_management: string;
  land_use: string;
  channel_type: string;
}

export interface NidRecord {
  nidid: string;
  name: string;
  other_names: string;
  river_or_stream: string;
  city: string;
  state: string;
  primary_purpose: string;
  purposes: string;
  primary_dam_type: string;
  year_completed: string;
  nid_height: string;
  dam_length: string;
  nid_storage: string;
  normal_storage: string;
  surface_area: string;
  drainage_area: string;
  max_discharge: string;
  hazard_potential: string;
  condition_assessment: string;
  owner_types: string;
  website_url: string;
}

export interface DataManifest {
  generated: string;
  counts: Record<string, number>;
  sha256: Record<string, string>;
}

export interface AppData {
  sites: Site[];
  literature: LiteratureSurvey[];
  entries: LiteratureEntry[];
  nid: NidRecord[];
  manifest: DataManifest;
  /** site_id -> its literature entries (site-linked only). */
  entriesBySite: Map<string, LiteratureEntry[]>;
  /** nidid -> NID record. */
  nidById: Map<string, NidRecord>;
  /** site_id -> site. */
  siteById: Map<string, Site>;
  /** lit_id -> literature survey. */
  litById: Map<string, LiteratureSurvey>;
  /** site_id -> its ResNet/RATTES link (curated crosswalk; most sites have none). */
  siteSediment: Map<string, SiteSedimentLink>;
  /** ResNet ShortID -> site_id — routes national-layer clicks on documented dams to the site experience. */
  siteByShortId: Map<number, string>;
}
