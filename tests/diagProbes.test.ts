// The ?diag=1 report's arithmetic and heuristics. These run in vitest's node
// environment, which is exactly why probes.ts is kept DOM-free: the numbers
// come from the browser, the interpretation is testable here.
import { describe, expect, it } from "vitest";
import {
  classifyRenderer,
  detectProxySignals,
  formatReport,
  frameStats,
  percentile,
  summarize,
  summarizeTimings,
  type BenchRun,
  type DiagReport,
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
  runs: [],
  hosts: [],
  proxy: { protocolDowngrade: false, compressionStripped: false, notes: [] },
  reach: [],
  ...over,
});

describe("summarize", () => {
  it("leads with software rendering when that is what happened", () => {
    const out = summarize(baseReport({ renderClass: "software" }));
    expect(out[0]).toContain("CRITICAL");
  });

  it("warns when the browser refuses a no-caveat context even on a named GPU", () => {
    expect(summarize(baseReport({ strictContextOk: false })).join(" ")).toContain("WARNING");
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

  it("does not recommend a switch when the two basemaps cost the same", () => {
    const out = summarize(
      baseReport({
        runs: [
          run({ key: "usgs", label: "USGS", layerCount: 2, stats: frameStats(new Array(60).fill(16), 1000) }),
          run({ key: "esri", label: "Esri", layerCount: 421, stats: frameStats(new Array(58).fill(17), 1000) }),
        ],
      }),
    ).join(" ");
    expect(out).not.toContain("should measurably help");
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
    for (const heading of ["# RESST diagnostics", "## Verdict", "## Environment", "## GPU", "## Render benchmark", "## Network", "## Host reachability"]) {
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
