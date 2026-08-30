# Raw sedimentation-dataset downloads

The `data/rattes/`, `data/resnet/`, and `data/ressed/` directories hold raw downloads of
three public reservoir-sedimentation datasets. They are **gitignored** (RATTES alone is
2.47 GB and several files exceed GitHub's 100 MB hard limit) and are consumed only by the
dev-time build pipeline (`npm run build:crosswalk`, `npm run build:sediment`), whose
distilled outputs under `public/sediment/` **are** committed. This file records exactly
what was downloaded, from where, and how to re-fetch it.

All files below were downloaded and hashed on **2026-08-29**. Hashes are the first 16 hex
characters of SHA-256.

Licensing: RESSED and NID are US-government public domain. The RATTES article is
CC BY 4.0; its Zenodo data record and the ResNet Zenodo record carry the authoritative
data licenses (the ResNet *article* PDF shows CC BY-NC-ND 4.0 while the GitHub repo shows
MIT). **License verification/clearance is handled by the project owner**; the app ships
full citations and credits regardless (Help → About).

---

## RATTES v1.2 — modeled reservoir capacity & sediment, 1699–2050

- Paper: Eckland, A.C., Foster, M.A., Hurst, A.A., Beyene, M.T., Overeem, I. (2026).
  *Reservoir sedimentation diminishes water storage and coastal delta resiliency.*
  Nature Communications. https://doi.org/10.1038/s41467-026-76986-3 (CC BY 4.0)
- Data (time series): https://doi.org/10.5281/zenodo.20789549
- Code: https://github.com/abbyeckland/rattes-naturecomms · https://doi.org/10.5281/zenodo.21690856
- Delta-impact outputs (not downloaded): https://doi.org/10.5281/zenodo.21692937
- Contacts (per readme): aeckland@uno.edu, mfoster@usbr.gov

Shape: every CSV is 353 columns × 57,308 lines. Header row is `NaN,1699,…,2050`;
column 0 of each data row is the **ResNet ShortID**; cells are m³. `Hi`/`Lo` files are
95% confidence bounds. **v1.2 silt is the final RATTES version** (per
`v1.2/Zenodo_Readme.txt`); sand/clay are end-member scenarios; v1.1 is superseded.
Reservoirs without permanent storage are included with capacity held flat.

Quirks:
- Filename token order differs: `Capacity*_m3_<grain>_010626.csv` but
  `Sediment*_<grain>_m3_010626.csv` — glob carefully.
- Year → 0-based field index is `year − 1698` (2025 → 327, 2050 → 352).
- The v1.2 readme references `ResNetInput_SitesCanada_052225.csv` and
  `#RESNET run notes.txt`, which are **not in this download** (acquisition TODO below).

| File | Bytes | SHA-256/16 |
|---|---:|---|
| `s41467-026-76986-3_reference (1).pdf` | 2,781,066 | 63e37c33918ef6d5 |
| `v1.1/Capacity_m3_010626.csv` | 114,616,441 | 9fffa2128ab0be95 |
| `v1.1/CapacityHi_m3_010626.csv` | 114,615,707 | 85ab90275e54587e |
| `v1.1/CapacityLo_m3_010626.csv` | 69,977,693 | 865a082486707dd9 |
| `v1.1/Sediment_m3_010626.csv` | 114,282,119 | a8b9a1ee81f50b5d |
| `v1.1/SedimentHi_m3_010626.csv` | 91,258,650 | 22e2c25388cd925e |
| `v1.1/SedimentLo_m3_010626.csv` | 114,282,591 | 3d882a3f073116ab |
| `v1.1/Zenodo_Readme.txt` | 595 | a060161396786893 |
| `v1.2/Capacity_m3_clay_010626.csv` | 115,093,939 | 20d98d954d941b76 |
| `v1.2/Capacity_m3_sand_010626.csv` | 106,771,826 | 6049aaebc5eeafa2 |
| `v1.2/Capacity_m3_silt_010626.csv` | 114,616,440 | 943200e2dda579d3 |
| `v1.2/CapacityHi_m3_clay_010626.csv` | 115,094,491 | 6d106b2ecb84a2d8 |
| `v1.2/CapacityHi_m3_sand_010626.csv` | 106,771,605 | 948e1908c9a6c065 |
| `v1.2/CapacityHi_m3_silt_010626.csv` | 114,616,419 | 5b1229419edaf162 |
| `v1.2/CapacityLo_m3_clay_010626.csv` | 76,963,541 | 46ab24a218fb5c30 |
| `v1.2/CapacityLo_m3_sand_010626.csv` | 68,822,407 | c4cd50d4557ad9ea |
| `v1.2/CapacityLo_m3_silt_010626.csv` | 72,137,474 | 26c45fd22a641262 |
| `v1.2/Sediment_clay_m3_010626.csv` | 114,534,170 | 57102b1dcee72e45 |
| `v1.2/Sediment_sand_m3_010626.csv` | 110,054,378 | 695f14e58d2beba8 |
| `v1.2/Sediment_silt_m3_010626.csv` | 114,282,110 | ab64ee68bcb60094 |
| `v1.2/SedimentHi_clay_m3_010626.csv` | 94,821,641 | 30828465c9aa3199 |
| `v1.2/SedimentHi_sand_m3_010626.csv` | 90,593,517 | e0c893ef6fcbe68d |
| `v1.2/SedimentHi_silt_m3_010626.csv` | 92,325,283 | 3ca36293865415b0 |
| `v1.2/SedimentLo_clay_m3_010626.csv` | 114,534,591 | 24d480994de4d262 |
| `v1.2/SedimentLo_sand_m3_010626.csv` | 110,055,986 | 196eb099ada031d9 |
| `v1.2/SedimentLo_silt_m3_010626.csv` | 114,281,265 | 46f09b96553ba27a |
| `v1.2/Zenodo_Readme.txt` | 1,077 | 3ce27bfa41a9c604 |

The pipeline reads only the six `v1.2` **silt** files.

### Supplementary files (`supp/`, added 2026-08-30)

| File | Bytes | SHA-256/16 | Source |
|---|---:|---|---|
| `supp/41467_2026_76986_MOESM3_ESM.xlsx` | 175,252 | 44d6e80be6de9e35 | Supplementary Data 1 from the article page (CC BY 4.0) — the surveyed-site compilation appended to ResNet |
| `supp/ResNetInput_SitesCanada_052225.csv` | 19,022,443 | 83f4226f83e1710f | The RATTES model's actual input table, from the code repo's Git-LFS storage (`media.githubusercontent.com/media/abbyeckland/rattes-naturecomms/main/ResNet1_2026_RATTES_Apr26_Matlab/RATTES_final/SYModel_MLRinput_RATTES_1/…`); hash matches the LFS pointer's oid |

These feed the **tracked** `data/rattes_survey_sites.csv` (924 rows): the
reservoirs with qualifying repeat surveys (`yr1`/`yr2` present, interval ≥ 10
years) per Supplementary Data 1's own criteria — cross-verified as exactly the
same 924 ShortIDs carrying `yr1`/`yr2` pairs in the model input file. The
paper reports **904** survey-constrained reservoirs; the 20-row difference is
internal to the published model run and not reproducible from the public
files, so the app labels these sites "repeat surveys in the RATTES
compilation" rather than claiming the 904 count. `build-sediment.mjs` turns
the list into the inventory's `evd` column (1 = survey-constrained,
2 = statistical prediction). Re-derive with `openpyxl`: header row 15 of the
xlsx; keep rows with numeric `yr1` and `yr2` and `yr2 − yr1 ≥ 10`; emit
`short_id, dam_name, survey_yr1, survey_yr2` sorted by `short_id` (CRLF).

