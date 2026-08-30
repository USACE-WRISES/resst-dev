# Editing the RESST data

The repository is the database. The four CSVs in `data/` are the source of
truth; everything else (the app's JSON, the GIS downloads) is generated from
them automatically. Editing happens offline in whatever tool you prefer —
Excel/LibreOffice, a text editor, or a GIS package that reads CSV — and lands
through a pull request.

## The workflow

1. Branch, then edit the CSVs (UTF-8, keep the header row intact).
2. `npm run validate` — fix anything it reports as ERROR (warnings inform).
3. Commit, push, open a PR. CI re-runs validation and the full test suite,
   and posts a **data-diff comment** summarizing added/removed/modified
   records per table.
4. Merge. The app redeploys and the `data-latest` release (Shapefile,
   GeoPackage, FileGDB, CSV bundles) regenerates automatically.

## The tables and their rules

### `data/sites.csv` — one row per site (dam/reservoir/reach)
- `site_id` — stable, unique, kebab-case; **never change it once merged**
  (it's the join key from literature entries and the app's selection).
  New site: derive from the name, e.g. `hoover-dam`.
- `site_name` — display name. Duplicates are legal but warned (two distinct
  sites are both named "Rio Grande"); prefer clarifying the names.
- `longitude`/`latitude` — decimal degrees WGS84, both set or both blank
  (blank = the site appears in tables but not on the map). Validation errors
  on out-of-range values, which is how the two historic lat/lon swaps would
  have been caught.
- `nid_id` — optional National Inventory of Dams ID. If you add one, also add
  the matching record to `nid_snapshot.csv` (or the details panel will say
  "no NID record found"; validation warns).
- Keyword fields (`site_type`, `sediment_release`, `ecological_concern`,
  `analysis`, …) — comma-delimited values. Matching is case-insensitive.

### `data/literature.csv` — one row per literature survey submission
- `lit_id` — stable `L####`; take the next unused number.
- `site_names` — comma-delimited display list of associated sites; **blank
  means the row counts as General Literature** in the app.

### `data/literature_entries.csv` — one row per individual reference
- `entry_id` — stable `E#####`; next unused number.
- `lit_id` — must exist in `literature.csv` (validation errors otherwise).
- `site_id` — set it to link the entry to a site (that's what the app's
  selection uses); `site_name` is display text. If the text matches a real
  site but `site_id` is blank, validation errors and tells you to link it.
  92 legacy rows carry unmatched historical text with no `site_id` — see
  `data/MIGRATION-LOG.md`.

### `data/nid_snapshot.csv` — curated NID records for linked sites
Keyed by `nidid`. Refresh a record from the public NID service if it drifts;
add one whenever a site gains an `nid_id`.

## Adding a filter option

Filter dropdowns are **curated lists**, not raw data dumps (ported from the
original app). If you introduce a new keyword value, validation warns that it
is "outside the current filter options". To expose it in the UI, add the
value to the matching item in `src/config/filters.generated.ts` — or, if the
list has drifted far, edit the generator output and commit (the file is
generated but owned by the repo; regeneration only reproduces the original
app's lists).

## Known data debt (owner-approved to leave as-is for parity)

`data/MIGRATION-LOG.md` documents: the "…maNot Applicablegement" and
"Depostion" value corruptions (fix in a dedicated PR when approved), keyword
case variants, 15 coordinate-less sites, and 92 unlinked legacy entry site
names. (The placeholder `nid_id` "11111" belonged to a test-record cluster
removed with owner approval on 2026-08-30.)
