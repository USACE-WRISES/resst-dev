# RESST Data Migration Log

Migrated 2026-08-28 from the verified ArcGIS extracts in `RESST-migration/03-data/`
(collected and count-verified the same day — see `RESST-migration/MANIFEST.md`).
This file documents every transformation between the ArcGIS-hosted data and the
authoritative CSVs in `data/`. Re-running `node scripts/migrate.mjs` rebuilds
`data/` from the archived extracts deterministically.

## Structure changes

- ArcGIS housekeeping fields dropped from all tables: `objectid`, `globalid`,
  `parentglobalid`, `CreationDate`, `Creator`, `EditDate`, `Editor`.
  Traceability: row order follows source `objectid`; the archived extracts
  retain the originals.
- Stable IDs added: `site_id` (slug of the verified-unique `site_name`),
  `lit_id` (`L0001`…), `entry_id` (`E00001`…).
- The Survey123 relationship (literature layer ↔ `lit_repeat` via
  `parentglobalid`) is resolved to the `lit_id` foreign key in
  `literature_entries.csv`. Orphans found: 0.
- **New `site_id` foreign key on entries.** The current app links literature to
  sites by matching the `site_name` string at runtime. That link is resolved
  once at migration (exact raw match: 1094; trimmed: 6;
  case-insensitive: 0) and stored explicitly; `site_name`
  remains as display text. This also disambiguates the two distinct sites both
  named "Rio Grande" (Matamoros, Mexico = `rio-grande`; Bernalillo, NM =
  `rio-grande-2`) — the 5 entries naming "Rio Grande" resolved to the
  NM site, exactly as the current app's exact-string match behaved.
- `literature_entries.csv` drops the `lit_` field prefix (context is the table
  itself). `literature_title` (parent title copied into each entry by
  Survey123) is dropped — derivable via `lit_id`; rows where it differed from
  the parent title: 0.
- Truncated Survey123 field names normalized in both literature tables:
  `covered_topics_ecological_syste` → `covered_topics_ecological_systems`,
  `covered_topics_future_condition` → `covered_topics_future_conditions`.
- Sites: geometry and the redundant Survey123 text `longitude`/`latitude`
  attributes are unified into single numeric `longitude`/`latitude` columns
  (blank = no location; site appears in tables only, matching current app
  behavior).

## Owner-approved data fixes (decision D7)

- **Coordinate swap fixed** — Millsite Reservoir: geometry [39.0965555600001, -111.1978] → lon=-111.1978, lat=39.0965555600001
- **Coordinate swap fixed** — Mrica Reservoir: geometry [-7.39229999999998, 109.6061] → lon=109.6061, lat=-7.39229999999998
- **"Water Injection Dreding" typo** — investigation showed the typo lives in the
  Experience Builder *filter widget's predefined option list*, not in the data
  (data spells it correctly; the current app's option therefore matches zero
  records). Data values changed: 0. The new app's ported filter
  config uses the corrected spelling, making the option functional
  (documented deliberate difference).

## Flagged for later owner attention (not changed)

### Newly discovered value corruptions (NOT in the approved fix list — awaiting approval)
- literature: "…maNot Applicablegement" (corrupted "management") — 19 occurrences
- literature: "Depostion" (misspelled "Deposition") — 4 occurrences
- entries: "…maNot Applicablegement" (corrupted "management") — 74 occurrences
- entries: "Depostion" (misspelled "Deposition") — 4 occurrences

These look like a find/replace accident ("na" → "Not Applicable" applied inside
"management") plus a "Depostion"/"Deposition" misspelling. They are invisible in
the current app because its filter options are a hand-curated static list; they
would surface if options were ever derived from data. Recommend fixing in a
dedicated data PR after owner sign-off.

### 15 sites without coordinates (table-only, never on the map)
- Daimonike Dam
- Almansa Dam
- San Ildefonso Dam
- Hyokiri Dam
- Zgorigrad (Vratza) Dam
- Frías Dam
- Skelmorlie Dam
- Chitauni Dam
- Mill River Dam
- Hengshan Reservoir
- Duozhao Ravine, Jiangjia River basin
- Saignon Dam
- California and Colorado burned basins
- Japan check dams
- Western Oregon Reservoirs

