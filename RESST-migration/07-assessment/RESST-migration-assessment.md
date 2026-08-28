# RESST Migration Assessment

**Prepared:** 2026-08-28 · **Status:** For owner review — no implementation has begun (per brief rule 1)
**Subject:** Reservoir Sustainable Sediment Tool (RESST), ArcGIS Experience Builder app `b1eec438459e45c284df2fcf89e5d8e0`

Everything in this assessment is grounded in evidence collected 2026-08-28: the published Experience configuration, web-map JSON, feature-service definitions, full data extracts (verified against service counts), and a live behavioral session driving the public app in a browser — including captured network `where=` clauses. Facts, inferences, and recommendations are labeled. Nothing in ArcGIS was modified.

---

## 1. Executive assessment

RESST is a public, data-rich explorer with a small, gated data-entry side. The read path — map, three keyword-filter groups, four result tables, cross-linked selection details, CSV/Shapefile export — operates on three small datasets (979 sites, 466 literature-survey points, 1,410 literature entries, ~4 MB raw total) that the current app already ships to the browser and filters with simple SQL patterns. The write path is five embedded Survey123 forms ("Add/Edit Site", "Add/Edit Literature") restricted to specific signed-in users.

**Likely direction (validated below):** rebuild the read path as a static TypeScript web application deployed to GitHub Pages, while **keeping ArcGIS Online + Survey123 as the data-authoring system**. A scripted, validated pipeline snapshots the hosted layers into versioned web data. The Survey123 entry workflow survives unchanged (linked or embedded), so migration decouples presentation from authoring instead of forcing a data-platform migration. Shiny on Posit Connect Cloud is not justified by any current function, but remains the natural home for *future* R-based analysis as separate linked apps.

The dataset is effectively a live research compilation (services modified January–April 2026; Survey123 collection apparently ongoing), so the snapshot-vs-live-data question is the single most consequential design decision for the owner (question Q2).

---

## 2. Evidence inventory

All artifacts were collected anonymously from public endpoints into `RESST-migration/` (see `MANIFEST.md` for URLs, sizes, and integrity checks). Per-artifact findings:

