// The ?diag=1 report's arithmetic and heuristics. These run in vitest's node
// environment, which is exactly why probes.ts is kept DOM-free: the numbers
// come from the browser, the interpretation is testable here.
import { describe, expect, it } from "vitest";
import {
  classifyRenderer,
  detectProxySignals,
  DOM_TRIAL_MIN_GESTURES,
  formatReport,
  frameStats,
  judgeDomTrial,
  percentile,
  settleStats,
  summarize,
  summarizeContextMatrix,
  summarizeTimings,
  type BenchRun,
  type ContextProbe,
  type DiagReport,
  type DomTrial,
  type DomTrialRun,
  type HostTiming,
} from "../src/diag/probes";

describe("percentile", () => {
  it("indexes an ascending array and clamps at both ends", () => {
    const a = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentile(a, 0.5)).toBe(6);
    expect(percentile(a, 0)).toBe(1);
    expect(percentile(a, 1)).toBe(10);
  });

  it("returns 0 for an empty array rather than NaN", () => {
    expect(percentile([], 0.5)).toBe(0);
  });
});

describe("frameStats", () => {
  it("summarizes a steady 60fps run", () => {
    const deltas = new Array(60).fill(16.7);
    const s = frameStats(deltas, 1000)!;
    expect(s.frames).toBe(60);
    expect(s.fps).toBe(60);
    expect(s.medianMs).toBe(16.7);
    expect(s.over50).toBe(0);
    expect(s.over100).toBe(0);
  });

  it("counts janky frames above both thresholds", () => {
    const s = frameStats([16, 16, 60, 120, 300], 1000)!;
    expect(s.over50).toBe(3);
    expect(s.over100).toBe(2);
    expect(s.worstMs).toBe(300);
  });

  it("returns null when nothing rendered — a suspended tab is a real outcome", () => {
    expect(frameStats([], 1000)).toBeNull();
    expect(frameStats([0, -1], 1000)).toBeNull();
  });

  it("returns null rather than dividing by a zero wall clock", () => {
    expect(frameStats([16, 16], 0)).toBeNull();
  });
});

describe("classifyRenderer", () => {
  it("flags every CPU fallback Chrome can report, including ANGLE-wrapped ones", () => {
    expect(classifyRenderer("ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device))")).toBe("software");
    expect(classifyRenderer("llvmpipe (LLVM 15.0.7, 256 bits)")).toBe("software");
    expect(classifyRenderer("Microsoft Basic Render Driver")).toBe("software");
  });

  it("passes real GPUs through", () => {
    expect(classifyRenderer("ANGLE (Intel, Intel(R) UHD Graphics (0x00009A70) Direct3D11)")).toBe("hardware");
    expect(classifyRenderer("ANGLE (NVIDIA, NVIDIA RTX A3000 Laptop GPU Direct3D11)")).toBe("hardware");
  });

  it("does not guess when the string is masked", () => {
    expect(classifyRenderer(null)).toBe("unknown");
    expect(classifyRenderer("")).toBe("unknown");
  });
});

describe("summarizeTimings", () => {
  it("groups by host and marks cross-origin entries opaque", () => {
    const out = summarizeTimings([
      { name: "https://a.example/x.js", duration: 100, nextHopProtocol: "h2", encodedBodySize: 1024, decodedBodySize: 4096 },
      { name: "https://a.example/y.js", duration: 300, nextHopProtocol: "h2", encodedBodySize: 1024, decodedBodySize: 4096 },
      // A tile with no Timing-Allow-Origin: zeroed sizes, blank protocol.
      { name: "https://tiles.example/0/0/0.pbf", duration: 500, nextHopProtocol: "", encodedBodySize: 0, decodedBodySize: 0 },
    ]);
    const a = out.find((h) => h.host === "a.example")!;
    expect(a.count).toBe(2);
    expect(a.opaque).toBe(false);
    expect(a.encodedKB).toBe(2);
    const tiles = out.find((h) => h.host === "tiles.example")!;
    expect(tiles.opaque).toBe(true);
    expect(tiles.maxMs).toBe(500);
  });

  it("sorts by request count and skips unparseable urls", () => {
    const out = summarizeTimings([
      { name: "not a url", duration: 10 },
      { name: "https://b.example/1", duration: 10 },
      { name: "https://a.example/1", duration: 10 },
      { name: "https://a.example/2", duration: 10 },
    ]);
    expect(out.map((h) => h.host)).toEqual(["a.example", "b.example"]);
  });
});