### 81 distinct legacy site_name values on entries matching no site (92 entries)
These entries count toward the "Site Literature" view but were never reachable
by selecting a site in the current app either (no site record matches the
text). Kept verbatim with blank `site_id`. Several look like typos of real
sites ("Tuttle Creek Dam" vs site "Tuttle Creek") or comma-split fragments of
descriptive locations ("NE to St. Louis", "MO") — fixing them by assigning the
right `site_id` (or creating missing site records) is an owner data decision.
- "East Coast" ×1
- "USA" ×1
- "Mt St Helens Sediment Retention Structure" ×1
- "Cougar Dam" ×1
- "Detroit Dam" ×1
- "Neosho River" ×1
- "middle reach" ×1
- "midwestern USA stream beds" ×1
- "Tuttle Creek Dam" ×4
- "Missouri River from Ponca to Omaha" ×1
- "Gavins Point Dam to Cairo" ×1
- "Missouri River from Rulo" ×1
- "NE to St. Louis" ×1
- "MO" ×4
- "Missouri River from Sioux City" ×2
- "IA to Omaha" ×1
- "NE" ×1
- "IA to Hermann" ×1
- "Missouri River from St. Joseph" ×1
- "MO to Waverly" ×1
- "Minnesota Rivers" ×1
- "USA (east of Rocky Mountains)" ×1
- "Indonesia" ×1
- "Missouri River Geomorphology" ×1
- "Carefree" ×1
- "Atchafalaya River" ×1
- "Missouri River at St. Charles" ×1
- "Medicine Tree Creek" ×1
- "Doran Creek" ×1
- "Laird Creek" ×1
- "Reimel Creek" ×1
- "Cameron Creek" ×1
- "Warm Spring Creek" ×1
- "Mississippi River at Thebes" ×1
- "IL" ×1
- "Missouri River at Hermann" ×2
- "Mississippi River below Grafton" ×1
- "Colorado River near Grand Canyon" ×1
- "AZ" ×1
- "Eel River at Scotia" ×1
- "CA" ×1
- "Colorado River near Supai" ×1
- "Missouri River at Sioux City" ×1
- "Missouri River at Omaha" ×1
- "Nebraska" ×1
- "Missouri River at Nebraska City" ×1
- "Missouri River at St. Joseph" ×1
- "Missouri River at Kansas City" ×1
- "Kansas" ×1
- "Missouri River at Waverly" ×1
- "Mississippi River at St. Louis" ×1
- "MO gage" ×1
- "Alki Point" ×1
- "Seattle" ×1
- "Mississippi River at Tarbert Landing" ×1
- "LA" ×2
- "Sacobia River" ×1
- "Mt. Pinatubo" ×1
- "Gullys near Treynor" ×1
- "Leavenworth Bend" ×1
- "St. Louis" ×1
- "MO to Donaldsonville" ×1
- "Clark County" ×1
- "Watersheds near Riesel" ×1
- "TX" ×1
- "Roanoke River" ×1
- "Tuttle Creek Spillway" ×2
- "US Forest Service Regions 1 through 6" ×1
- "Magpie Creek" ×1
- "Canyon Ferry" ×2
- "Hellgate Gulch" ×1
- "Upper Paget Creek" ×1
- "Ashland" ×1
- "Mihoesti Dam" ×1
- "Altinkaya Dam" ×1
- "Rhône River from Swiss Border to Mediterranean" ×1
- "Duozhao Ravine" ×1
- "Jiangjia River basin" ×1
- "Ralston Afterbay on Middle American River(Oxbow Powerhouse)" ×1
- "(Savage River Dam) Savage River Reservoir" ×1
- "Upper Beaver Creek" ×1

### 3 site-linked literature entries with blank document_type
- Missouri River — "Missouri River Bed and Water Surface Changes between 2009 and 2014 as "
- Minnesota Rivers — "Geologic History of Minesota Rivers"
- Missouri River Geomorphology — "Missouri River Temperature Effects in Transition from Dunes to Plane B"

### Geometry vs Survey123 text-coordinate mismatches (>0.001°)
- Tuttle Creek: geometry [-96.5943465450358, 39.2562232982835] vs attribute [-96.584991, 39.248475]
- Millsite Reservoir: geometry [-111.1978, 39.0965555600001] vs attribute [39.09655556, -111.1978]
- Mrica Reservoir: geometry [109.6061, -7.39229999999998] vs attribute [-7.3923, 109.6061]
- Santee River into Cooper River diversion: geometry [-80.1176369819627, 33.3591392790601] vs attribute [-80.0535, 33.301222]

