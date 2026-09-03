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
| `services.arcgisonline.com` | default basemap: Esri World Topographic Map tiles (also the report figure's and the diagnostics benchmark's hillshade) | map background blank on the default; switch to USGS Topo in the picker |
| `basemap.nationalmap.gov` (USGS) | the USGS Topo basemap tiles; the report figure's basemap | map background blank while on USGS; app otherwise functional |
| `cdn.arcgis.com`, `basemaps.arcgis.com` | the `?diag=1` benchmark's Esri vector style, sprite, tiles and fonts (the app itself no longer loads them) | one benchmark leg reports "style unavailable" |
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
the report figure and the benchmark are self-hosted under `public/fonts/`.
The e2e suite stays hermetic by route-stubbing every Esri and USGS tile
endpoint (`tests/e2e/helpers/esriStub.ts`).

## Diagnosing a slow map on someone's machine

Append `?diag=1` to the deployed URL — <https://usace-wrises.github.io/resst-dev/?diag=1> —
and the performance diagnostics mount **instead of** the app. Reach for it when
a user reports that panning, zooming, or the fly-to-a-dam animation is sluggish
on their computer but not on others.

It exists because the usual tools are not always available: a managed
workstation may have DevTools disabled by policy, so the address bar has to be
enough. Mounting it in place of `App` also keeps its measurements clear of the
app's own map layers. Let it run to "Finished." (30–60 s), then use **Copy
report** to get a Markdown summary that can be pasted into an email or ticket.

What it measures, and how to read it:

| Section | What to look for |
| --- | --- |
| GPU | The `Renderer` string. `ANGLE (Intel…)` or `ANGLE (NVIDIA…)` is healthy; **`SwiftShader`** means WebGL is running on the CPU, which caps the map near 5 fps no matter what the app does. |
| WebGL context matrix | Eight context configurations (`webgl2`/`webgl` × three power preferences, ± `failIfMajorPerformanceCaveat`). If any row reports `hardware`, MapLibre can be pinned to it via `canvasContextAttributes`. If all eight are `software`, no app-side setting can recover the GPU. |
| Render benchmark | Four fixed camera circuits. Healthy machines land in the low tens of milliseconds per frame; a software rasterizer sits near 215 ms. Frame cost that does **not** change between the 2-layer raster basemap and the 396-layer vector one means the bottleneck is not the app's workload. |
| Network | Same-origin rows expose `nextHopProtocol` and encoded-vs-decoded size, so an `http/1.1` downgrade or stripped compression identifies a TLS-inspecting proxy. Cross-origin tile rows are opaque by design — only their durations are meaningful. |
| DOM map trial | Opt-in, after "Finished.". A Leaflet map (image tiles, the 963 site markers as SVG circles, labels from zoom 7) with an SVG/Canvas marker toggle. Drag and zoom for about 20 s per renderer and answer Smooth or Choppy. The fps and settle figures are supporting evidence; the answer is the verdict (`DOM map trial: GO` or `NO-GO`), because under remote browser isolation the page's frame loop runs in the cloud browser, not on the screen in front of the user. |

Note that `chrome://gpu` reporting "WebGL: Hardware accelerated" does **not**
settle the question: that line describes the compositor, and an individual page
context can still fall back to SwiftShader. The matrix is what distinguishes the
two. This was the finding on a USACE workstation in August 2026, where all eight
configurations returned SwiftShader while the browser's own GPU process held a
working Direct3D 11 context — a browser/driver problem with no application fix.

The page sends nothing anywhere. It reads local browser and WebGL state,
contacts only hosts the app already uses (the reachability probe), and builds
the report client-side for the user to copy. There is no telemetry.

`src/diag/` holds it: `probes.ts` is DOM-free so vitest's node environment can
cover the arithmetic and heuristics, `collect.ts` holds the browser-side
collectors, and `DiagnosticsPage.tsx` is the UI. It is **lazily imported** in
`src/main.tsx`, so it compiles to its own chunk and a normal page load never
fetches it — keep it that way when editing. `tests/e2e/diag.spec.ts` guards it,
including an assertion that the flag does not leak into the default app path.

## The map (Leaflet)

The interactive map is Leaflet: DOM elements and image tiles, no WebGL. It
replaced MapLibre GL in September 2026 because DoD remote browser isolation
streams every WebGL canvas from a cloud browser at ~4.6 fps while DOM content
is mirrored and animates locally (the `?diag=1` DOM map trial proved it on a
USACE laptop; `notes/2026-09-02-usace-map-lag-isolation-and-plan.md` has the
evidence and the decision). What that means in practice:

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

MapLibre GL remains a dependency for two things that need WebGL and load on
demand as their own chunks: the Dam Report's static map figure
(`src/report/ReportMap.tsx`) and the `?diag=1` benchmark. Under isolation the
report figure still renders (a one-time picture; 10 s fallback).

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
