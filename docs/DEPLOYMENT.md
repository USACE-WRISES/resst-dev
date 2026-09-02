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
  (`vite.config.ts` — change it if the repo is ever renamed). The Posit
  Connect Cloud mirror described below is built with base `/` by
  `npm run build:connect` without touching that config.
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

## Second host: Posit Connect Cloud (test mirror, deployed by hand)

A copy of the site can be published to Posit Connect Cloud from VS Code with
the Posit Publisher extension. It exists to answer one question for USACE
users — whether that origin behaves differently from GitHub Pages on their
workstations — and GitHub Pages remains the canonical site. Nothing here
changes what Pages serves.

Mirror URL: https://gtmenichino-resst-dev.share.connect.posit.cloud

**Build.** `npm run build:connect` runs the same steps as `deploy.yml`
(`validate`, `build:data`, typecheck) and then `scripts/build-connect.mjs`,
which builds the app into `connect-cloud/` with `base: "/"`. Connect Cloud
serves each content item at the root of its own hostname, so the Pages base
path `/resst-dev/` must not be baked in. That is the only difference between
the two builds: every runtime URL derives from `import.meta.env.BASE_URL`, so
no source changes are involved, and the script refuses to finish if the Pages
base survives in `index.html` or the bundles. `connect-cloud/` is gitignored
and regenerated every time; `connect-cloud/.posit/` (Posit Publisher's
configuration `publish/resst-dev-RVN2.toml`, a name its wizard chose, and its
deployment record under `publish/deployments/`) is the only hand-maintained
part and is preserved across rebuilds. Never edit the built files. As with
any `build:data` run, `public/data/manifest.json` picks up a new `generated`
timestamp; discard it unless the CSVs actually changed.