### NID IDs with no match in the National Inventory of Dams service
- 11111 *(resolved 2026-08-30: this was the test record "Narnia Test 123"; the whole
  test-record cluster — the site, literature `L0465` "This is a Test", and entries
  `E01408`/`E01409` — was removed from the CSVs with owner approval. Note this log's
  acceptance counts above still record the migration's own output, 979/466/1,410.)*

### Keyword case variants (left as-is; filters match case-insensitively, mirroring ArcGIS)
- sites.site_type: "Flood control" ×38 / "Flood Control" ×178
- sites.site_type: "Water supply" ×144 / "Water Supply" ×67
- sites.site_type: "Sediment Control" ×22 / "Sediment control" ×1 / "sediment control" ×1
- sites.site_type: "Dry Dam" ×1 / "dry dam" ×14
- sites.ecological_concern: "Water Quality" ×126 / "Water quality" ×1
- literature.data_collection: "Sediment" ×307 / "sediment" ×1
- literature.data_collection: "Water Quality" ×96 / "Water quality" ×3
- literature.modeling: "Laboratory Analysis" ×66 / "Laboratory analysis" ×4
- literature.modeling: "Ecological Modeling" ×5 / "Ecological modeling" ×1
- literature.adaptive_management: "Watershed Planning" ×36 / "watershed planning" ×22 / "Watershed planning" ×92
- literature.adaptive_management: "Economics" ×26 / "economics" ×10
- literature.adaptive_management: "Flood risk" ×105 / "Flood Risk" ×5
- literature.adaptive_management: "planning" ×1 / "Planning" ×1
- literature.sediment_characteristic: "Sand" ×148 / "sand" ×1
- literature.sediment_characteristic: "Gravel" ×105 / "gravel" ×1
- literature.sediment_characteristic: "Silt" ×83 / "silt" ×1
- literature.sediment_characteristic: "Clay" ×84 / "clay" ×1
- literature.sediment_characteristic: "Woody Particles" ×9 / "Woody particles" ×1
- literature.sediment_source: "Reservoir Pool" ×4 / "Reservoir pool" ×37 / "reservoir pool" ×1
- literature.sediment_source: "Bank Erosion" ×6 / "Bank erosion" ×57
- literature.sediment_source: "Reservoir Release" ×9 / "Reservoir release" ×34
- literature.sediment_source: "Headcut" ×23 / "headcut" ×1
- literature.sediment_source: "Erosion" ×198 / "erosion" ×10
- literature.sediment_source: "Plunge Pool" ×9 / "Plunge pool" ×2
- literature.sediment_source: "Emergency Spillway" ×13 / "Emergency spillway" ×2
- literature.risk_and_uncertainty: "Structure failure" ×38 / "Structure Failure" ×9
- literature.risk_and_uncertainty: "Adaptive maNot Applicablegement" ×2 / "Adaptive MaNot Applicablegement" ×16
- literature.risk_and_uncertainty: "drought" ×23 / "Drought" ×4
- literature.special_cases: "Wildfire" ×10 / "wildfire" ×13
- literature.special_cases: "Ice" ×33 / "ice" ×1
- literature.special_cases: "Landslide" ×14 / "landslide" ×2
- literature.sustainable_sediment_management: "Sediment Release" ×37 / "Sediment release" ×132 / "sediment release" ×4
- literature.sustainable_sediment_management: "Flood diversion" ×41 / "flood diversion" ×1 / "Flood Diversion" ×1
- literature.sustainable_sediment_management: "Deposition Control" ×61 / "Deposition control" ×91 / "deposition control" ×5
- literature.sustainable_sediment_management: "dam removal" ×10 / "Dam Removal" ×7 / "Dam removal" ×1
- literature.sustainable_sediment_management: "Depostion control" ×3 / "Depostion Control" ×1
- literature.sustainable_sediment_management: "Beneficial use of dredged material" ×2 / "beneficial use of dredged material" ×2
- literature.sustainable_sediment_management: "Beneficial use of dredged materials" ×5 / "beneficial use of dredged materials" ×3
- literature.sustainable_sediment_management: "Dam Raise" ×1 / "Dam raise" ×2
- literature.land_use: "Forestry" ×51 / "forestry" ×10
- literature.land_use: "Multi-use" ×26 / "multi-use" ×4
- literature.land_use: "Beach" ×11 / "beach" ×1
- literature.land_use: "Agriculture" ×27 / "agriculture" ×1
- literature.channel_type: "Mountain torrents" ×46 / "Mountain Torrents" ×6
- literature.channel_type: "Deltas" ×37 / "deltas" ×2
- literature.channel_type: "Meandering rivers" ×23 / "Meandering Rivers" ×1 / "meandering rivers" ×1
- literature.channel_type: "Modified streams" ×28 / "Modified Streams" ×3
- literature.channel_type: "Regulated rivers" ×40 / "Regulated Rivers" ×9
- literature.channel_type: "Meandering" ×1 / "meandering" ×1
- entries.data_collection: "Sediment" ×825 / "sediment" ×1
- entries.data_collection: "Water Quality" ×294 / "Water quality" ×6
- entries.modeling: "Laboratory Analysis" ×92 / "Laboratory analysis" ×5
- entries.modeling: "Ecological Modeling" ×20 / "Ecological modeling" ×3
- entries.adaptive_management: "Watershed Planning" ×54 / "watershed planning" ×117 / "Watershed planning" ×338
- entries.adaptive_management: "Economics" ×41 / "economics" ×33
- entries.adaptive_management: "Flood risk" ×360 / "Flood Risk" ×8
- entries.adaptive_management: "planning" ×1 / "Planning" ×1
- entries.sediment_characteristic: "Sand" ×310 / "sand" ×3
- entries.sediment_characteristic: "Gravel" ×225 / "gravel" ×1
- entries.sediment_characteristic: "Silt" ×191 / "silt" ×46
- entries.sediment_characteristic: "Clay" ×190 / "clay" ×46
- entries.sediment_characteristic: "Woody Particles" ×9 / "Woody particles" ×1
- entries.sediment_source: "Reservoir Pool" ×4 / "Reservoir pool" ×189 / "reservoir pool" ×1
- entries.sediment_source: "Bank Erosion" ×38 / "Bank erosion" ×104
- entries.sediment_source: "Reservoir Release" ×9 / "Reservoir release" ×126
- entries.sediment_source: "Headcut" ×33 / "headcut" ×1
- entries.sediment_source: "Erosion" ×530 / "erosion" ×17
- entries.sediment_source: "Plunge Pool" ×10 / "Plunge pool" ×9
- entries.sediment_source: "Emergency Spillway" ×27 / "Emergency spillway" ×17
- entries.risk_and_uncertainty: "Structure failure" ×317 / "Structure Failure" ×10
- entries.risk_and_uncertainty: "Adaptive maNot Applicablegement" ×8 / "Adaptive MaNot Applicablegement" ×65
- entries.risk_and_uncertainty: "drought" ×148 / "Drought" ×22
- entries.special_cases: "Wildfire" ×58 / "wildfire" ×53
- entries.special_cases: "Ice" ×77 / "ice" ×1
- entries.special_cases: "Landslide" ×38 / "landslide" ×5
- entries.sustainable_sediment_management: "Sediment Release" ×66 / "Sediment release" ×475 / "sediment release" ×10
- entries.sustainable_sediment_management: "Flood diversion" ×122 / "flood diversion" ×1 / "Flood Diversion" ×1
- entries.sustainable_sediment_management: "Land Management" ×289 / "Land management" ×29 / "land management" ×39
- entries.sustainable_sediment_management: "Deposition Control" ×168 / "Deposition control" ×293 / "deposition control" ×29
- entries.sustainable_sediment_management: "dam removal" ×10 / "Dam Removal" ×191 / "Dam removal" ×2
- entries.sustainable_sediment_management: "Depostion control" ×3 / "Depostion Control" ×1
- entries.sustainable_sediment_management: "Beneficial use of dredged material" ×5 / "beneficial use of dredged material" ×19
- entries.sustainable_sediment_management: "Beneficial use of dredged materials" ×8 / "beneficial use of dredged materials" ×3
- entries.sustainable_sediment_management: "Dam Raise" ×183 / "Dam raise" ×2
- entries.land_use: "Forestry" ×157 / "forestry" ×33
- entries.land_use: "Multi-use" ×79 / "multi-use" ×18
- entries.land_use: "Beach" ×28 / "beach" ×1
- entries.land_use: "Agriculture" ×95 / "agriculture" ×5
- entries.channel_type: "Mountain torrents" ×131 / "Mountain Torrents" ×27
- entries.channel_type: "Deltas" ×142 / "deltas" ×2
- entries.channel_type: "Meandering rivers" ×86 / "Meandering Rivers" ×1 / "meandering rivers" ×1
- entries.channel_type: "Modified streams" ×60 / "Modified Streams" ×23
- entries.channel_type: "Regulated rivers" ×193 / "Regulated Rivers" ×28
- entries.channel_type: "Meandering" ×1 / "meandering" ×1

## Acceptance gate (all must pass for this log to exist)

- sites: **979** (expected 979)
- literature: **466** (expected 466)
- entries: **1410** (expected 1410)
- site-linked entries (Site Literature view): **1192** (expected 1192)
- general literature (site_names blank): **214** (expected 214)
- baseline: Dam Removal: **8** (expected 8)
- baseline: Dam Removal OR Drawdown: **77** (expected 77)
- baseline: + Site Type Flood Control: **42** (expected 42)
- orphan entries (no parent): **0** (expected 0)
- unique site_ids: **979** (expected 979)
- entries: site_id-resolved + unmatched = site-named: **1192** (expected 1192)

## NID snapshot

`nid_snapshot.csv`: 46 records fetched 2026-08-28 from the public
NID_v1 service for the 47 distinct `nid_id` values present in
`sites.csv` (curated 21-field subset).
