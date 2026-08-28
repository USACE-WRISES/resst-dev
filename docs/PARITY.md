# Parity record — rebuilt app vs. ArcGIS Experience Builder RESST

The original app's behavior was captured live on 2026-08-28 (network
where-clauses, counters, widget configuration, data extracts verified against
service counts) before any code was written; the full record is the
[migration assessment](../RESST-migration/07-assessment/RESST-migration-assessment.md).
This document is the acceptance summary: what matches, and every deliberate
difference.

## Verified equivalences (enforced by tests)

| Behavior | Baseline | Where tested |
|---|---|---|
| Dataset counts | 979 sites / 466 literature surveys / 1,410 entries | unit + e2e |
| Counter scopes | Site Literature = 1,192 (site-named entries) · General Literature = 214 (surveys with no sites) | unit + e2e |
| Filter semantics | substring match, case-insensitive; OR within an item; AND across items; enabled-empty item = "field has any value"; domains independent | unit (`tests/engine.test.ts`) |
| Filter baselines | Sediment Release = Dam Removal → **8**; + Drawdown → **77**; + Site Type = Flood Control → **42** | unit + e2e through the real UI |
| Filter option lists | the original hand-curated lists, order preserved (231 predefined values + dynamic pickers for Site Name and the covered-topics flags) | generated from the captured config |
| Selection propagation | site → its literature entries; site → NID record by `nid_id` | e2e (Tuttle Creek → 6 entries + NID KS00012) |
| Symbology | red circle, yellow outline, size 8; blue site-name labels with halo; no clustering | ported from service drawingInfo + web map |
| Map views | Default, USGS HUC2/4/6/8, Rivers — extents + overlay sets + original thumbnails | generated from the bookmark widget |
| Help | the five workflows (About, By Reservoir, By HUC, By River, By Category) with original images and text | generated from the config |
| Welcome dialog | original text, "Don't show this again" | ported verbatim |
| Exports | CSV and Shapefile of current results (as before), plus GeoJSON | e2e download test |

## Deliberate differences (owner-approved)

| # | Difference | Why |
|---|---|---|
| 1 | ArcGIS/Survey123 authoring replaced by repo CSVs + pull requests | Decision D2 — the repo is the database; Edit Data panel and the five embedded Survey123 forms are retired |
| 2 | Esri Topographic basemap → USGS National Map topo | D4 — no API key, public domain |
| 3 | Esri geocoder search → attribute search over site names | D4; the address geocoder was Esri-bound |
| 4 | Site Literature tab shows the 1,192 site-linked view | D8 — the old app's tab showed all 1,410 while its counter said 1,192 (latent inconsistency) |
| 5 | Global "Clear all" filters control added | D8 |
| 6 | NID details curated to ~20 labeled fields (was an ~80-field dump with Arcade expressions) | D8 |
| 7 | Full-function phone layout (filters + details drawers) — the old app's phone view was map + search only | D8 |
| 8 | "Water Injection Dredging" filter option spelled correctly | The old option ("Dreding") existed only in the widget config and matched zero records; the data always said "Dredging" |
| 9 | Site→literature link made explicit (`site_id`) instead of runtime string matching | Same records link (verified 1,100/1,100 + 92 legacy unmatched preserved); disambiguates the two "Rio Grande" sites exactly as the old exact-match behaved |
| 10 | Add Data, Share widget, and the "DummyTestingSteps" test page not carried over | Add Data was a generic EXB utility; Share is replaced by ordinary URLs; the test page was unfinished content publicly reachable in the old app |
| 11 | Full-dataset downloads added (Shapefile/GeoPackage/FileGDB/CSV via the `data-latest` release) | D3 — replaces ArcGIS hosted-layer exports |
| 12 | Accessibility rebuilt (labeled controls, keyboard-complete, axe-clean) | The old app exposed a nearly empty accessibility tree |

## Open items for the owner

- Approve fixes for the discovered value corruptions
  ("…maNot Applicablegement" ×93, "Depostion" ×8) — currently preserved as-is.
- Optionally relink the 92 legacy entries whose site text matches no site
  (list in `data/MIGRATION-LOG.md`).
- Backfill coordinates for the 15 unlocated sites when known.
- Cutover steps: see [CUTOVER-CHECKLIST.md](CUTOVER-CHECKLIST.md).