| Artifact | Current? | What it establishes | Issues found |
|---|---|---|---|
| `01…item-metadata.json` (1.5 KB) | Yes | Item is public; owner `garrett.t.menichino.erdc`; org portal `ERDC-EL.maps.arcgis.com`; ~1,085 views | No description/tags on the item |
| `02…experience-data.json` (316.6 KB, draft) | Yes | Draft config | Structurally identical to published (same 125 widgets, pages, version stamp) — **no unpublished-changes risk** |
| `03…published-config.json` (317.9 KB) | Yes — authoritative | Full widget tree, filters, data views, action wiring, exports, help content | **Embeds ArcGIS tokens** in cached Survey123 thumbnail URLs (publicly downloadable; likely expired; flagged in §11). Contains lorem-ipsum test page |
| `04…resource-list.json` | Yes | 19 resources: config + 16 images | — |
| `resst-web-map-item/data.json` | Yes | Layer roster, symbology, labels, popups, basemap, initial extent | — |
| Layer/table definitions (3 files) | Yes | Fields, aliases, types, relationship, capabilities, renderers | — |
| `resst-sites.geojson` — 979 features | Yes | Full sites data | 15 null geometries; 2 swapped-coordinate sites; sparse `nid_id` (48/979) |
| `resst-literature.geojson` — 466 features | Yes | Literature-survey points | — |
| `resst-lit-repeat` pages — 1,410 rows | Yes | All literature entries | 3 rows blank `lit_document_type` among site-linked rows; keyword typo ("Water Injection Dreding") |
| 16 image assets | Yes | Logos, 6 bookmark snapshots, 5 help-workflow illustrations | — |
| Live behavioral session | 2026-08-28 | Filter semantics (captured `where=` clauses), counters, exports, Help/Edit panels, mobile layout | Screenshots not captured to disk (browser pane wasn't displayed); behaviors documented textually below |

**Verification:** every extract's feature count matches the service's `returnCountOnly` (979 / 466 / 1,410); every UI counter (979 / 1,192 / 214) and all three filter baselines (8 / 77 / 42 — see §4) were reproduced exactly from the extracts and via REST. The REST-derived data can be treated as authoritative-equivalent.

---

## 3. Dependency inventory

**Owner-controlled (public; anonymously queryable):**

| Dependency | Endpoint | Role |
|---|---|---|
| Sites layer (`survey`) | `services8…/survey123_85c1db578d5b4222869a785ba658791c/FeatureServer/0` | 979 dam/reservoir sites; Survey123-created; attachments *enabled but zero exist* |
| Literature points | `services8…/service_b488124ac6a64be091299d2a1a061a07/FeatureServer/0` | 466 literature-survey submissions; related (id 1) to → |
| `lit_repeat` table | same service `/1` | 1,410 individual literature entries |
| Web map `ResSedManWebMap` | item `5eab9932…` | Layer roster, symbology, labels, popups, extent |

**Owner-controlled (private — anonymous fetch denied):** three Survey123 **Form** items: `85c1db57…` (ResSedMan_SiteSurvey), `3a22d9b8…` (ResSedMan_LiteratureSurvey), `770376c0…` (ResSedMan_LitSurveyRev). These power the Edit Data panel.

**Third-party runtime services (all hidden by default; toggled via Bookmark Views / Map Layers):** National Inventory of Dams (`NID_v1`, item `a4c195b7…`); Live Stream Gauges (item `81c5a9f2…`); USDA **SSURGO WMS** (`SDMDataAccess.sc.egov.usda.gov`); USGS Watershed Boundary HUC 2/4/6/8 (Esri Living Atlas, 4 services); North America Lakes and Rivers (rivers sublayer used).

**Basemap:** Esri "Topographic" — vector-tile style item `27e89eb0…` + World Hillshade raster tiles. Esri basemaps outside an ArcGIS runtime require an ArcGIS Location Platform API key (or replacement — see §8).

**Not dependencies:** three 32-hex strings in the config are the owner's content-folder GUIDs (`415a0570…`, `957440bb…`, `c03bc329…`).

---

## 4. Existing-function migration matrix

Behavior verified live on 2026-08-28 unless marked *config*. "Replacement" assumes the recommended architecture (§8).

| Existing component | Current behavior (verified) | Data dependency | Required parity | Proposed replacement | Conf. | Open q |
|---|---|---|---|---|---|---|
| Welcome dialog | Purpose text + "Don't show again"; shows every visit otherwise | — | Yes | Modal with `localStorage` opt-out | High | — |
| Header toolbar | Help, Edit Data, Add Data, Legend, Map Layers, Basemap Gallery | — | Partial | Help, Edit Data, Legend, Layers; Basemap Gallery + Add Data are parity decisions | High | Q10 |
| Map | Esri Topographic basemap; Sites visible (red circles, yellow outline, size 8, **blue site-name labels, no clustering**); initial extent ≈ world/US | Web map + services | Yes | MapLibre GL: identical simple renderer + label layer; extent from config | High | Q4 |
| Reference layers | NID, gauges, SSURGO WMS, HUC 2/4/6/8, Rivers — all hidden by default, toggleable | Third-party services | Yes | Runtime layers loaded on toggle from same public services (ArcGIS FeatureServer GeoJSON/PBF queries; WMS image layer) | High | — |
| Bookmark Views | 6 states: Default, USGS HUC2/4/6/8, Rivers (extent + layer visibility + snapshot thumbnails) | Web map bookmarks | Yes | Typed "map views" config switching visibility+extent; reuse 6 snapshot images | High | — |
| Search (map) | Esri geocoder + layer search (MapCentric), yellow highlight, zoom-to | Esri World Geocoder | Yes | Client search over sites/literature attributes; geocoder optional (needs API key or Nominatim/USGS alternatives) | Med | Q4 |
| Select tool | Rectangle/point select on map → same cross-selection as clicking | Sites layer | Yes | Map box-select → same selection store | High | — |
| **Filters — Site Keywords** (6 items) | Per-item enable **switch** + multi-select of live distinct values. Captured semantics: value `CONTAINS` → `field LIKE '%v%'`; multi-value → `OR`; guard `field IS NOT NULL` ANDed; **items AND together**. Site Name uses exact `IN` semantics (`IS_ANY_OF`). Baselines: Dam Removal→**8**; +Drawdown→**77**; +Site Type Flood Control→**42** (REST-reproduced exactly) | Sites layer | Yes — exact counts | Pure client-side predicate engine on loaded JSON with the same tokenized semantics (comma-split keywords, substring match); typed filter config; option lists computed from data | High | — |
| **Filters — Site Literature Keywords** (17 items, `lit_*` fields) | Same semantics, applied to lit_repeat; counter uses the *view* (`site_name IS NOT NULL`) | lit_repeat | Yes | Same engine on literature-entries array (site-linked subset) | High | — |
| **Filters — General Literature Keywords** (17 items) | Same semantics on literature-points *view* (`site_names IS NULL`) | Lit points | Yes | Same engine on general-literature subset | High | — |
| Filter counters | "Filtered Data — Sites: 979 · Site Literature: 1,192 · General Literature: 214" via `COUNT({ObjectID})` expressions; **domains independent** (site filters don't affect literature counts) | Views above | Yes | Derived counts from the three filtered arrays | High | — |
| Clear controls | Per-dropdown "Clear selection"; per-item switch off; no global clear-all found | — | Improve | Per-filter clear + **add global Clear All** (approved improvement) | High | Q10 |
| Result tables (4 tabs) | Sites (979, search `site_name`) · Site Literature (**base** lit_repeat 1,410, search `lit_title`) · General Literature (view 214, search `title`) · All Literature (**points** 466, search `title`); sort, column show/hide, per-tab search; ArcGIS FeatureTable | All three sources | Yes, incl. tab-vs-counter subtlety | Accessible table (TanStack Table) with typed column config; **decide whether Site Literature tab should honor the 1,192 view** (current mismatch documented) | High | Q10 |
| Table Actions | All/filtered data → Zoom to, Pan to, **Export → CSV, Shapefile** | — | Yes (format Q) | Client CSV export; GeoJSON trivially; Shapefile needs a JS writer (or drop with approval) | High | Q9 |
| Selection sync | Select site (map click / table row / select tool / edit-table) → cross-select `lit_repeat` **by `site_name` match** and NID layer **by `nid_id`→`NIDID`**; right panel shows: site details, its literature entries, its NID record; "Selected Data" counters; search-selection zooms | site_name join; NID service | Yes — core interaction | Central selection store; site→literature index built at load (site_name verified unique, 0 nulls); NID detail fetched on demand by NIDID | High | — |
| Site/feature details | Feature-info panels (Sites, Site Literature, NID). NID popup shows ~80 fields incl. Arcade expressions | Selections | Yes (NID simplify?) | Detail components from typed field config; curate NID fields (approved improvement) | Med | Q10 |
| Popups (map) | Sites: title `{site_name}`, 9 fields; Literature: title raw `objectid`, 22 fields | Web map popupInfo | Yes | Popup component from same field config; fix literature popup title (improvement) | High | — |
| Edit Data panel | Note: "Editing… permitted for specific users"; **Add Site / Add Literature / Edit Site / Edit Literature** → embedded Survey123 forms (private items; sign-in enforced by Survey123); selection-bound dynamic text; secondary table (Sites, All Literature) | Survey123 forms | Yes — as continuity | Keep Survey123: link out (simplest) or embed `survey123.arcgis.com` form URLs; auth stays entirely in ArcGIS | High | Q1 |
| Add Data | Standard EXB user-added-layers widget | — | Decide | Probably drop (niche); confirm | Med | Q10 |
| Help | Overlay with 5 workflow views — About, By Reservoir, By HUC, By River, By Category — image + description + prev/next navigator | 5 illustration PNGs + config texts | Yes | Help overlay from typed content config; reuse images/text | High | — |
| Share | EXB share widget | — | Decide | URL copy + optional social links | Med | Q10 |
| Responsive | Three configured layouts (LARGE/MEDIUM/SMALL). Verified: 1600px = full 3-panel; 1280px = map-centric with collapsible panels; 375px = **map + search only** (no filters/table) | — | Decide scope | CSS-driven responsive design; decide whether phone keeps full function (improvement) or map-only parity | Med | Q10 |
| Accessibility | **Near-empty ARIA tree**: unlabeled controls, div-based UI, table in nested shadow DOM; effectively unusable by screen reader | — | Must improve | Semantic HTML, labeled controls, keyboard-complete; WCAG 2.1 AA / Section 508 target | High | Q3 |
| Page 2 "DummyTestingSteps" | **Publicly reachable** at `/page/DummyTestingSteps`; lorem-ipsum test content | — | No — retire | Do not migrate; recommend unlisting/removing in EXB too | High | Q6 |
| Empty/error states | Not exhaustively probed (0-result filters render empty table/map) | — | Yes | Explicit empty/loading/error states + tests | Med | — |

---

## 5. Data assessment

**Model (fully decoded):**

```
Sites (979 pts)                    Literature surveys (466 pts)
  site_name ── unique, no nulls      site_names: null ⇒ "General Literature" (214)
  nid_id ──→ NID NIDID (48 filled)   │ related (relationship id 1)
       ▲                             ▼
       └── string match ──── lit_repeat (1,410 rows)
                               site_name: not-null ⇒ "Site Literature" (1,192)
                               lit_* keyword fields (17 filterable)
```

- **Fields:** Sites 17 (9 displayed); Literature points 28; lit_repeat 30. Aliases and display names live in the layer definitions and web-map popupInfo (captured). Field names ≠ labels (e.g., `responsible_districtagency` → "Responsible Group") — the typed config must carry alias mapping.
- **Keyword encoding:** comma-delimited multi-value strings (`"Normal Operation,Drawdown"`). Current filtering is substring `LIKE '%v%'` — which also matches across value boundaries in principle; replacement should tokenize on commas for exactness and document any count differences (none expected, values are distinct).
- **Quality issues found (concrete):**
  1. **2 sites with swapped lat/lon** — "Millsite Reservoir" [39.10, −111.20] (Utah, coordinates reversed) and "Mrica Reservoir" [−7.39, 109.61] (Indonesia, reversed). Dataset is global, not CONUS-only.
  2. **15 sites with null geometry** — in tables but never on the map.
  3. `nid_id` present on only **48/979** sites (NID cross-link mostly inert).
  4. Keyword typo in live values: **"Water Injection Dreding"**.
  5. 3 site-linked literature rows with blank `lit_document_type` (behind the 1,192→1,189 counter drop).
  6. Sites layer `hasAttachments=true` but **zero attachments exist** → no file-geodatabase export needed today.
  7. Published config leaks (likely expired) ArcGIS tokens — see risk R8.
- **Sizes:** sites 644 KB + literature 588 KB + entries ~2.5 MB raw GeoJSON/JSON ≈ **3.7 MB, well under 1 MB gzipped** after trimming Survey123 housekeeping fields. Comfortably below any threshold where FlatGeobuf/PMTiles/GeoParquet or a database would pay for its complexity. Reassess only if data grows ~50× or polygon layers move in-repo (they stay remote).
- **Authoritative source & update workflow (recommended):** ArcGIS hosted layers remain authoritative (Survey123 keeps writing to them). A repo script (`scripts/fetch-data`) re-runs exactly the REST pulls used here, validates (counts, schema, unique IDs, coordinate ranges, URL/DOI shape, keyword vocabulary), emits trimmed web JSON + a data manifest (`retrieved`, counts, hashes), and fails loudly on anomalies like the two swapped coordinates. Run via GitHub Action on demand or on schedule → data updates are pull requests, reviewable and reversible.
- **Fix-at-source vs fix-in-pipeline:** recommend fixing the 7 issues above **in ArcGIS** (they're authoring errors); pipeline validation then guards regressions. Needs owner action (Q7).

---

## 6. Architecture comparison

Weighting rationale: fidelity, maintainability, AI-assistability, testability, and cost dominate because the tool is a public read-mostly explorer maintained intermittently; concurrency/perf are trivial at this scale. Scores 1–5 (5 best).

| Criterion (weight) | A. Static TypeScript SPA | B. R Shiny (Connect Cloud) | C. Static + custom backend |
|---|---|---|---|
| Fidelity to current behavior (3) | **5** — current app already filters client-side over fully-loaded layers | 4 — rebuildable, but map/table interactivity is heavier lifting in Shiny | 5 |
| Fit to data size/complexity (2) | **5** — 3.7 MB raw, no server needed | 3 — sessions for static data | 3 — backend has nothing to do |
| Future analytics (2) | 3 — client-side or *link out* to Shiny later | **5** — native R | 4 |
| Initial effort (2) | **4** — one codebase, no infra | 3 | 2 — two codebases |
| Long-term maintainability (3) | **5** — plain repo, typed config, no runtime to babysit | 3 — R env + server lifecycle | 2 |
| AI-assisted maintenance (3) | **5** — TS/React is the strongest AI ecosystem | 3 | 3 |
| Testability (2) | **5** — pure functions for filters/joins; Playwright E2E | 3 — shinytest2 | 4 |
| Accessibility ceiling (2) | **5** — full control of semantics | 3 — framework-bounded | 5 |
| Perf/startup (1) | **5** — static CDN | 2 — session spin-up/sleep | 4 |
| Mobile (1) | **5** | 3 | 5 |
| Data-update workflow (2) | **5** — scripted snapshot PRs | 4 | 4 |
| Auth capability (1) | 2 — none client-side (Survey123 carries the only auth need) | **4** | 4 |
| Security/secrets (1) | **5** — none (basemap key at most) | 4 | 3 |
| Hosting complexity/reliability/cost (2) | **5** — free static | 3 — tiers, sleep behavior, compute | 2 |
| Vendor dependence (1) | 4 — ArcGIS only at data layer (by choice) | 3 — Posit + ArcGIS | 3 |
| Portability (1) | **5** — any static host | 3 | 3 |
| USACE public-release fit (1) | 4 — simple public artifact (confirm process) | 4 | 3 |
| **Weighted total (÷ max)** | **0.94** | 0.66 | 0.68 |

**Within the static option:** Vite + **React 18 + TypeScript** (AI-legibility, ecosystem, accessible-component patterns; Preact/vanilla viable but savings are marginal here) · **MapLibre GL JS** (vector-tile basemap parity with current Esri Topographic look, WebGL labels matching current site-name labels, no license cost; Leaflet is the simpler runner-up if raster basemaps are chosen; the ArcGIS JS SDK would keep full Esri parity at the cost of the lock-in this migration exists to remove) · TanStack Table (headless, accessible) · no state library (a ~200-line typed store suffices) · Vitest + Playwright + axe.

**Decision: A (static TypeScript SPA).** Runner-up: B. **Reversal conditions:** if near-term requirements include server-side R computation, authenticated *viewing*, user uploads, or saved sessions (Q1/Q5), revisit — most likely as *hybrid-by-linking*: keep the static explorer and deploy R analyses as separate Connect Cloud apps linked from it, rather than rebuilding the explorer in Shiny.

---

## 7. Hosting comparison

Checked 2026-08-28 against current official docs (links in text). Owner's Connect Cloud tier is unknown → decision dependency, not guessed.

| Criterion | GitHub Pages | Posit Connect Cloud | Cloudflare Pages / Netlify (alt) |
|---|---|---|---|
| Hosts static SPA | **Yes** ([limits doc](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)) | **Not a documented content type** — supported: Shiny R/Py, Streamlit, Dash, Bokeh, Quarto ([how-to index](https://docs.posit.co/connect-cloud/how-to/)) | Yes |
| Server processes | No | Yes (that's its purpose) | Functions only |
| Limits | 1 GB site; 100 GB/mo soft; 10 builds/hr soft (waived w/ Actions) — site is ~5–10 MB, thousands of monthly visits fit easily | Tier-dependent (unverified here); framework apps sleep on lower tiers (inference — confirm on owner's plan) | Generous free tiers |
| Deploy automation | **GitHub Actions from the same repo** | GitHub-connected deploys | Git-connected |
| Custom domain/HTTPS | Yes | Tier-dependent | Yes |
| Secrets | Actions secrets (basemap key if used) | Supported | Supported |
| Rollback/history | Git + Actions re-runs | Version history | Deploy history |
| Cost at expected usage | **$0** | $0+ (tier) | $0 |
| Lock-in | Minimal (any static host takes the build) | Moderate | Minimal |
| Gov/org considerations | Public repo + public site — confirm USACE release process (Q3) | Already in owner's workflow | Extra vendor to approve |

**Decision: GitHub Pages** (repo and host in one governance surface, zero cost, zero server operations). **Fallback:** Cloudflare Pages/Netlify if org policy blocks Pages. **Posit Connect Cloud:** reserved for future R analyses as separate linked apps — its documented content types don't include arbitrary static SPAs, so it is not the right host for this build irrespective of tier.

---

## 8. Recommended architecture and host

**Static TypeScript SPA (Vite + React + MapLibre GL JS) on GitHub Pages, with ArcGIS Online + Survey123 retained as the authoring backend and a scripted snapshot pipeline in between.**

- **Basemap:** closest parity = Esri Topographic vector style via ArcGIS Location Platform API key (free tier; attribution required). Keyless government-friendly alternative: USGS National Map topo. Recommend Esri style for parity with USGS raster fallback; owner picks (Q4).
- **Reference layers:** loaded at runtime from the same public services (NID/gauges/HUC/rivers as on-demand GeoJSON queries or tiles; SSURGO as WMS image layer) — they are not snapshotted.
- **Runner-up:** Shiny on Connect Cloud (see §6). **Reversal conditions:** listed in §6; also if ArcGIS Online is ever decommissioned as authoring backend, the pipeline input swaps to GeoPackage-in-repo without touching the app.

## 9. Proposed repository and application design

```
resst/
├── src/
│   ├── components/        # panels, tables, detail views, help overlay, welcome dialog
│   ├── map/               # MapLibre setup, layers, labels, popups, select tool, map views (bookmarks)
│   ├── filters/           # predicate engine + filter UI (pure, unit-tested)
│   ├── state/             # typed store: filters, selection, active tab/view
│   ├── config/            # TYPED CONFIG: fields+aliases, filter defs, popup/detail fields,
│   │                      #   table columns, map views, reference layers, export fields, help content
│   └── utils/             # csv/geojson export, shapefile writer (if kept), formatting
├── public/data/           # generated web data + data manifest (versioned)
├── scripts/               # fetch-data + validate + trim (the REST pulls from this assessment)
├── tests/                 # unit (filters/joins/exports), e2e (Playwright), a11y (axe), baselines
├── docs/                  # maintainer guide, data-update runbook, deploy runbook, THIS assessment
├── RESST-migration/       # evidence archive (already collected)
└── .github/workflows/     # ci.yml, deploy.yml, refresh-data.yml
```

Key behaviors carried in **config, not components**: the 40 filter definitions (field, label, match mode), alias/display maps, popup and detail field lists, table columns per tab, the six map views, export field sets, help view content. That is what keeps future edits (add a keyword field, rename a label) one-file changes.

**Core logic:** load 3 JSON files → build indexes (site_name → literature entries; nid_id list) → three independent filter domains (OR within item, AND across items, comma-tokenized matching) → selection store propagates site → literature/NID exactly as today. Everything above is pure-function testable against the captured baselines (8/77/42, 1,192/214/979).

## 10. Phased migration plan

| # | Milestone | Contents | Effort (dev-days, AI-assisted) | Gate |
|---|---|---|---|---|
| 0 | **This assessment** | Evidence, spec, decisions | done | **Owner approves direction + answers Q1–Q10** |
| 1 | Data pipeline | fetch/validate/trim scripts, data manifest, source data fixes (owner, in ArcGIS) | 2–4 | Counts & validations green |
| 2 | Scaffold + map + tables | Vite/React/MapLibre shell, basemap decision implemented, sites+literature layers, labels, 4 tabs | 4–7 | Visual parity check |
| 3 | Filters + counters | Predicate engine + 40 filter items + counters; baseline tests pass | 3–5 | 8/77/42 + counter parity |
| 4 | Selection sync + details + export | site→lit/NID propagation, detail panels, popups, CSV (+Shapefile or approved change), search | 3–5 | Side-by-side workflows |
| 5 | Views, help, entry links | Bookmark views, help overlay (5 views), Edit Data → Survey123 links/embeds, welcome dialog | 2–4 | Owner content review |
| 6 | Accessibility + responsive | Keyboard-complete, ARIA, contrast, reduced motion; desktop/tablet/phone layouts | 3–5 | axe + manual checks |
| 7 | Test hardening + validation | Full Phase-G test list; side-by-side acceptance vs live app; document approved differences | 3–5 | Owner sign-off |
| 8 | Deploy + handoff | Pages deploy, refresh-data workflow, runbooks, maintainer docs | 2–3 | **Public-release approval (USACE process, Q3)** |
| 9 | Parallel run + cutover | Both apps live; redirect/retire EXB app only after acceptance; archive evidence + EXB config | 0.5 + calendar time | Owner decision |

Total build effort ≈ **19–33 dev-days**. Old app is preserved untouched until step 9; rollback = keep using it.

## 11. Risk register

| # | Risk | L×I | Mitigation | Owner action |
|---|---|---|---|---|
| R1 | `site_name` string join breaks if names are edited inconsistently (it's the de-facto key) | M×H | Pipeline validation (uniqueness, referential check vs lit_repeat); long-term: introduce stable site IDs in Survey123 | Approve validation rules |
| R2 | Ongoing Survey123 edits make snapshot stale | H×M | Scheduled refresh workflow + "data as of" stamp; or live-query mode (Q2) | Decide cadence |
| R3 | Coordinate/data errors ship into the new app (2 swapped, 15 null geometries, typo) | H×M | Fix at source; pipeline fails on out-of-range coords | Fix in ArcGIS (Q7) |
| R4 | Esri basemap/geocoder licensing terms or key governance | M×M | Free-tier key with attribution, or keyless USGS basemap; client search instead of geocoder | Pick option (Q4) |
| R5 | Third-party services drift (NID schema, SSURGO WMS, Living Atlas retirements) | M×M | Thin adapters + graceful degradation + link-out fallback; NID is load-bearing only for 48 sites | — |
| R6 | USACE public-release/508/branding constraints unknown | M×H | Treat as gate before step 8; a11y built to WCAG 2.1 AA regardless | Identify process (Q3) |
| R7 | Scope creep: parity vs improvements blur | M×M | §4 matrix marks improvements; each needs explicit approval (Q10) | Approve list |
| R8 | **Published config leaks ArcGIS tokens** (Survey123 thumbnail URLs in public `config.json`) | M×M | Tokens appear short-lived/expired (inference); still: review, and note any future EXB publish re-embeds them | Verify in ArcGIS org; consider Esri support ticket |
| R9 | Public test page (`DummyTestingSteps`) confuses users today | H×L | Exclude from migration; optionally remove in EXB now (an app edit — owner's call, outside this effort's read-only rule) | Decide (Q6) |
| R10 | Post-handoff maintainership unclear | M×H | Runbooks + typed config + CI; name a maintainer | Q8 |

## 12. Missing-artifact checklist

Nearly everything was obtainable automatically. Still missing, in priority order:

1. **Owner requirements** (`06-requirements/owner-notes.md`) — answered via Q1–Q10 below; I will draft the file from your answers.
2. **Survey123 form definitions** (private items) — only if forms must ever be rebuilt outside ArcGIS. *How:* Survey123 Connect → open each form → the XLSForm (`.xlsx`) → save to `06-requirements/forms/`. Not needed for the recommended keep-Survey123 path.
3. **Archival GeoPackage exports** (optional; REST data already verified equivalent; no attachments exist). *How:* each layer's item page → Export → GeoPackage → download to `03-data/`.
4. **Workflow screen recording / screenshots** (optional; behaviors documented in §4). *How:* run through §4's verified workflows once with any screen recorder → `05-screenshots/`.
5. **Org policy facts:** Connect Cloud account tier; GitHub org to host the repo; applicable USACE release/508 process documents.

## 13. Consolidated questions (only those that change the plan)

1. **Data entry:** Is Survey123 collection ongoing, and who are the "specific users" with edit rights? Keep ArcGIS+Survey123 as the authoring backend with the new app linking/embedding the forms (recommended), or is a different entry mechanism wanted later?
2. **Runtime data:** snapshot-in-repo with scheduled/on-demand refresh and a "data as of" stamp (recommended — reviewable, reversible, host-independent), or live queries against the ArcGIS services (always current, keeps runtime ArcGIS dependency)? If snapshot: what refresh cadence?
3. **Governance:** May the repo and site be public on github.com? Is there a USACE public-release / Section 508 review process this must pass, and a required domain (e.g., *.erdc or *.army.mil) or branding standard?
4. **Basemap & search:** Esri Topographic via free API key (closest parity, needs key governance + attribution) or keyless USGS National Map (public-domain, slightly different look)? Is the address-geocoder search actually used, or is site/literature attribute search sufficient?
5. **Future analytics:** Any near-term R/Python computation, report generation, uploads, or authenticated viewing planned? (These trigger the §6 reversal conditions / a linked Connect Cloud companion.)
6. **Cleanup confirmations:** retire `DummyTestingSteps` page (it is publicly reachable); acknowledge the token-in-config finding (R8).
7. **Data fixes:** OK to fix in ArcGIS the 2 swapped coordinates, 15 null geometries, "Water Injection Dreding" typo, and 3 blank document types? (I can supply the exact records.)
8. **Ownership:** Which GitHub org/repo? Who maintains data and code after handoff?
9. **Exports:** Current app offers CSV + Shapefile. Keep both (Shapefile needs an extra client library), or switch to CSV + GeoJSON (simpler, more modern — a documented deliberate difference)?
10. **Approved improvements:** confirm or strike each — global Clear-All filters; Site Literature tab honoring the 1,192 view; curated NID detail fields; literature popup title; full-function mobile layout; dropping Add Data/Share/Basemap Gallery widgets.

---

*Stopping here per the brief: no scaffolding or implementation until you approve the direction and answer the questions above. The evidence package under `RESST-migration/` plus this document are the complete Phase A–H assessment.*