## ResNet — routed national dam network

- Paper: Hurst, A.A., Foster, M.A., Eckland, A.C. (2025). *The ResNet network of dams
  impounding storage reservoirs across the continental United States.* Scientific Data,
  12, 2044. https://doi.org/10.1038/s41597-025-06315-8
- Data: https://doi.org/10.5281/zenodo.15644268 · Code: https://github.com/hurstaa/ResNet

`database/ResNet.csv`: 57,452 rows × 40 cols (col 0 is an unnamed index). `NID` is 100%
populated and unique; 145 synthetic `MOUTH_*` river-mouth rows have negative ShortIDs.
Quirks:
- `FromDam` is a serialized Python repr (`"[np.float64(288955.0), …]"`) — regex-extract,
  never JSON-parse. The pipeline instead derives upstream links by inverting `ToDam`.
- Mouth rows carry placeholder `yrc = 1700.0`; `yrc = 0` elsewhere means unknown.
- `delta` column is unreliable (populated on ~56 rows); use `DeltaTag`.
- `NHDFlowline_*` inputs were intentionally withheld by the authors (outputs only).

| File | Bytes | SHA-256/16 |
|---|---:|---|
| `database/GRanD_dams_v1_3.csv` | 4,920,914 | 55ed06cb61687ba1 |
| `database/InputCanada.csv` | 1,601 | c2c59ef2ea3d9033 |
| `database/ReadMe.txt` | 1,202 | 31793b98b1b33181 |
| `database/RemovedDams.csv` | 12,419 | 87d6d8652c2f21f0 |
| `database/ResNet.csv` | 16,225,586 | aca3e6abc8368b60 |
| `database/resnet_attributes.csv` | 260,740 | aeb287fd004da425 |
| `database/resnet_datacrossreference.csv` | 3,599,226 | 12f5077f74ebdb41 |
| `github link.txt` | 33 | 2661c9c0362addcf |
| `s41597-025-06315-8.pdf` | 2,740,645 | 3dad75b4bdb9cdc5 |
| `s41597-025-06315-8_reference.pdf` | 1,271,737 | 30d0afe651416a32 |

