// Display labels for every field, ported from the ArcGIS layer definitions'
// aliases and the web map's popup configuration (see the evidence archive).
// Stored names are the repo CSV schema; labels are what users see.

export const SITE_FIELD_LABELS: Record<string, string> = {
  site_id: "Site ID",
  site_name: "Site Name",
  nid_id: "NID ID",
  responsible_districtagency: "Responsible District/Agency",
  address: "Address",
  city: "City",
  site_type: "Site Type",
  sediment_release: "Sediment Release",
  ecological_concern: "Ecological Concern",
  analysis: "Analysis",
  longitude: "Longitude",
  latitude: "Latitude",
};

export const LITERATURE_FIELD_LABELS: Record<string, string> = {
  lit_id: "Literature ID",
  title: "Title",
  year: "Year",
  author: "Author",
  doi: "DOI",
  document_type: "Document Type",
  purpose: "Purpose",
  data_collection: "Data Collection",
  modeling: "Modeling",
  adaptive_management: "Adaptive Management",
  sediment_characteristic: "Sediment Characteristic",
  sediment_source: "Sediment Source",
  covered_topics_ecohydrology: "Ecohydrology",
  covered_topics_ecohydraulics: "Ecohydraulics",
  covered_topics_ecological_systems: "Ecological Systems Assessed",
  covered_topics_future_conditions: "Future Conditions",
  risk_and_uncertainty: "Risk and Uncertainty",
  special_cases: "Special Cases",
  geography: "Geography",
  sustainable_sediment_management: "Sustainable Sediment Management",
  land_use: "Land Use",
  channel_type: "Channel Type",
  site_names: "Sites",
  site_name: "Site",
  entry_id: "Entry ID",
};

/** Curated NID detail fields (decision D8), shown for sites with an nid_id.
 *  Labels include units per the NID data dictionary. */
export const NID_DETAIL_FIELDS: Array<{ field: string; label: string }> = [
  { field: "name", label: "Dam Name" },
  { field: "nidid", label: "NID ID" },
  { field: "river_or_stream", label: "River or Stream" },
  { field: "city", label: "City" },
  { field: "state", label: "State" },
  { field: "primary_purpose", label: "Primary Purpose" },
  { field: "purposes", label: "All Purposes" },
  { field: "primary_dam_type", label: "Primary Dam Type" },
  { field: "year_completed", label: "Year Completed" },
  { field: "nid_height", label: "NID Height (ft)" },
  { field: "dam_length", label: "Dam Length (ft)" },
  { field: "nid_storage", label: "NID Storage (acre-ft)" },
  { field: "normal_storage", label: "Normal Storage (acre-ft)" },
  { field: "surface_area", label: "Surface Area (acres)" },
  { field: "drainage_area", label: "Drainage Area (sq mi)" },
  { field: "max_discharge", label: "Max Discharge (cfs)" },
  { field: "hazard_potential", label: "Hazard Potential" },
  { field: "condition_assessment", label: "Condition Assessment" },
  { field: "owner_types", label: "Owner Types" },
  { field: "website_url", label: "Website" },
];

/** Site popup / detail fields, ported from the web map popupInfo. */
export const SITE_DETAIL_FIELDS = [
  "site_name",
  "nid_id",
  "responsible_districtagency",
  "address",
  "city",
  "site_type",
  "sediment_release",
  "ecological_concern",
  "analysis",
] as const;
