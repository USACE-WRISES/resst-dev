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
| Dataset counts | 978 sites / 465 literature surveys / 1,408 entries (the migration's 979/466/1,410 minus the owner-approved 2026-08-30 removal of a test-record cluster: site "Narnia Test 123" + literature "This is a Test" and its two entries) | unit + e2e |
| Counter scopes | Site Literature = 1,191 (site-named entries) · General Literature = 214 (surveys with no sites) | unit + e2e |
| Filter semantics | substring match, case-insensitive; OR within an item; AND across items; enabled-empty item = "field has any value"; domains independent | unit (`tests/engine.test.ts`) |
| Filter baselines | Sediment Release = Dam Removal → **8**; + Drawdown → **77**; + Site Type = Flood Control → **42** | unit + e2e through the real UI |
| Filter option lists | the original hand-curated lists, order preserved (231 predefined values + dynamic pickers for Site Name and the covered-topics flags) | generated from the captured config |
| Selection propagation | site → its literature entries; site → NID record by `nid_id` | e2e (Tuttle Creek → 6 entries + NID KS00012) |
| Symbology | red circle, yellow outline, size 8; blue site-name labels with halo; no clustering | ported from service drawingInfo + web map |
| Spatial selection | the "Spatial Selection" polygon workflow the original's help documented: select sites by drawn polygon (plus box drag) | e2e (`selection.spec.ts`) |
| Welcome dialog | original text, "Don't show this again" | ported verbatim |
| Exports | CSV and Shapefile of current results (as before), plus GeoJSON | e2e download test |
| Resizable/collapsible results pane | the original's bottom Sidebar behavior: a draggable map/table divider with a half-pill collapse tab straddling it; the table pushes the map and starts expanded on desktop | e2e (`layout.spec.ts`) |

## Deliberate differences (owner-approved)

| # | Difference | Why |
|---|---|---|
| 1 | ArcGIS/Survey123 authoring replaced by repo CSVs + pull requests | Decision D2 — the repo is the database; Edit Data panel and the five embedded Survey123 forms are retired |
| 2 | Default basemap is the original app's Esri Topographic (World Topographic Map vector tiles over World Hillshade, the same public keyless anonymous endpoints the old web map referenced); the picker under the zoom control keeps USGS National Map topo as the other option | Owner request 2026-08-29 restored the original look as the default; D4's keyless rule stands (no API key anywhere). USGS remains the boot style and the resilient public-domain fallback — if the anonymous Esri endpoints are ever gated or unreachable, the app auto-reverts to USGS with a retryable error and forgets the stored choice, so the next visit retries the default. Caveats now apply to the default: Esri's worldwide labels lack RTL shaping (no RTL plugin), but it stays crisp past z16 where the USGS raster overscales |
| 3 | Esri geocoder search → attribute search over site names plus USGS GNIS place search (streams, rivers, lakes, cities, landforms — the keyless public-domain gazetteer at carto.nationalmap.gov) | D4; the address geocoder was Esri-bound. GNIS restores find-a-place keylessly: a chosen place gets a pin and zoom-to, matching the original's observed behavior. US coverage only |
| 4 | Site Literature tab shows the 1,192 site-linked view | D8 — the old app's tab showed all 1,410 while its counter said 1,192 (latent inconsistency) |
| 5 | Global "Clear all" filters control added | D8 |
| 6 | NID details curated to ~20 labeled fields (was an ~80-field dump with Arcade expressions) | D8 |
| 7 | Full-function phone layout (filters + details drawers) — the old app's phone view was map + search only | D8 |
| 8 | "Water Injection Dredging" filter option spelled correctly | The old option ("Dreding") existed only in the widget config and matched zero records; the data always said "Dredging" |
| 9 | Site→literature link made explicit (`site_id`) instead of runtime string matching | Same records link (verified 1,100/1,100 + 92 legacy unmatched preserved); disambiguates the two "Rio Grande" sites exactly as the old exact-match behaved |
| 10 | Add Data, Share widget, and the "DummyTestingSteps" test page not carried over | Add Data was a generic EXB utility; Share is replaced by ordinary URLs; the test page was unfinished content publicly reachable in the old app |
| 11 | Full-dataset downloads added (Shapefile/GeoPackage/FileGDB/CSV via the `data-latest` release) | D3 — replaces ArcGIS hosted-layer exports |
| 12 | Accessibility rebuilt (labeled controls, keyboard-complete, axe-clean) | The old app exposed a nearly empty accessibility tree |
| 13 | Left/right side panels collapse via the original's edge half-pill toggles: the panel disappears completely and the pill slides to the app edge. Normalized: the original styled only its right sidebar (and bottom pane) as a half-pill — its left sidebar still had the stock builder tab; both sides use the pill here | Owner requests (launch review + 2026-08-29) — full-width map/table when filters or details aren't needed, with the original's affordance |
| 14 | The results table starts expanded on phones and stays drag-resizable there (the original auto-collapsed its bottom pane to a 200px top drawer on tablet/phone) | Extends D8 / difference 7 — the full-function phone layout |
| 15 | The Views (bookmarks) control removed | Owner request 2026-08-29 — the Layers panel already toggles every overlay a view could set (HUC 2/4/6/8, Rivers, and more, independently), and all six captured views shared the app's start extent, so views added only thumbnails (~3.7 MB) |
| 16 | The map's attribution control (ⓘ) removed | Owner request 2026-08-29 — the credits move to the footer's basemap label and Help → About → Credits, wording preserved. Note this trades away the always-visible attribution Esri's terms prefer |
| 17 | The "Data & Code" header link removed | Owner request 2026-08-29 — the repository stays reachable through the Download Data dialog |
| 18 | Help rebuilt: wider structured layout (goal/when/result facets + numbered steps, scrollable), copy rewritten around this app's actual controls, screenshots re-captured from this app (`scripts/help-screenshots.mjs`) | Owner request 2026-08-29 — the ported text/images described Experience Builder widgets that no longer exist ("Bookmarks", "Layer List", "Select-by-layer"); the originals remain in the migration archive |
| 19 | Selection beyond the original: select-by-HUC (click a basin, HUC 2–8) and near-a-river (click a river, live distance in miles) — both resolve instantly and fully client-side against the self-hosted overlay snapshots (difference 20), so the boundary you see is exactly the boundary you select | Owner request 2026-08-29 |
| 20 | The HUC 2/4/6/8 and rivers reference overlays are self-hosted static snapshots (`public/overlays/`, ~123 MB raw / ~31 MB gzipped transfer, each file lazy-loaded once on first toggle) instead of streaming from the Living Atlas services, whose per-request simplification took 10-30 s per first load | Owner request 2026-08-29. Sources: the USGS WBD server at hydro.nationalmap.gov (public domain — deliberately NOT the Esri-hosted Living Atlas copies, which sit under the Esri Master License Agreement) at ~200 m (HUC2) / ~110 m (HUC4) / ~55 m (HUC6/8) tolerance; rivers from the CEC North American Environmental Atlas (CC BY 4.0, credited in Help → About). Refresh with `npm run build:overlays`. NID / stream gauges / SSURGO still stream live |
| 21 | The Selected Data panel is reorganized into collapsible sections and, for the ~360 sites cross-linked to the national ResNet/RATTES datasets, gains modeled Reservoir Sustainability (headline stats + storage/sediment trajectory chart) and measured-survey Evidence sections. Team-collected content stays first (attributes → Sediment Management → Site Literature); the NID reference record is collapsed by default. Every value group carries a provenance badge (Reported / Modeled / Measured) with source + DOI popovers, and the footer names the dataset vintages | Owner-approved sedimentation decision-support expansion, 2026-08-29 (plan: RATTES v1.2 silt scenario · ResNet v1 · RESSED 2013; crosswalk curated in `data/site_resnet_crosswalk.csv`; distilled data in `public/sediment/`, rebuilt via `npm run build:sediment`) |
| 22 | Reservoir Network section + map explorer: upstream/downstream dam counts, terminal/headwater status, drains-to river mouth, a drainage-vs-sediment-contributing-area bar, and Upstream / Downstream / Full-network map highlights (schematic dashed downstream path with labeled river-mouth nodes) | Sedimentation expansion — ResNet routed network (Hurst et al. 2025); wording deliberately says sediment "would encounter" downstream reservoirs, never that it reaches the coast |
| 23 | A togglable national inventory layer renders all 57,307 modeled reservoirs beneath the documented sites, styled by a picked RATTES metric (% capacity lost 2025/2050, annual rate, storage, evidence), with a legend ramp; clicking an undocumented dam opens a reservoir details panel (Sustainability / Evidence / Network, no literature) | Sedimentation expansion — puts the documented sites in national context and makes the scarcity of documented management visible; default off, ~2.3 MB gzipped lazy load on first toggle |
| 24 | A Screening popover (map toolbar, beside Layers — deliberately not inside Data Filters, which stay the documented-data engine) combines transparent criteria over the modeled inventory, with the four gap-analysis quadrants as one-click presets, a live count, zoom-to-matches, and CSV export | Sedimentation expansion — the national screening/gap-analysis workflow (ideas doc §6–7); wording fixed to "potential opportunities … warranting further evaluation", never "needs intervention" |
| 25 | A Comparable Reservoirs section (both panel variants) ranks the national inventory by physical/model similarity and lists documented RESST analogs first, each with its management keywords, clicking through to the analog's record | Sedimentation expansion — the management-analog finder (ideas doc §5); the score is documented in Help as a relative index |
| 26 | Help rebuilt around the decision-support arc: About + five workflows (Assess a Reservoir · Find Analogs · Screen Nationally · By Region & River [the former By HUC + By River merged] · By Category), with the RATTES/ResNet/RESSED citations added to Credits; the welcome splash gains one sentence introducing the national context | Sedimentation expansion — the new workflows partially replace the original four (owner direction); the ported splash text otherwise stays verbatim |

## Open items for the owner

- Approve fixes for the discovered value corruptions
  ("…maNot Applicablegement" ×93, "Depostion" ×8) — currently preserved as-is.
- **Resolved 2026-08-30 (owner-approved):** the test-record cluster removed
  (site "Narnia Test 123" + literature "This is a Test" and its two entries;
  counts 979/466/1,410 → 978/465/1,408), and three `nid_id` name-collision
  errors corrected with `data/nid_snapshot.csv` refreshed accordingly:
  `harlan-county-dam` OK20717 → **NE01066** (the old ID was a 70 ac-ft private
  Oklahoma pond named "Mitchell Harlan H."; the USACE dam matched at 646 m
  with an exact name); `mercier-dam` GA05804 → **blank** (the site is Barrage
  Mercier, Québec — the old ID was a 26 ac-ft Georgia fish pond, and no US NID
  can be correct); `arroyo-seco` CA00613 → **CA00189, Devils Gate Dam** — an
  informed **assumption** (the old ID was a same-named private irrigation dam
  on the wrong watercourse; Devils Gate is the Arroyo Seco flood-control
  structure, 5.9 km downstream of the site coordinates) — please confirm.
- Same decision class, found in the launch review: mojibake in some
  international address/city values (48 `Ã` sequences in `data/sites.csv`,
  e.g. "HumaitÃ¡" for "Humaitá") — also preserved as-is.
- Optionally relink the 92 legacy entries whose site text matches no site
  (list in `data/MIGRATION-LOG.md`).
- Backfill coordinates for the 15 unlocated sites when known.
- Cutover steps: see [CUTOVER-CHECKLIST.md](CUTOVER-CHECKLIST.md).