## RESSED — USGS reservoir sedimentation surveys (2013 snapshot)

- Home: https://water.usgs.gov/osw/ressed/ (US public domain)
- 2013 export + docs: https://water.usgs.gov/osw/ressed/db_doc2013/index.html and
  https://water.usgs.gov/osw/ressed/download2013/index.html
- 2009 predecessor (RESIS-II): Ackerman, K.V., et al. (2009). USGS Data Series 434.
  https://doi.org/10.3133/ds434

The pipeline reads only `2013_database/json/ressed_export_20130404.json/…​.json`
(2,194 reservoirs / 7,752 surveys). The XML is the same content 4× larger; the 2009
Access `.mdb` is superseded. Quirks:
- The JSON is an XML-shaped export: `reservoir.survey` and `survey.stat` are bare
  objects (not arrays) when singular — normalize to arrays.
- `nid_id` has trailing whitespace and 20 duplicate values across reservoirs.
- Units are Inch/Pound (capacity ACFT × 1233.48 → m³; area AC × 4046.86 → m²;
  dry weight lb/ft³ × 16.01846 → kg/m³). Bad survey years exist (e.g. `2975`).
- `survey_type_cd` is dirty (RNG/Range/RANGE/RGN; CON/Contour/CONTOUR;
  RCT/Range-Contour) — the pipeline case-folds those onto the DS434 codes and
  passes everything else through verbatim. **RLCS, TBS, and pool code U are not
  defined anywhere public** — checked in the JSON/XML exports (no lookup table),
  the Data Explorer source, the 2009 `.mdb`, DS434 (defines only
  `pool_id (A, G, S, T)` without expansions and `surv_type` RaNGe/CONtour/
  Range-ConTour, `surv_subtype` (R)econnaissance/(D)etailed/(S)emi-detailed),
  and `db_doc2013/index.html` (2026-08-30). `U` appears only on the FY2012
  USACE tranche (739 of 780 rows COE-owned; 772 of 780 carry no stat values).
  Structural evidence for T = total pool / S = sediment pool: 559 same-date
  S+T pairs and notes like "Sediment Pool Only." — the UI labels these as
  evidence-based, not documented.