const host = (over: Partial<HostTiming>): HostTiming => ({
  host: "usace-wrises.github.io",
  count: 8,
  medianMs: 100,
  p95Ms: 200,
  maxMs: 300,
  protocols: ["h2"],
  encodedKB: 692,
  decodedKB: 3968,
  opaque: false,
  ...over,
});

describe("detectProxySignals", () => {
  it("reports a clean same-origin host", () => {
    const s = detectProxySignals(host({}));
    expect(s.protocolDowngrade).toBe(false);
    expect(s.compressionStripped).toBe(false);
  });

  it("flags an http/1.1 downgrade as TLS interception", () => {
    const s = detectProxySignals(host({ protocols: ["http/1.1"] }));
    expect(s.protocolDowngrade).toBe(true);
    expect(s.notes.join(" ")).toContain("terminating TLS");
  });

  it("accepts h3 as healthy", () => {
    expect(detectProxySignals(host({ protocols: ["h3"] })).protocolDowngrade).toBe(false);
  });

  it("flags stripped compression when transferred bytes match content bytes", () => {
    const s = detectProxySignals(host({ encodedKB: 3900, decodedKB: 3968 }));
    expect(s.compressionStripped).toBe(true);
  });

  it("does not cry compression on small payloads that legitimately do not shrink", () => {
    expect(detectProxySignals(host({ encodedKB: 40, decodedKB: 42 })).compressionStripped).toBe(false);
  });

  it("says so when there is nothing to read", () => {
    expect(detectProxySignals(undefined).notes[0]).toContain("No same-origin timings");
  });

  it("refuses to call a plain-http dev server a proxy — it is http/1.1 and ungzipped by design", () => {
    const s = detectProxySignals(
      host({ host: "localhost:5173", protocols: ["http/1.1"], encodedKB: 10389, decodedKB: 10389 }),
      "http://localhost:5173",
    );
    expect(s.protocolDowngrade).toBe(false);
    expect(s.compressionStripped).toBe(false);
    expect(s.notes[0]).toContain("not the deployed https origin");
  });

  it("still reads the fingerprints on the deployed https origin", () => {
    const s = detectProxySignals(
      host({ protocols: ["http/1.1"] }),
      "https://usace-wrises.github.io",
    );
    expect(s.protocolDowngrade).toBe(true);
  });
});

const run = (over: Partial<BenchRun> & Pick<BenchRun, "key" | "label">): BenchRun => ({
  layerCount: null,
  stats: null,
  loadMs: 400,
  loadTimedOut: false,
  ...over,
});

const baseReport = (over: Partial<DiagReport> = {}): DiagReport => ({
  generatedAt: "2026-08-31T00:00:00.000Z",
  url: "https://usace-wrises.github.io/resst-dev/?diag=1",
  userAgent: "test",
  devicePixelRatio: 1,
  screen: "1920x1080",
  hardwareConcurrency: 16,
  deviceMemory: 32,
  reducedMotion: false,
  webglVersion: 2,
  vendor: "Google Inc. (Intel)",
  renderer: "ANGLE (Intel, Intel(R) UHD Graphics Direct3D11)",
  renderClass: "hardware",
  strictContextOk: true,
  maxTextureSize: 16384,
  contexts: [],
  runs: [],
  hosts: [],
  proxy: { protocolDowngrade: false, compressionStripped: false, notes: [] },
  reach: [],
  domTrial: null,
  ...over,
});