One more difference is forced by Publisher: its bundler drops every file named
`manifest.json` (the name of Posit's own bundle manifest), which left the first
mirror answering 404 for `data/manifest.json`. The mirror build therefore
renames that file to `data/data-manifest.json` and rewrites the single fetch
in `src/lib/data.ts` through a build-only Vite transform; the source and the
Pages build are unchanged. `sediment/manifest.json` is a build artifact the
app never requests, so its absence from the mirror is harmless.

**First deploy (once).** Open the repo in VS Code with Posit Publisher
installed. Add a Posit Connect Cloud credential (Credentials → +, browser
sign-in). Create a new deployment with entrypoint `connect-cloud/index.html`.
The wizard writes a configuration listing only the files `index.html`
references, which is not enough: the first attempt deployed eight files and
the app failed with `data/sites.json: HTTP 404`. The committed configuration
names every folder the app serves; if the wizard generates a fresh one, copy
that `files` list into it. Before deploying, check that Project Files shows
`index.html`, `assets/`, `data/`, `sediment/`, `overlays/`, `fonts/`, `help/`
and the three icons as included. `validate = true` makes Publisher fetch the
live URL at the end, and the deployment record's `files` list afterwards
should run to well over a hundred entries. Commit `connect-cloud/.posit/**`
so any checkout redeploys to the same content item.

**Redeploy** whenever `main` changes and the mirror should follow: `git pull`,
`npm run build:connect`, then Deploy the existing RESST mirror deployment in
Publisher. Publisher uploads the whole bundle (about 150 MB with the overlay
snapshots) each time.

**Reading `?diag=1` on the mirror.** The `Renderer` line is the result: a
hardware renderer on a machine where the Pages copy reports SwiftShader means
the mirror's origin is exempt from remote browser isolation and the map runs
at full speed there. The Network row judges h2 and compression on the mirror's
own host; compare it with the same row on the Pages copy before reading a
proxy into it.

**The DOM map trial on the mirror.** This is the test that decides whether a
DOM-rendered "Compatibility" map mode is worth building for machines under
remote browser isolation. On the affected workstation, in Chrome and again in
Edge: open the mirror's `?diag=1`, wait for "Finished.", press **Start DOM map
trial**, drag and wheel-zoom for about 20 seconds (zoom into Kansas until the
site labels appear), answer **Smooth** or **Choppy**, switch to **Canvas
markers**, repeat, then **Copy report**. Reading: `DOM map trial: GO` with SVG
markers smooth means a DOM map works there; both renderers choppy means stop,
the only fix is the CBII bypass or `.mil` hosting described in the IT report;
SVG choppy but canvas smooth means a DOM mode is possible with the site
markers on canvas; SVG smooth but canvas choppy means keep heavy layers off
canvas in such a mode.

**Stopping the mirror.** Delete the content item in Connect Cloud and remove
`connect-cloud/.posit/publish/deployments/`. The reference configuration can
stay.

If the first deploy shows a problem: a blank page with a module-script MIME
refusal in the console means the host is not serving `assets/*.js` as
JavaScript; missing map labels mean `fonts/Noto%20Sans%20Regular/…` is not
being served (a percent-encoded space in a path segment); and if the 123 MB of
overlay snapshots is the obstacle, the app could fetch them cross-origin from
Pages (which sends `Access-Control-Allow-Origin: *`) through a build-time
overlay base — not implemented.

## Map engine (transition to Leaflet)

The interactive map is moving from MapLibre GL (WebGL) to Leaflet (DOM
elements and image tiles) because DoD remote browser isolation streams every
WebGL canvas from a cloud browser at ~4.6 fps while DOM content is mirrored
and animates locally (the `?diag=1` DOM map trial proved it on a USACE
laptop). The move is phased so the site never regresses:

- **Phase 1 (current):** both engines ship. Each page load picks one, in this
  order: the URL (`?map=leaflet` or `?map=maplibre`, never persisted), then
  `localStorage` key `resst.mapEngine` (`leaflet` or `maplibre`; set it by
  hand, there is no UI), then the WebGL probe — when the page's WebGL renderer
  is software (SwiftShader, which is what isolation and most VMs report) the
  Leaflet map loads, otherwise MapLibre. The probe result is memoized per
  session in `sessionStorage` (`resst.renderClass`). The footer says
  `Map: Leaflet (preview)` when Leaflet is active. Leaflet is a separate chunk
  (`DomMapPanel-*.js`) that only loads when chosen; the main bundle is
  unchanged. Not yet on Leaflet: the national inventory layer and Screening
  (the Layers popover says so; the toggles are disabled).
- **Phase 2:** the national layer (canvas, redrawn at settle) and Screening.
- **Phase 3:** Leaflet becomes the only map; MapLibre stays only behind a
  lazy import for the Dam Report's static map figure.

Code: `src/map/engine.ts` (the choice), `src/map/MapHost.tsx` (mounts one
panel), `src/map/dom/` (the Leaflet panel and its layers), and the engine-free
seams both panels implement: `src/map/toolMap.ts` (Select tools) and
`src/map/overlaySink.ts` (reference overlays). The e2e suite pins MapLibre
through `playwright.config.ts`'s `storageState` (headless Chromium is
SwiftShader); `tests/e2e/dom-map.spec.ts` seeds Leaflet for itself. To check
the Leaflet map on the mirror or on Pages, open the site with `?map=leaflet`;
on an isolated USACE workstation it loads by itself.

## Local development

`.claude/launch.json` starts `npm run dev` on port 5173. Playwright tests
build and serve the production bundle themselves (`npx playwright test`).
Building GIS exports locally needs `gdal-bin`: `bash scripts/build-exports.sh`.

## Custom domain (if ever wanted)

Add the domain in the repo's Pages settings and a `CNAME` entry per GitHub's
docs; HTTPS is provisioned automatically. Update `base` in `vite.config.ts`
to `/` if the site moves to a domain root — or reuse `npm run build:connect`,
which already produces a domain-root bundle in `connect-cloud/` without
changing the config.