### Scanned original datasheets (verified 2026-08-30)

The per-reservoir scanned SCS Form 34 datasheets are live at
`https://water.usgs.gov/osw/ressed/datasheets/{D}-{N}.pdf`, indexed from
`https://water.usgs.gov/osw/ressed/list_reservoirs/index.html`. **The RESSED
`reservoir_id` below 100000 IS the legacy RESIS-II datasheet number (`dsnum`)
encoded as `D*1000 + N`**: 32003 (Kanopolis Lake) ↔ `32-3.pdf`,
45025 (Adair) ↔ `45-25.pdf`, 46026 (Adams) ↔ `46-26.pdf`. A 20-reservoir
random sample of constructed URLs (seed 42, restricted to `id < 100000` with
an `nid_id`) returned HTTP 200 for **20/20**. Post-RESIS additions carry
`100xxx` ids (Tuttle Creek Lake = 100080) and have no datasheet. The app links
these PDFs from the Evidence section (USGS hosts them; no bandwidth cost here).

| File | Bytes | SHA-256/16 |
|---|---:|---|
| `2009_database/ds434.pdf` | 322,598 | 92ad4cfffd3dac08 |
| `2009_database/msaccess_2009_database/ressed_II_DS434_2009_Database.mdb` | 14,131,200 | 1fa116e05101f827 |
| `2013_database/data_explorer_app_source_code/ressed_data_explorer_20130424.zip` | 1,549,815 | b913856a60d541a4 |
| `2013_database/data_explorer_app_source_code/…/d3.min.js` | 137,383 | 7038c64c31091195 |
| `2013_database/data_explorer_app_source_code/…/ressed_export_20130404.json` | 12,332,744 | 5200acff9296f7f6 |
| `2013_database/data_explorer_app_source_code/…/ressed_faceted_search_20130424.html` | 16,413 | 957ec74b169b02d5 |
| `2013_database/data_explorer_app_source_code/…/us-states.json` | 87,926 | 1971c2f51562caaa |
| `2013_database/json/ressed_export_20130404.json.zip` | 1,468,112 | c9b53a787e77fdd0 |
| `2013_database/json/ressed_export_20130404.json/ressed_export_20130404.json` | 12,332,745 | a1462bbc5acdf28b |
| `2013_database/xml/ressed_export_201304041600.xml.zip` | 3,565,709 | 23640856d9563030 |
| `2013_database/xml/ressed_export_201304041600.xml/ressed_export_201304041600.xml` | 52,026,062 | 4ad743636a218325 |
| `list_of_reservoirs_and_original_datasheets.txt` | 60 | b75453f7bef92868 |
| `resed_references.txt` | 5,842 | 3829beb5d65eda6a |
| `website.txt` | 34 | 9d91110a2e6dde00 |

---

## Rebuild runbook

1. Place the raw downloads at the paths above (re-fetch from the DOIs/URLs if absent;
   verify against the hashes).
2. `npm run build:crosswalk` — regenerates the auto rows of
   `data/site_resnet_crosswalk.csv` (curated: `confirmed`/`rejected`/`manual` rows are
   never overwritten; edit `status`/`notes` to curate).
3. `npm run build:sediment` — emits `public/sediment/` (inventory, trajectory chunks,
   surveys, site enrichment, manifest) with hard validation baselines and per-file
   raw+gzip size logging. Deterministic: rerunning against unchanged inputs must produce
   a zero git diff.
4. Review the size log, run `npm run validate && npm run test`, commit the outputs.

## Acquisition TODOs

- ~~RATTES Supplementary Data 1~~ — **done 2026-08-30** (see the `supp/` table above):
  `evd` now ships 1/2 from the tracked `data/rattes_survey_sites.csv`.
- ~~Re-fetch the RATTES-vintage ResNet input~~ — **done 2026-08-30**: the model's own
  `ResNetInput_SitesCanada_052225.csv` was retrieved from the code repo's LFS storage
  (hash matches the pointer) and confirms the survey-site set exactly.