describe("summarize", () => {
  it("leads with software rendering when that is what happened", () => {
    const out = summarize(baseReport({ renderClass: "software" }));
    expect(out[0]).toContain("CRITICAL");
  });

  it("tells a software-rendering machine that a basemap change will not save it", () => {
    const out = summarize(baseReport({ renderClass: "software" })).join(" ");
    expect(out).toContain("no basemap or layer change will fix it");
    expect(out).toContain("FULL Chrome restart");
  });

  it("does not treat a granted no-caveat context as proof of hardware rendering", () => {
    // Observed on the USACE laptop: SwiftShader with the strict context GRANTED.
    const out = summarize(baseReport({ renderClass: "software", strictContextOk: true }));
    expect(out[0]).toContain("CRITICAL");
  });

  it("quantifies the vector-vs-raster basemap gap and recommends the switch", () => {
    const out = summarize(
      baseReport({
        runs: [
          run({ key: "usgs", label: "USGS raster basemap", layerCount: 2, stats: frameStats(new Array(60).fill(16), 1000) }),
          run({ key: "esri", label: "Esri vector basemap", layerCount: 421, stats: frameStats(new Array(15).fill(64), 1000) }),
        ],
      }),
    ).join(" ");
    expect(out).toContain("4x slower");
    expect(out).toContain("USGS Topo basemap should measurably help");
  });

  it("says plainly when the two basemaps cost the same, instead of a bare 1x", () => {
    const out = summarize(
      baseReport({
        runs: [
          run({ key: "usgs", label: "USGS", layerCount: 2, stats: frameStats(new Array(60).fill(16), 1000) }),
          run({ key: "esri", label: "Esri", layerCount: 396, stats: frameStats(new Array(58).fill(17), 1000) }),
        ],
      }),
    ).join(" ");
    expect(out).not.toContain("should measurably help");
    expect(out).toContain("switching basemaps is not the fix on this machine");
  });

  it("quantifies the half-resolution lever when it pays", () => {
    const out = summarize(
      baseReport({
        runs: [
          run({ key: "esri", label: "Esri", stats: frameStats(new Array(15).fill(216), 3700) }),
          run({ key: "esri-half", label: "Esri half", stats: frameStats(new Array(60).fill(54), 3700) }),
        ],
      }),
    ).join(" ");
    expect(out).toContain("4x faster");
    expect(out).toContain("Performance Mode would help here");
  });

  it("says so when half resolution does not help, so fill rate is not blamed wrongly", () => {
    const out = summarize(
      baseReport({
        runs: [
          run({ key: "esri", label: "Esri", stats: frameStats(new Array(15).fill(216), 3700) }),
          run({ key: "esri-half", label: "Esri half", stats: frameStats(new Array(16).fill(210), 3700) }),
        ],
      }),
    ).join(" ");
    expect(out).toContain("not pixel fill rate");
  });

  it("names unreachable hosts", () => {
    const out = summarize(
      baseReport({ reach: [{ host: "cdn.arcgis.com", ok: false, ms: 8000, detail: "no response" }] }),
    ).join(" ");
    expect(out).toContain("cdn.arcgis.com");
  });

  it("separates a slow LOAD from slow rendering", () => {
    const out = summarize(
      baseReport({
        runs: [run({ key: "usgs", label: "USGS", loadMs: 9200, stats: frameStats(new Array(60).fill(16), 1000) })],
      }),
    ).join(" ");
    expect(out).toContain("9.2s just to load");
  });

  it("says when a run never loaded, so its fps is not mistaken for a render result", () => {
    const out = summarize(
      baseReport({
        runs: [
          run({ key: "usgs", label: "USGS", loadMs: 15000, loadTimedOut: true, stats: frameStats([16, 16], 40) }),
        ],
      }),
    ).join(" ");
    expect(out).toContain("never finished loading");
  });

  it("does not nag about a normal load time", () => {
    const out = summarize(
      baseReport({ runs: [run({ key: "usgs", label: "USGS", loadMs: 400, stats: frameStats(new Array(60).fill(16), 1000) })] }),
    ).join(" ");
    expect(out).not.toContain("just to load");
  });

  it("says nothing is wrong when nothing is wrong", () => {
    expect(summarize(baseReport())).toEqual(["No blocking problem detected in this run."]);
  });
});

const ctx = (over: Partial<ContextProbe> & Pick<ContextProbe, "label" | "contextType">): ContextProbe => ({
  powerPreference: "high-performance",
  failIfMajorPerformanceCaveat: false,
  ok: true,
  renderer: "ANGLE (Intel, Intel(R) UHD Graphics Direct3D11)",
  renderClass: "hardware",
  ...over,
});

const SW = { renderer: "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device))", renderClass: "software" as const };

