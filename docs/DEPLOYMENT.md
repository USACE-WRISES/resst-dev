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
| `services.arcgisonline.com` | default basemap: Esri World Topographic Map tiles | map background blank on the default; switch to USGS Topo in the picker |
| `basemap.nationalmap.gov` (USGS) | the USGS Topo basemap tiles; the report figure's basemap | map background blank while on USGS; app otherwise functional |
| NID / Stream Gauges (Esri-hosted public services) | optional live point overlays | that overlay stays empty (console warning); toggles remain |
| `SDMDataAccess.sc.egov.usda.gov` | SSURGO WMS overlay | same |
| `carto.nationalmap.gov` (USGS GNIS) | place search (streams, lakes, cities) in the map search box | site-name search keeps working; the Places group shows "Place search unavailable" |

The HUC-boundary and rivers overlays are **self-hosted snapshots** served with
the app itself (`public/overlays/` — same-origin, so a failure surfaces as an
error chip with Retry, and the HUC/river Select tools run fully client-side).
Their upstream sources — `hydro.nationalmap.gov` (USGS WBD, public domain) and
the CEC rivers service on `services7.arcgis.com` (CC BY 4.0) — are contacted
only at build time by `npm run build:overlays`, never by the deployed app.

No API keys, tokens, or secrets exist anywhere in the system. Glyph fonts for
the report figure are self-hosted under `public/fonts/`.
The e2e suite stays hermetic by route-stubbing every Esri and USGS tile
endpoint (`tests/e2e/helpers/esriStub.ts`).

## The map (Leaflet)

The interactive map is Leaflet: DOM elements and image tiles, no WebGL. It
replaced MapLibre GL in September 2026 because DoD remote browser isolation
streams every WebGL canvas from a cloud browser at ~4.6 fps while DOM content
is mirrored and animates locally (a DOM map trial on a USACE laptop proved it
on 2026-09-02; `notes/2026-09-02-usace-map-lag-isolation-and-plan.md` has the
evidence and the decision; the `?diag=1` diagnostics page that ran the trial was
retired on 2026-09-03, and commit 92ea18b is the last revision that contains it).
What that means in practice:

- Both basemaps are image tiles: Esri's World Topographic Map from
  `services.arcgisonline.com` (the default) and USGS The National Map. A swap
  replaces the tile layer and cannot fail as a whole.
- The site markers are SVG circles; labels are permanent tooltips placed by a
  greedy first-come pass (at most 150 in view, from zoom 6); popups, the
  selection rings, the network highlight, the drainage area and the Select
  sketch are SVG too. Reference overlays and the upstream-dam fan draw on
  canvas renderers that Leaflet transforms during a gesture and redraws once
  at settle.
- The national inventory layer is one canvas drawn from typed arrays (one
  path per colour bucket, culled to the view, redrawn at settle, transformed
  during a zoom animation); Screening hides the non-matching dots. The canvas
  is pointer-transparent: the panel hit-tests the last-drawn dots on a map
  click that no site marker handled, so a documented dam still routes to its
  site.
- Zoom numbers in the code and the tests use the app's original 512 px
  basis (Leaflet's own zoom sits one step higher); `src/map/leaflet/zoom.ts`
  converts at the edge.

MapLibre GL remains a dependency for one thing that needs WebGL and loads on
demand as its own chunk: the Dam Report's static map figure
(`src/report/ReportMap.tsx`). Under isolation the report figure still renders
(a one-time picture; 10 s fallback).

Code: `src/map/MapPanel.tsx` (the panel, its commands and effects),
`src/map/leaflet/` (basemaps, sites, labels, popups, place marker, network,
overlays, the national canvas, the Select-tool adapter), and the seams the
tools and the overlay runtime use: `src/map/toolMap.ts` and
`src/map/overlaySink.ts`. The e2e suite reads the map through
`window.__resstMap` (the Leaflet map) and `window.__resstMapInfo` (counts,
flags and camera helpers in the app's conventions); `tests/e2e/map.spec.ts`
covers the map itself.

## Local development

`.claude/launch.json` starts `npm run dev` on port 5173. Playwright tests
build and serve the production bundle themselves (`npx playwright test`).
Building GIS exports locally needs `gdal-bin`: `bash scripts/build-exports.sh`.

## Custom domain (if ever wanted)

Add the domain in the repo's Pages settings and a `CNAME` entry per GitHub's
docs; HTTPS is provisioned automatically. Update `base` in `vite.config.ts`
to `/` if the site moves to a domain root.
