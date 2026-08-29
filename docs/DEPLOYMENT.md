# Deployment and operations

Everything is automated through GitHub Actions; there is no server to run.

## The pipelines

| Workflow | Trigger | What it does |
|---|---|---|
| `ci.yml` | every PR and push to `main` | `npm run validate` → unit tests → typecheck + build → Playwright e2e/a11y |
| `deploy.yml` | push to `main` | rebuilds `public/data` from the CSVs, builds the app, deploys to GitHub Pages |
| `data-exports.yml` | push touching `data/**` (or manual dispatch) | GDAL (`ogr2ogr`) builds Shapefiles, GeoPackage, File Geodatabase, CSV bundle → uploads to the rolling **`data-latest`** release |
| `data-diff.yml` | PRs touching `data/**` | posts/updates one comment summarizing the data change |

- **Site:** https://usace-wrises.github.io/resst-dev/ (Pages, build type
  "GitHub Actions", HTTPS enforced). Base path is `/resst-dev/`
  (`vite.config.ts` — change it if the repo is ever renamed).
- **Rollback:** revert the offending commit on `main`; the deploy workflow
  redeploys the previous state. Data rollbacks are ordinary git reverts too.
- **Exports:** re-run `data-exports.yml` from the Actions tab any time;
  requires nothing but the repo (GDAL ≥ 3.6 is installed in the runner —
  needed for FileGDB writing).

## External services the app talks to at runtime

| Service | Used for | If it breaks |
|---|---|---|
| `basemap.nationalmap.gov` (USGS) | fallback basemap tiles (also the boot style and the auto-revert target) | map background blank while on the fallback; app otherwise functional |
| `cdn.arcgis.com` | default Esri basemap: style + sprite | automatic revert to USGS with a retryable error in the picker |
| `basemaps.arcgis.com` | default Esri basemap: vector tiles + fonts | same |
| `services.arcgisonline.com` | default Esri basemap: hillshade tiles | hillshade missing under the Esri style; USGS fallback unaffected |
| NID / Stream Gauges (Esri-hosted public services) | optional live point overlays | that overlay stays empty (console warning); toggles remain |
| `SDMDataAccess.sc.egov.usda.gov` | SSURGO WMS overlay | same |
| `carto.nationalmap.gov` (USGS GNIS) | place search (streams, lakes, cities) in the map search box | site-name search keeps working; the Places group shows "Place search unavailable" |

The HUC-boundary and rivers overlays are **self-hosted snapshots** served with
the app itself (`public/overlays/` — same-origin, so a failure surfaces as an
error chip with Retry, and the HUC/river Select tools run fully client-side).
Their upstream sources — `hydro.nationalmap.gov` (USGS WBD, public domain) and
the CEC rivers service on `services7.arcgis.com` (CC BY 4.0) — are contacted
only at build time by `npm run build:overlays`, never by the deployed app.

No API keys, tokens, or secrets exist anywhere in the system. Glyph fonts are
self-hosted under `public/fonts/`. Cold loads fetch the Esri style at boot;
the e2e suite stays hermetic by route-stubbing every Esri endpoint
(`tests/e2e/helpers/esriStub.ts`).

## Local development

`.claude/launch.json` starts `npm run dev` on port 5173. Playwright tests
build and serve the production bundle themselves (`npx playwright test`).
Building GIS exports locally needs `gdal-bin`: `bash scripts/build-exports.sh`.

## Custom domain (if ever wanted)

Add the domain in the repo's Pages settings and a `CNAME` entry per GitHub's
docs; HTTPS is provisioned automatically. Update `base` in `vite.config.ts`
to `/` if the site moves to a domain root.