describe("summarizeContextMatrix", () => {
  it("names WebGL1 as the escape hatch when only it gets hardware", () => {
    const out = summarizeContextMatrix([
      ctx({ label: "webgl2 / high-performance", contextType: "webgl2", ...SW }),
      ctx({ label: "webgl / high-performance", contextType: "webgl" }),
    ]).join(" ");
    expect(out).toContain("A hardware context IS available with webgl");
    expect(out).toContain('Forcing contextType "webgl" should fix this machine');
  });

  it("says the app cannot help when every configuration is software", () => {
    const out = summarizeContextMatrix([
      ctx({ label: "webgl2 / high-performance", contextType: "webgl2", ...SW }),
      ctx({ label: "webgl / high-performance", contextType: "webgl", ...SW }),
    ]).join(" ");
    expect(out).toContain("no in-app setting can recover the GPU here");
    expect(out).toContain("not an app problem");
  });

  it("stays quiet-ish when everything is already hardware", () => {
    const out = summarizeContextMatrix([
      ctx({ label: "webgl2 / high-performance", contextType: "webgl2" }),
      ctx({ label: "webgl / high-performance", contextType: "webgl" }),
    ]);
    expect(out).toEqual(["Every WebGL configuration returned a hardware renderer."]);
  });

  it("does not recommend WebGL1 when WebGL2 also works, just a slower power preference", () => {
    const out = summarizeContextMatrix([
      ctx({ label: "webgl2 / high-performance", contextType: "webgl2", ...SW }),
      ctx({ label: "webgl2 / low-power", contextType: "webgl2" }),
    ]).join(" ");
    expect(out).toContain("A hardware context IS available with webgl2");
    expect(out).not.toContain("Forcing contextType");
  });

  it("returns nothing for an empty matrix", () => {
    expect(summarizeContextMatrix([])).toEqual([]);
  });
});

describe("formatReport", () => {
  it("renders every section, and a failed run as its error not a blank row", () => {
    const md = formatReport(
      baseReport({
        runs: [
          run({ key: "usgs", label: "USGS raster basemap", layerCount: 2, stats: frameStats([16, 16, 17], 50) }),
          run({ key: "esri", label: "Esri vector basemap", loadMs: null, error: "style unavailable: blocked" }),
        ],
        hosts: [host({}), host({ host: "tiles.example", opaque: true, protocols: [], encodedKB: 0, decodedKB: 0 })],
        reach: [{ host: "api.water.usgs.gov", ok: false, ms: 8000, detail: "no response within 8000 ms" }],
      }),
    );
    for (const heading of ["# RESST diagnostics", "## Verdict", "## Environment", "## GPU", "## WebGL context matrix", "## Render benchmark", "## Network", "## Host reachability"]) {
      expect(md).toContain(heading);
    }
    expect(md).toContain("| Run | Layers | Load ms |");
    expect(md).toContain("style unavailable: blocked");
    expect(md).toContain("(opaque)");
    expect(md).toContain("no response within 8000 ms");
  });

  it("reports withheld values honestly instead of inventing them", () => {
    const md = formatReport(baseReport({ hardwareConcurrency: null, deviceMemory: null, renderer: "masked" }));
    expect(md).toContain("- CPU threads: unavailable");
    expect(md).toContain("- Device memory: unavailable");
    expect(md).toContain("- Renderer: masked");
  });
});

// The opt-in Leaflet trial. Its verdict is the user's Smooth/Choppy answer:
// under remote browser isolation the rAF numbers describe the cloud browser,
// not the screen in front of the user.
const trialRun = (over: Partial<DomTrialRun> = {}): DomTrialRun => ({
  renderer: "svg",
  gestures: 5,
  raf: frameStats([16, 17, 16, 18, 16], 83),
  settle: { samples: 5, medianMs: 12, maxMs: 40 },
  observation: "not-judged",
  ...over,
});
const trial = (over: Partial<DomTrial> = {}): DomTrial => ({
  loadMs: 412,
  loadTimedOut: false,
  markers: 963,
  labelCap: 150,
  runs: [trialRun()],
  ...over,
});

describe("settleStats", () => {
  it("returns null with no samples", () => {
    expect(settleStats([])).toBeNull();
  });

  it("reports median and max, ignoring non-finite samples", () => {
    expect(settleStats([40, 10, 12, NaN, 11])).toEqual({ samples: 4, medianMs: 12, maxMs: 40 });
  });
});

