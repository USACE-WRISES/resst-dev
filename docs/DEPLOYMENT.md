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
| `basemap.nationalmap.gov` (USGS) | default basemap tiles | map background blank; app otherwise functional |
| `cdn.arcgis.com` | optional Esri basemap: style + sprite | the basemap toggle shows a retryable error; USGS default unaffected |
| `basemaps.arcgis.com` | optional Esri basemap: vector tiles + fonts | same |
| `services.arcgisonline.com` | optional Esri basemap: hillshade tiles | hillshade missing under the Esri style; USGS default unaffected |
| NID / Stream Gauges / HUC / Rivers (Esri-hosted public services) | optional overlays | that overlay stays empty (console warning); toggles remain |
| `SDMDataAccess.sc.egov.usda.gov` | SSURGO WMS overlay | same |

No API keys, tokens, or secrets exist anywhere in the system. Glyph fonts are
self-hosted under `public/fonts/`.

## Local development

`.claude/launch.json` starts `npm run dev` on port 5173. Playwright tests
build and serve the production bundle themselves (`npx playwright test`).
Building GIS exports locally needs `gdal-bin`: `bash scripts/build-exports.sh`.

## Custom domain (if ever wanted)

Add the domain in the repo's Pages settings and a `CNAME` entry per GitHub's
docs; HTTPS is provisioned automatically. Update `base` in `vite.config.ts`
to `/` if the site moves to a domain root.
