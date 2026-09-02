# USACE map lag: investigation summary, current state, and the approved-for-later plan

Written 2026-09-02 so the work can be resumed in a fresh session. Everything below is self-contained:
what was found, what was built, what is uncommitted, the exact next steps, and the full Stage A / Stage B
plan. The companion plan file lives outside the repo at
`C:\Users\gtmen\.claude\plans\the-web-app-is-robust-candle.md` (same content as the plan section here).

## 1. The finding in one paragraph

The RESST map (MapLibre GL, WebGL) runs at ~4.6 fps on USACE workstations because pages from commercial
origins are rendered through DoD remote browser isolation (DISA Cloud-Based Internet Isolation, delivered
by Menlo Security's "Adaptive Clientless Rendering"). The page's JavaScript runs in a cloud browser with
no GPU (hence SwiftShader in every WebGL context), the DOM is mirrored to the local browser, and a
`<canvas>` is shipped back as pictures at a fixed rate (~216 ms per frame, measured identically on two
machines, in Chrome and Edge, and on two hosts). `.mil` sites bypass isolation, which is why the National
Levee Database map (Leaflet, image tiles, no WebGL) is smooth, and DOM-based maps (the owner's EASI/SFARI
Shiny + Leaflet apps on the same Connect Cloud host) mirror fine. The workstations and the app code are
not the problem. It is not yet confirmed by IT; Stage A below makes it undeniable.

## 2. Evidence trail (all verified)

| Date | Evidence | Meaning |
|---|---|---|
| 2026-08-31 | `?diag=1` on the Dell Precision (Intel UHD 0x9A70 + RTX A3000, 3 displays): SwiftShader in all 8 WebGL context configurations; ~215 ms/frame on 2-layer raster, 396-layer vector, quarter pixels, +963 circles (all within 2 ms) | Fixed per-frame cost, not rendering work; no app setting can change it |
| 2026-08-31 | Full Chrome restart, forcing Chrome onto the RTX A3000, chrome://policy review: no change; `chrome://gpu` shows a healthy D3D11 GPU process | The local GPU process is fine; the page contexts are not local |
| 2026-09-01 | Owner: Microsoft Edge shows the same lag | Not a Chrome-profile problem |
| 2026-09-01 | https://nld.sec.usace.army.mil/map is smooth on the same machines; inspected: Leaflet 1.9.4, OpenStreetMap PNG `<img>` tiles, all levee layers are WMS PNG tiles from levees.sec.usace.army.mil, zero `<canvas>` | Proves the DOM/compositor path is fast there; says nothing about WebGL |
| 2026-09-02 | Second USACE machine (16 threads, 32 GB, 1920×1200, Chrome 152): identical signature, median 216 ms on every run | Fleet-wide, not one driver |
| 2026-09-02 | `data:` URL WebGL test in the same browser on that machine: `ANGLE (Intel, Intel(R) UHD Graphics (0x00009A70) Direct3D11 vs_5_0 ps_5_0, D3D11)` | Local WebGL IS hardware. Chrome never varies the WebGL backend per origin, so the deployed page's JavaScript runs somewhere else |
| 2026-09-02 | Connect Cloud mirror (https://gtmenichino-resst-dev.share.connect.posit.cloud): same lag; its `?diag=1` reports SwiftShader | Isolation applies to `connect.posit.cloud` too (commercial origin) |
| 2026-09-02 | Menlo's Smart DOM description: JS executes in the isolated browser; DOM/layer tree mirrored; scrolling and CSS transforms local at 60 fps; images/glyphs sent as resources; "WebGL … is often disabled in virtualized environments" | Mechanism for DOM-smooth / canvas-choppy |
| 2026-09-02 | Chromium's `navigator.deviceMemory` is NOT capped at 8 GB (a 64 GB box reports 32) | Not a cloud-browser telltale; do not use it |

Ruled out along the way: Chrome policy, browser restart, GPU preference override, network path and proxy
compression (measured from the cloud browser, so "clean"), app workload (basemap and layer count),
display scaling, browser choice, one-machine driver state.

## 3. What exists now

### Deliverables
- **IT fault report (forwardable, private until shared):**
  https://claude.ai/code/artifact/431f3af4-f2df-4a0a-b04c-fe9bf594e744 — the decisive test, both machines'
  numbers, why isolation explains every observation, Option A (CBII bypass/allow-list entry for
  `usace-wrises.github.io` and the tile hosts) and Option B (host the static build on a USACE `.mil` web
  host), host list, ticket facts. The earlier report artifact (4391d867…) belongs to another account
  context and cannot be updated; use this one.
- **Connect Cloud test mirror**, deployed by hand from VS Code with Posit Publisher:
  https://gtmenichino-resst-dev.share.connect.posit.cloud (account `gtmenichino`, content id
  `01a06215-18c4-ec7b-8380-94ab98481c42`, vanity URL, public). GitHub Pages
  (https://usace-wrises.github.io/resst-dev/) remains canonical and was not touched.

### Uncommitted changes in the working tree (nothing pushed; Pages unaffected)
- `scripts/build-connect.mjs` (new): root-base build of the same app into `connect-cloud/` via Vite's JS
  API (`base: "/"`, `outDir: "connect-cloud"`, `emptyOutDir: false`, clears everything except
  `connect-cloud/.posit/`). Guards: `index.html` must reference `/assets/index-`; no quoted literal
  `"/resst-dev/` may survive in index/bundles; glyph file present. **Manifest rename:** Posit Publisher's
  bundler drops every file named `manifest.json` (Posit's own bundle-manifest name), so a build-only Vite
  transform rewrites the single `"data/manifest.json"` fetch in `src/lib/data.ts` to
  `"data/data-manifest.json"` and the built file is renamed; guards check exactly one rewrite and no
  remaining old reference. `sediment/manifest.json` is never fetched at runtime and is left excluded.
- `package.json`: `"build:connect": "npm run validate && npm run build:data && tsc --noEmit && node scripts/build-connect.mjs"`.
  Note: `build:data` refreshes the `generated` timestamp in `public/data/manifest.json`; discard with
  `git checkout -- public/data/manifest.json` unless the CSVs changed.
- `.gitignore`: `connect-cloud/*` and `!connect-cloud/.posit/`.
- `connect-cloud/.posit/publish/resst-dev-RVN2.toml`: Publisher's configuration (the name its wizard chose;
  the deployment record's `configuration_name` points at it). Files list: `/index.html`, `/assets/`,
  `/data/`, `/sediment/`, `/overlays/`, `/fonts/`, `/help/`, `/favicon.png`, `/logo.svg`,
  `/apple-touch-icon.png`; `public_access = true`. The wizard's original list had only the 8 files
  `index.html` references (the first deploy failed with `data/sites.json: HTTP 404`).
- `connect-cloud/.posit/publish/deployments/deployment-9K5N.toml`: Publisher's deployment record
  (content id, URLs, `files` uploaded). **After any deploy, read its `files` array: it is the ground
  truth of what was uploaded.**
- `.claude/launch.json`: `connect-mirror-preview` entry (`npx vite preview --outDir connect-cloud --base / --port 4174`).
- `docs/DEPLOYMENT.md`: section "Second host: Posit Connect Cloud (test mirror, deployed by hand)" with
  build, first deploy, redeploy, reading `?diag=1`, stopping, contingencies, the manifest quirk; base-path
  and custom-domain notes amended. The "Mirror URL" placeholder should be filled with the URL above.

When ready: commit `connect-cloud/.posit/**`, the script, `.gitignore`, `package.json`, `launch.json`,
and the docs (no attribution trailers). Pushing will redeploy Pages with a functionally identical bundle
(only `docs/`, scripts, and config changed; no `src/` changes).

### Redeploy routine for the mirror
`git pull` → `npm run build:connect` → VS Code → Posit Publisher → select the existing "RESST (Connect
Cloud test mirror)" deployment → Deploy Your Project (full ~148 MB upload each time) →
`git checkout -- public/data/manifest.json`.

### Facts about the mirror build
`vite.config.ts:6` `base: "/resst-dev/"` is the only hosting-specific setting; all 7 runtime uses of
`import.meta.env.BASE_URL` take relative suffixes; `index.html` uses root-absolute paths Vite rewrites;
a relative `./` base would break the glyph URL in `src/map/basemaps.ts:69` (prefixes `location.origin`).
Everything the app serves is committed under `public/` (`build:overlays`/`build:sediment` are dev-time
only). Vite's `emptyOutDir` spares only `.git`. Connect Cloud serves each content item at the root of
its own hostname. Posit's docs: config + deployment record in `.posit/publish` are meant to be
committed. The mirror's `?diag=1` Network row may say "proxy" if the host serves http/1.1 or
uncompressed JSON; compare with the Pages row before reading anything into it.

## 4. Decisions the owner made (so a fresh session does not re-ask)

- Environment checks before code (done; isolation confirmed by the `data:` URL test).
- Full 148 MB mirror (overlays included), manual redeploys; automatic redeploys from a GitHub branch via
  Connect Cloud's "Static Document" integration declined for now.
- No changes to the diag verdict wording about "browser or driver problem" or the DEPLOYMENT.md paragraph
  claiming "no application fix" — "not now" (both are now known-incomplete).
- No `.mil` deployment package for now; the IT report carries the request.
- Posit Connect Cloud is not a workaround unless IT has exempted that domain (it is a commercial origin);
  the owner has no internal `.mil` Posit Connect server.
- The plan below (Stage A first, Stage B gated) was presented; approval deferred by the owner because of
  usage limits. Re-run later.

## 5. How to resume

1. Open a session in `D:\Code\Work\resst-dev`; read this file and the memory notes.
2. Decide whether to commit the mirror work first (section 3) or leave it uncommitted.
3. Approve and build **Stage A** (section 6), ship it to the mirror only (`npm run build:connect` +
   Publisher deploy; nothing pushed), and run the reading protocol on the USACE laptop.
4. If the DOM map trial reports GO, approve **Stage B** (section 7).
5. In parallel, forward the IT report; a CBII bypass or `.mil` hosting fixes the WebGL map outright.

---

## 6. Stage A — decisive diagnostics on `?diag=1` (ready to implement)

Purpose: distinguish "this page's JavaScript runs on another machine" from any local GPU problem, in a
form the owner and IT can see for themselves, and measure whether a DOM-rendered map would be smooth.

### Verified anchors
- Diagnostics: `src/diag/DiagnosticsPage.tsx` (`run()` :64-106, report state, markdown at :115, verdict
  class regex :155), `src/diag/collect.ts` (`collectEnvironment` :110-123, `fetchSitePoints` :243-257,
  `runBenchmark`, `REACH_TARGETS` :276-286), `src/diag/probes.ts` (`frameStats`, `classifyRenderer`
  :54-62, `DiagReport` :254-277, `summarize` :280-342, `formatReport` :345-411). Lazy import in
  `src/main.tsx:14`; no `manualChunks`, so a dependency imported only under `src/diag` stays out of the
  main bundle, and a dynamic `import("leaflet")` inside the diag chunk gets its own chunk.
- `tests/e2e/diag.spec.ts` pins `diag-bench-table` to 4 rows and `diag-context-table` to 8, uses
  `toContainText` on markdown headings, stubs REACH hosts (`mode: "no-cors"`); new outbound hosts must
  be stubbed. `tests/diagProbes.test.ts` `baseReport()` fixture at :177-198.
- Publisher uploads all of `/assets/`, so new chunks need no config change.
- `document.fonts.check()` returns true for any family with no `@font-face`, so it cannot detect
  installed fonts; use canvas `measureText` width differences. `navigator.deviceMemory` is not capped.
  `api.ipify.org` and `api64.ipify.org` answer `?format=json` with `Access-Control-Allow-Origin: *`.
- Leaflet: `leaflet@1.9.4` (BSD-2, no deps, `dist/leaflet.css`), `@types/leaflet@1.9.22`; do not use the
  2.0 alpha.

### A1. `src/diag/probes.ts` (pure, unit-tested)
Types: `Telltales` (uaClaims parsed from the UA; `navigator.platform`; `userAgentData.platform`,
high-entropy `platformVersion/architecture/bitness`, brands; cores; deviceMemory; time zone + offset;
languages; `windowsFonts` {Segoe UI, Calibri, Consolas} and `linuxFonts` {DejaVu Sans, Liberation Sans,
Ubuntu} presence; outer vs inner window; `screen.isExtended`; `maxTouchPoints`; `pdfViewerEnabled`;
`egress {ip, host, ms, error?}`), `RemoteVerdict {level: likely|possible|unlikely|insufficient,
reasons}`, `PointerProbe` (dragMs, events, perSec, median/p90 interval, maxGap, coalesced counts,
pointerType, raf stats), `MotionTest {durationMs, loop, observation: both-smooth|canvas-choppy|
both-choppy|not-judged}`, `CompositorRow {key: raf|canvas2d|dom, label, stats, error?}`, `DomTrial
{loadMs, markers, gestures, raf, observation: smooth|choppy|not-judged, error?}`. `DiagReport` gains
`telltales, compositor, pointer|null, motion|null, domTrial|null` (all required; fixture updated).

Functions: `platformFromUA`; `looksRemote(t)` — conservative: strong = Windows UA but JS platform says
Linux/Android/other, or no Windows font present, or a Linux font present; moderate = no browser chrome
(outer ≤ inner, with the kiosk caveat); weak = UTC/Etc time zone with en-US, `pdfViewerEnabled === false`
on desktop; `likely` needs a strong reason, `insufficient` when fonts and platform are both unavailable;
`pointerStats` + `judgePointer` (≥55/s and gaps <100 ms = local; <30/s or gaps >150 ms = relayed);
`judgeMotion` (canvas-choppy with loop ≥45 fps = "display is remote, canvas pixels streamed";
both-choppy with <30 fps = CPU); `judgeDomTrial` (null / <3 gestures / GO ≥45 fps smooth / NO-GO
choppy); `judgeCompositor`; `LOCAL_CHECK_URL` (the `data:` URL below; unit test: one line, no `#`, no
raw space, no `\`). `summarize()` appends `LIKELY REMOTE:`/`Possibly remote:` lines, and when
`renderClass === "software"` and `likely`: "This matches remote browser isolation… A DOM-rendered map
would not be affected." `formatReport()` adds `## Where this page runs` (rows + egress IP + the
local-check instruction and URL on its own line), `## Compositor`, `## Interaction`, `## DOM map trial`.

### A2. `src/diag/collect.ts` (browser)
`fontPresent(family)` via canvas 2D `measureText("mmmmmmmmmmlli wwww")` at 72 px against `monospace` and
`sans-serif` fallbacks; `collectTelltales(egressPromise)` (every read guarded; `getHighEntropyValues`
raced against 1 s); `fetchEgressIp(5000)` → ipify then api64 fallback (started first in `run()`,
awaited last); `measureRaf(ms)` (rAF loop ended by a wall-clock timeout, null when suspended);
`runCompositorProbes(host)` → three 2 s rows: idle rAF, Canvas 2D (800×500, clear + 200 arcs/frame),
DOM (a div moved by `style.transform` per frame). `fetchSitePoints` gains
`properties {site_id, site_name}` and a memoized promise.

### A3. `src/diag/interactive.ts` (browser, opt-in)
`startPointerProbe(box, dot, onDone)` — pointer capture; records `timeStamp` and
`getCoalescedEvents().length` per move; moves the dot with `transform` (under a relay the dot visibly
trails the cursor); ≥1 s counts, copy asks for 3 s. `runMotionTest(left, canvas, 10000)` — one rAF loop,
triangle wave; left = CSS `translateX`, right = `clearRect + fillRect` of the identical rectangle; a
third strip driven by a pure CSS `@keyframes` animation as the known-local control. Copy: "If the left
box glides and the right one stutters, the page is rendered remotely and canvas content is streamed."

### A4. `src/diag/leafletTrial.ts` (own chunk via dynamic import)
`import * as L from "leaflet"; import "leaflet/dist/leaflet.css"`. `startLeafletTrial(container, fc,
onUpdate)`: `L.map` with zoom + attribution controls, `fitBounds` to the CONUS bounds (copy the constant
from `MapPanel.tsx:48`; do not import MapPanel); tiles from `USGS_TOPO_TILES`/`USGS_TOPO_ATTRIBUTION`
exported from `src/map/basemaps.ts:73-77` (refactor `buildUsgsStyle` to use them; `maxNativeZoom: 16`);
963 `L.circleMarker` r 5.5 red/yellow with popups on the default SVG renderer (NOT `preferCanvas`);
label sample on `moveend` at zoom ≥ 7 (Leaflet basis = MapLibre 6 + 1): permanent tooltips for ≤150
in-view markers; rAF cadence measured between `movestart/zoomstart` and `moveend/zoomend`; gesture
count; `loadMs`; Smooth/Choppy buttons after ≥3 gestures → merged into the report as `domTrial`. Copy:
"Drag and zoom this map. This is how RESST would look in DOM mode."

### A5. `src/diag/DiagnosticsPage.tsx`
`run()`: start `fetchEgressIp()` first; compositor probes before the benchmark ("Measuring
compositor…"); telltales awaited after the benchmark; report gets `telltales, compositor, pointer: null,
motion: null, domTrial: null`. Opt-in probes render only when `phase === "done"` and merge with
`setReport(r => r && {...r, pointer})` so the `diag-markdown` and Copy report always include what the
user did; a line by the Copy button: "Included: pointer ✓ · motion — · DOM trial —". New sections and
testids (existing ones untouched): `diag-telltale-table` pinned to 15 rows + `diag-local-check` code
block with a "Copy local-check URL" button; `diag-compositor-table` (3 rows); `diag-pointer-panel`
(`diag-pointer-box`, `diag-pointer-table`); `diag-motion-panel` (`diag-motion-start`,
`diag-motion-result`, three observation buttons); `diag-domtrial-panel` (`diag-domtrial-start`,
`diag-domtrial-map` 800×500 outside `.bench`, `diag-domtrial-result`, Smooth/Choppy). Verdict class
regex gains `REMOTE|NO-GO`. Styles for the probe box, the motion boxes, the trial map, and
`.diag-site-label` tooltips (blue, text-shadow halo).

The local check `data:` URL is one line, results written with `textContent` into divs (never
`document.write` after the async fetch), printing renderer, platform, cores/memory, time zone, window
outer/inner, and the local egress IP; encoded with `%20`, `%3F`, `%22`, no `#`/`%`/`\` elsewhere.
Verify at implementation by decoding it in Node and running the script body in a browser page. The
simpler renderer-only version the owner already used successfully:

```text
data:text/html,<script>const g=document.createElement('canvas').getContext('webgl'),d=g.getExtension('WEBGL_debug_renderer_info');document.write(g.getParameter(d.UNMASKED_RENDERER_WEBGL))</script>
```

### A6. Dependencies
`package.json` `leaflet ^1.9.4`, dev `@types/leaflet ^1.9.22`; after install, confirm `vite build`
emits `leaflet-*.js` separately from `DiagnosticsPage-*.js` and that `index-*.js` size is unchanged.

### A7. Unit tests `tests/diagProbes.test.ts`
Extend `baseReport()`; new describes for `platformFromUA`, `looksRemote` (Windows UA + Linux platform →
likely; Windows UA + no Windows fonts + DejaVu → likely; healthy Windows desktop → unlikely;
outer==inner only → possible; UTC/en-US only → possible; masked everything → insufficient, never
likely), `pointerStats`/`judgePointer` (180 events in 3 s → local; 60 events with a 300 ms gap →
relayed), `judgeMotion` (four observations), `judgeDomTrial`, `judgeCompositor`, `summarize` synthesis
line, `formatReport` headings, `LOCAL_CHECK_URL` constraints.

### A8. E2E `tests/e2e/diag.spec.ts`
Stub `api.ipify.org` and `api64.ipify.org` with `{ status: 200, contentType: "application/json",
headers: { "access-control-allow-origin": "*" }, body: '{"ip":"203.0.113.7"}' }` (this fetch reads the
body, unlike the no-cors REACH stubs); assert telltale table 15 rows containing `203.0.113.7`,
compositor table 3 non-blank rows, markdown contains the four new headings and `data:text/html`;
existing 4/8 counts untouched. New tests: pointer probe opt-in (mouse drag ~1.5 s in
`diag-pointer-box` → `diag-pointer-table` visible, markdown contains "Pointer events"); DOM map trial on
stubbed tiles (`stubUsgsTiles` already matches the host) → `.leaflet-container` visible,
`.leaflet-overlay-pane path` ≥ 900, three drags, click Smooth, markdown contains "GO:" or "gestures".
"Finished." stays inside the 120 s budget (new timed probes ≈ 6 s).

### A9. Docs
`docs/DEPLOYMENT.md`: rows for the four new sections in the diag table and the reading protocol in the
mirror section.

### A10. Shipping and the reading protocol
Ship: `npm test` → `npx playwright test tests/e2e/diag.spec.ts` → `npm run build:connect` → Publisher →
Deploy the existing mirror deployment → `git checkout -- public/data/manifest.json`. Nothing committed
or pushed; Pages untouched. Sanity-check the mirror's `?diag=1` from the dev box first.

Owner, on the USACE laptop (Chrome and Edge): (1) open the mirror `?diag=1`, wait for "Finished.", read
"Where this page runs"; (2) copy the local-check URL, paste it into a NEW tab's address bar, compare IP
and renderer with the report (different = the page's JavaScript runs elsewhere); (3) drag in the pointer
box for 3 s (does the dot trail?), run the motion test and answer, run the DOM map trial for ~20 s and
answer Smooth/Choppy; (4) Copy report. Reading: IP differs + renderer differs + canvas box stutters
while the DOM box glides + DOM map smooth → isolation confirmed, Stage B is GO. Same IP + software
renderer on both pages → a local GPU/driver problem (Stage B still helps; the IT message changes). DOM
map also choppy → stop; do not build Stage B on that evidence.

---

## 7. Stage B — "Compatibility (DOM) map" mode (designed; build only on Stage A's GO; ~15 days)

### Map contract a second renderer must honor (verified)
- `src/map/mapBus.ts` `MapCommands` (11 methods: fitToSites, flyTo, showPlaceMarker, clearPlaceMarker,
  refreshOverlay, highlightNetwork, clearNetworkHighlight, fitNetwork, fitToPoints, showBasin,
  clearBasin), type-only imports; registered at `MapPanel.tsx:164`; callers in SearchControl
  :121-126/:195, ScreeningPanel :97, MapToolPanels :129, TablePanel :89, NetworkSection
  :61-63/:73-83/:107/:199.
- `MapPanel` props (sites, allSites, siteById, siteByShortId, state), effects :423-544, JSX :546-568
  (`.map-panel-wrap` > `.map-panel` role=application + `.select-box` + `.map-toolbar` + BasemapPicker
  portal); `popupHtml`/`reservoirPopupHtml` local at :63-87; `sitesToGeoJSON` :50-61;
  `window.__resstMap` :154; ResizeObserver :403-407.
- `selectTools.ts`: `SessionCtx.map: MlMap` :41-53; box uses `queryRenderedFeatures` :161 and `dragPan`
  :132/:178; polygon uses `on click/mousemove/dblclick`, `project` :214-216, `ov-draw` :207/:263;
  huc/river need only click lngLat + pure geometry (`spatial.ts`, `localQueries.ts`); river uses
  `getZoom` at :327. Three of four tools need only projection.
- Layers: sites (:238-280; labels minzoom 6 `text-optional`), `nw-*` from pure `buildNetworkFeatures`
  (`networkLayer.ts:113-140`; `up` can be tens of thousands), basin (:164-168), `ov-*` (`overlays.ts`:
  static snapshots 2-39 MB in `staticRuntime`, `getStaticOverlayFC` :204, `getHucIndex` :208-213, live
  points via `esriPoints.ts`, SSURGO WMS :91-105), national 57,307 points (`nationalLayer.ts`
  `buildNationalGeoJSON` :116-151, `paintForMetric` :100-108, radius/opacity/stroke :163-174; screening
  `buildScreenFilter` with pure mirror `matchesRow`/`screenCore` in `src/sediment/screen.ts:87-127`).
- Basemaps: USGS raster tiles `basemaps.ts:73-77`; Esri is vector-only (no raster configured);
  `applyBasemap` :176-206 + `revertBasemap` store :278-286. Store persistence pattern: `parseBasemapId`
  :26-31, init IIFE :124-130, `setBasemap` :267-275. `ReportMap.tsx` stays MapLibre.
- E2E: 16 specs use `window.__resstMap` (getLayer/getSource().getData()/project/jumpTo/isMoving/
  getCenter/queryRenderedFeatures/getCanvas/getContainer); 8 axe-exclude `.maplibregl-canvas`;
  `playwright.config.ts` has no `storageState` (baseURL `http://localhost:4173/resst-dev/`, 1440×900).
- Three hard WebGL dependencies: box-select hit testing, the report snapshot, collision-avoided labels.

### Decisions
Leaflet 1.9.4 mounted INSTEAD of the MapLibre panel; Leaflet zoom = MapLibre zoom + 1 via `lz()/mz()` in
`src/map/dom/zoom.ts` (labels 6→7, flyTo 9→10, fitBounds max 10→11, river tolerance uses
`metersPerPixel(mz(zoom))`); renderer derived, never stored: `resolveRenderer(pref, renderClass)` =
`auto ? (software ? dom : webgl) : pref`, detection via `classifyRenderer` (pure, tiny) memoized in
`sessionStorage`; same `MapCommands`, props, toolbar, actions, popups; `ReportMap.tsx` unchanged. Under
isolation only DOM/SVG mutations and CSS transforms play locally; Leaflet's canvas renderer redraws only
at settle and is CSS-transformed during gestures, so heavy static layers on canvas cost one picture per
settle while interactive layers stay SVG.

### Parts
- **Store/host/toggle**: `store.ts` `MapRenderer = auto|webgl|dom`, `parseMapRenderer`,
  `resst.mapRenderer`, `setMapRenderer` (basemap pattern); `src/map/renderer.ts`; `src/map/MapHost.tsx`
  with `lazy(() => import("./dom/DomMapPanel"))` chosen at `App.tsx:101-107`; footer notes the mode;
  `BasemapPicker.tsx` second radiogroup "Map engine" Automatic / Standard (WebGL) / Compatibility (DOM)
  with a note; `styles.css` `.map-panel .leaflet-container` rules.
- **Modules `src/map/dom/`**: `leaflet.ts` (import + CSS + default-icon URL fix), `zoom.ts`,
  `DomMapPanel.tsx` (all 11 commands, same effect list as `MapPanel.tsx:423-544`, `role="application"`,
  `window.__resstLeaflet` + `__resstDom.counts()` for e2e, ResizeObserver → `invalidateSize`),
  `basemap.ts` (USGS tiles; Esri raster World_Topo_Map
  `services.arcgisonline.com/arcgis/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}` with its
  attribution; status/revert parity with `applyBasemap`), `sites.ts`, `labels.ts` + pure
  `labelCollision.ts` (viewport-culled permanent tooltips, ≤150, greedy collision on `moveend`),
  `select.ts` (highlight + sketch, SVG), `network.ts`, `basin.ts`, `overlays.ts`, `national.ts` +
  `NationalCanvasLayer.ts`, `toolMapLeaflet.ts`; `src/map/popupHtml.ts` extracted from
  `MapPanel.tsx:63-87` for both engines.
- **Layer mapping**: basemap → `L.tileLayer` (img); sites → `L.circleMarker` SVG r 5.5 with popups;
  selection ring → SVG group; labels → permanent tooltips with collision; place marker → `L.marker`;
  `nw-conn/down/mouth(+label)` → `L.geoJSON` SVG from `buildNetworkFeatures`; `nw-up` → SVG if ≤500 else
  `L.canvas`; basin → `L.geoJSON` polygon; sketch/highlight → SVG; HUC/rivers snapshots → `L.geoJSON` on
  a shared `L.canvas` (`smoothFactor`), NID/gauges live points on the same canvas via `fetchGeojsonPoints`
  on `moveend`; SSURGO → `L.tileLayer.wms`; national 57k → custom canvas layer (typed arrays, one
  `Path2D` per color bucket, culled to padded pixel bounds, `screenCore`/`matchesRow` visibility mask,
  hide-during-zoom fallback, grid-index click routing with documented sites winning); `nat-selected` →
  one SVG ring.
- **Select tools seam**: `SessionCtx.map: ToolMap` interface (`project`, `getZoom` in MapLibre basis,
  `getInteractiveElement`, `on/off click|mousemove|dblclick` with `{lngLat, point, originalEvent,
  preventDefault}`, `setDragPan/setBoxZoom/setDoubleClickZoom`, `setSketch`, `setHighlight`,
  `sitesInBox`); adapters `src/map/toolMapMaplibre.ts` and `dom/toolMapLeaflet.ts`; both use one pure
  `sitesInScreenBox(sites, project, sw, ne, slackPx = 5.5)` so box-select behaves the same in both
  modes (semantic change from `queryRenderedFeatures`, recorded in PARITY.md).
- **Overlays runtime**: split `overlays.ts` into fetch/cache/status (shared, `staticRuntime`,
  `getStaticOverlayFC`, `getHucIndex` unchanged) and an `OverlaySink` interface
  (`getBounds/getZoom/isMoving/setData/setVisible`) with a MapLibre sink and a Leaflet sink.
- **Tests**: `playwright.config.ts` `use.storageState` seeding `resst.mapRenderer=webgl` for
  `http://localhost:4173` (headless Chromium is SwiftShader, so the auto rule would flip the whole suite
  into DOM mode); `scripts/help-screenshots.mjs` seeds the same; new `tests/e2e/dom-map.spec.ts` seeding
  `dom` (boot, site click → selection + popup, table row → setView, box select, network highlight,
  basemap switch with a new `stubEsriRasterTopo`, engine toggle back to WebGL, axe excluding
  `.leaflet-pane`); unit `tests/domMap.test.ts` (`colorForMetric` vs `paintForMetric` at every stop,
  radius/opacity, label collision, `sitesInScreenBox`, `resolveRenderer`, `parseMapRenderer`, `lz/mz`,
  grid index).
- **Docs**: PARITY.md difference 28 (raster Esri, greedy labels, box-select by centers, national
  redraw at settle, half-step zoom); DEPLOYMENT.md mode + key + how to force it.

### Order and effort (days)
spike 57k canvas + snapshots 1 · store/host/toggle/config 1.5 · panel core 2 · labels 1 · ToolMap seam +
tools 2 · overlays sink 1.5 · network + basin 1 · national canvas 2 · e2e/a11y/mobile/docs 1.5 · laptop
polish via the mirror 1.5 = **~15 (13-17)**.

### Risks
57k redraw per settle (<100 ms target, measured in the spike); snapshot re-projection hitch on zoom
(decimate for DOM mode or full detail only at zoom ≥ lz(5)); SVG node counts under mirroring (~1.7k;
Stage A's 963-path trial is the direct measurement); label placement differs; touch; a second Esri
endpoint; `zoomSnap` feel; two engines to maintain; mid-session engine switch re-applies state; Leaflet
icon paths under Vite; `@types/leaflet` under TypeScript 7; help-screenshot seed drift.

---

## 8. Verification (both stages)

- Stage A: `npm test` (new pure tests), `npm run build` (Pages build unchanged: `index-*.js` hash
  identical, new `leaflet-*` chunk only referenced from the diag chunk), `npx playwright test
  tests/e2e/diag.spec.ts`, then `npm run build:connect` + Publisher deploy; the mirror's `?diag=1` from
  the dev box shows the new sections; the owner runs the protocol on the laptop and pastes the report.
- Stage B (if built): full Playwright suite on WebGL (unchanged) + `dom-map.spec.ts`; the mirror on the
  laptop in Compatibility mode: drag/zoom feel, click/select/popup, network highlight, box select,
  basemap switch, national layer settle time.

## 9. Superseded ideas (recorded so they are not rebuilt)

- "Reduced graphics" one-render-per-gesture MapLibre mode (`reduceMotion: true` is a library-global
  flag set only via the constructor; CSS-transform previews of the canvas during drag/wheel; popups live
  in `.map-panel`, not the canvas container; `touch-action: none` needed; Playwright headless is
  SwiftShader): superseded because under isolation the canvas is streamed regardless of how often it is
  drawn.
- Basemap switching and reduced-resolution rendering: measured to change nothing (frame cost is fixed).
- Chrome flags / driver / GPU preference: not the cause (local WebGL is hardware).

## 10. Workflow gotchas learned today

- Posit Publisher's wizard generates its own config (only the files `index.html` references); the
  committed config's `files` list must name every folder; check Project Files before deploying and the
  deployment record's `files` after.
- Publisher drops files named `manifest.json`; the mirror build renames `data/manifest.json`.
- On this account, content defaulted to private (302 to `login.posit.cloud`); `public_access = true` in
  the config fixed it on redeploy.
- The Claude browser pane suspends rAF and cannot screenshot scrolled regions or file:// tabs; verify
  pages over HTTP (a launch.json entry) and read computed styles/accessibility trees instead.
- Bash heredocs are fine for ASCII files; use the Write tool for files with non-ASCII characters.

## 11. Status after 2026-09-02 (resumed in a new session)

Decisions (owner):
- The mirror work in section 3 is committed locally (`be3f29a`); nothing pushed.
- Stage A is reduced to the Leaflet DOM-map trial only (A4/A5 of section 6). The egress-IP probe,
  platform/font telltales, pointer probe, motion test and compositor rows are dropped: they were IT
  evidence, not performance work, and the renderer comparison already in the IT report is decisive.
- Two changes to the trial as designed: the user's Smooth/Choppy answer decides GO/NO-GO regardless of
  the rAF numbers (under isolation the rAF loop runs in the cloud browser), and an SVG | Canvas marker
  toggle lets both renderers be judged, which de-risks the Stage B question of putting heavy layers on
  canvas. Settle time (moveend → paint) is recorded for the Stage B risk register.
- Stage B stays gated on the trial's GO and is rephased: B1 = core map without overlays and the
  national layer (~8 days), B2 = overlay sink + national canvas layer (~5 days), decided after B1 is
  used on the laptop.
- The note's "index-*.js hash identical" check is not achievable for any diag edit (index embeds the
  diag chunk's hashed name and exports the preload helper to it); the check is now "index free of
  Leaflet and identical after normalising that name and the export list".

Built (this commit): `src/diag/leafletTrial.ts` (Leaflet in its own chunk), `src/diag/DomTrialPanel.tsx`,
`DomTrial` types, `settleStats` and `judgeDomTrial` in `src/diag/probes.ts`, `## DOM map trial` in the
report, shared `USGS_TOPO_TILES` / `USGS_TOPO_ATTRIBUTION` in `src/map/basemaps.ts`, memoized
`fetchSitePoints` with site names, unit and e2e tests, DEPLOYMENT.md rows and the reading protocol.
Plan file: `C:\Users\gtmen\.claude\plans\review-and-pick-back-playful-sunrise.md`.

**Readout (2026-09-02, USACE laptop, mirror `?diag=1`):**
`DOM map trial: GO — SVG markers felt smooth (55 gestures, 4 fps during gestures, settle median 344 ms /
max 438 ms); canvas markers felt smooth (56 gestures, 3.8 fps during gestures, settle median 326 ms /
max 422 ms)`.

Reading: **GO for Stage B1** with SVG site markers, and Leaflet canvas layers (CSS-transformed during
gestures, redrawn once at settle) are viable too, so B2's national-layer-on-canvas design holds. The
numbers are the isolation fingerprint from a second angle: the page's own frame loop ran at ~4 fps
(the ~250 ms streaming cadence, in the cloud browser) while the user saw the mirrored DOM move at local
refresh and judged it smooth. Under the WebGL map the same cadence is what the user sees. Budget for
Stage B: each settle costs ~340 ms of remote work before the mirrored DOM updates, so keep per-`moveend`
DOM work small (diffed labels, culled layers) and do nothing on `move`.