describe("judgeDomTrial", () => {
  it("says so when the trial was never started", () => {
    expect(judgeDomTrial(null)).toBe("DOM map trial: not run.");
  });

  it("reports a failed trial as a finding", () => {
    const out = judgeDomTrial(trial({ runs: [], error: "sites.json: HTTP 404" }));
    expect(out).toMatch(/^DOM map trial: FAILED/);
    expect(out).toContain("HTTP 404");
  });

  it("withholds a verdict until the user answers, naming the gesture count", () => {
    const out = judgeDomTrial(trial({ runs: [trialRun({ gestures: 2 })] }));
    expect(out).toMatch(/^DOM map trial: not judged/);
    expect(out).toContain("2 gestures");
    expect(out).toContain(`needs ${DOM_TRIAL_MIN_GESTURES}`);
  });

  it("is GO on a Smooth answer even when the measured frame rate is terrible", () => {
    const out = judgeDomTrial(
      trial({ runs: [trialRun({ observation: "smooth", raf: frameStats([216, 215, 217], 648) })] }),
    );
    expect(out).toMatch(/^DOM map trial: GO/);
    expect(out).toContain("SVG markers felt smooth");
  });

  it("is NO-GO on a Choppy answer even at 60 fps", () => {
    expect(judgeDomTrial(trial({ runs: [trialRun({ observation: "choppy" })] }))).toMatch(/^DOM map trial: NO-GO/);
  });

  it("follows the SVG run when both were judged and describes both", () => {
    const out = judgeDomTrial(
      trial({ runs: [trialRun({ observation: "choppy" }), trialRun({ renderer: "canvas", observation: "smooth" })] }),
    );
    expect(out).toMatch(/^DOM map trial: NO-GO/);
    expect(out).toContain("SVG markers felt choppy");
    expect(out).toContain("canvas markers felt smooth");
  });

  it("follows the canvas run when only that one was judged", () => {
    const out = judgeDomTrial(
      trial({ runs: [trialRun({ gestures: 1 }), trialRun({ renderer: "canvas", observation: "smooth" })] }),
    );
    expect(out).toMatch(/^DOM map trial: GO/);
    expect(out).toContain("canvas markers felt smooth");
  });

  it("prints missing measurements honestly", () => {
    const out = judgeDomTrial(trial({ runs: [trialRun({ observation: "smooth", raf: null, settle: null })] }));
    expect(out).toContain("no frames measured");
    expect(out).toContain("no settle measured");
  });
});

describe("summarize with a DOM map trial", () => {
  it("stays silent about a trial that was not run or not judged", () => {
    expect(summarize(baseReport({ domTrial: null }))).toEqual(["No blocking problem detected in this run."]);
    expect(summarize(baseReport({ domTrial: trial() }))).toEqual(["No blocking problem detected in this run."]);
  });

  it("appends the trial verdict after the automatic run's own verdict", () => {
    const out = summarize(baseReport({ domTrial: trial({ runs: [trialRun({ observation: "smooth" })] }) }));
    expect(out[0]).toBe("No blocking problem detected in this run.");
    expect(out[1]).toMatch(/^DOM map trial: GO/);
  });

  it("surfaces a failed trial", () => {
    const out = summarize(baseReport({ domTrial: trial({ runs: [], error: "chunk failed" }) }));
    expect(out.at(-1)).toMatch(/^DOM map trial: FAILED/);
  });
});

describe("formatReport DOM map trial section", () => {
  it("always has the section, explaining how to opt in when it was not run", () => {
    const md = formatReport(baseReport());
    expect(md).toContain("## DOM map trial");
    expect(md).toContain("Not run");
  });

  it("tabulates one row per renderer with the judgment", () => {
    const md = formatReport(
      baseReport({
        domTrial: trial({
          runs: [
            trialRun({ observation: "smooth" }),
            trialRun({ renderer: "canvas", gestures: 0, raf: null, settle: null }),
          ],
        }),
      }),
    );
    expect(md).toContain("- DOM map trial: GO");
    expect(md).toContain("- Tiles first load: 412 ms");
    expect(md).toContain("- Markers: 963 circle markers");
    expect(md).toContain("| SVG | 5 | 5 |");
    expect(md).toContain("| 12 | 40 | smooth |");
    expect(md).toContain("| canvas | 0 | no frames measured |");
    expect(md).toContain("| n/a | n/a | not judged |");
  });

  it("marks a timed-out tile load", () => {
    const md = formatReport(baseReport({ domTrial: trial({ loadMs: 15000, loadTimedOut: true }) }));
    expect(md).toContain("- Tiles first load: 15000 ms (timed out)");
  });
});
