// Pure helpers behind the ?diag=1 diagnostics page. Everything here is
// DOM-free and injectable so vitest (environment: "node") can exercise it:
// the page collects raw numbers from the browser, these functions turn them
// into the comparable report a user pastes back from a locked-down machine.

/** One measured interaction run. `deltas` are per-frame gaps in ms. */
export interface FrameStats {
  frames: number;
  wallMs: number;
  fps: number;
  medianMs: number;
  p90Ms: number;
  p99Ms: number;
  worstMs: number;
  over50: number;
  over100: number;
}

/** Percentile over an ASCENDING array. p is 0..1. */
export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * p)));
  return sorted[i];
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Frame statistics for one benchmark leg. Returns null when nothing rendered —
 * a headless or backgrounded tab suspends rAF, so "no frames" is a real
 * outcome the page must report rather than a divide-by-zero.
 */
export function frameStats(deltas: readonly number[], wallMs: number): FrameStats | null {
  const t = deltas.filter((d) => Number.isFinite(d) && d > 0).sort((a, b) => a - b);
  if (t.length === 0 || wallMs <= 0) return null;
  return {
    frames: t.length,
    wallMs: Math.round(wallMs),
    fps: round1(t.length / (wallMs / 1000)),
    medianMs: round1(percentile(t, 0.5)),
    p90Ms: round1(percentile(t, 0.9)),
    p99Ms: round1(percentile(t, 0.99)),
    worstMs: round1(t[t.length - 1]),
    over50: t.filter((d) => d > 50).length,
    over100: t.filter((d) => d > 100).length,
  };
}

export type RenderClass = "hardware" | "software" | "unknown";

// Chrome names its CPU fallbacks in the unmasked renderer string, and ANGLE
// wraps them: "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device ...))". Match
// on substrings, never equality.
const SOFTWARE_MARKERS = ["swiftshader", "llvmpipe", "softpipe", "basic render", "software"];

/** Classify a WEBGL_debug_renderer_info string. Null or empty means masked. */
export function classifyRenderer(renderer: string | null | undefined): RenderClass {
  if (!renderer) return "unknown";
  const s = renderer.toLowerCase();
  if (SOFTWARE_MARKERS.some((m) => s.includes(m))) return "software";
  return "hardware";
}

/** The subset of PerformanceResourceTiming this report reads. */
export interface TimingLike {
  name: string;
  duration: number;
  nextHopProtocol?: string;
  encodedBodySize?: number;
  decodedBodySize?: number;
  transferSize?: number;
}

export interface HostTiming {
  host: string;
  count: number;
  medianMs: number;
  p95Ms: number;
  maxMs: number;
  protocols: string[];
  encodedKB: number;
  decodedKB: number;
  /** No Timing-Allow-Origin: sizes and protocol are zeroed, only duration is real. */
  opaque: boolean;
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

/**
 * Group resource timings by host. Cross-origin responses without
 * Timing-Allow-Origin zero out sizes and protocol — verified against the live
 * tile hosts — so those hosts are flagged `opaque` and only their durations
 * are trustworthy.
 */
export function summarizeTimings(entries: readonly TimingLike[]): HostTiming[] {
  const byHost = new Map<string, TimingLike[]>();
  for (const e of entries) {
    const h = hostOf(e.name);
    if (!h) continue;
    const list = byHost.get(h);
    if (list) list.push(e);
    else byHost.set(h, [e]);
  }
  const out: HostTiming[] = [];
  for (const [host, list] of byHost) {
    const durations = list.map((e) => e.duration).sort((a, b) => a - b);
    const protocols = [...new Set(list.map((e) => e.nextHopProtocol).filter((p): p is string => !!p))];
    const encoded = list.reduce((s, e) => s + (e.encodedBodySize ?? 0), 0);
    const decoded = list.reduce((s, e) => s + (e.decodedBodySize ?? 0), 0);
    out.push({
      host,
      count: list.length,
      medianMs: Math.round(percentile(durations, 0.5)),
      p95Ms: Math.round(percentile(durations, 0.95)),
      maxMs: Math.round(durations[durations.length - 1] ?? 0),
      protocols,
      encodedKB: Math.round(encoded / 1024),
      decodedKB: Math.round(decoded / 1024),
      opaque: protocols.length === 0 && encoded === 0,
    });
  }
  return out.sort((a, b) => b.count - a.count);
}

export interface ProxySignals {
  protocolDowngrade: boolean;
  compressionStripped: boolean;
  notes: string[];
}

/** A local dev server is plain http/1.1 with no gzip by design — reading TLS
    interception into that would be a guaranteed false positive. */
function isLocalOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    return u.protocol !== "https:" || u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "[::1]";
  } catch {
    return false;
  }
}

/**
 * Read TLS-inspection fingerprints off the SAME-ORIGIN host only — it is the
 * one host whose timings are not opaque. GitHub Pages serves h2 with gzip, so
 * http/1.1 means something terminated and re-originated the connection, and
 * encoded close to decoded means it stripped Content-Encoding in transit.
 * Only meaningful against the deployed https origin.
 */
export function detectProxySignals(sameOrigin: HostTiming | undefined, origin = ""): ProxySignals {
  const notes: string[] = [];
  if (!sameOrigin || sameOrigin.count === 0) {
    return {
      protocolDowngrade: false,
      compressionStripped: false,
      notes: ["No same-origin timings captured."],
    };
  }
  if (origin && isLocalOrigin(origin)) {
    return {
      protocolDowngrade: false,
      compressionStripped: false,
      notes: [`Skipped: ${origin} is not the deployed https origin, so its protocol and compression say nothing about a proxy.`],
    };
  }
  const protocolDowngrade =
    sameOrigin.protocols.length > 0 && !sameOrigin.protocols.some((p) => p.startsWith("h2") || p === "h3");
  if (protocolDowngrade) {
    notes.push(`Served over ${sameOrigin.protocols.join(", ")} instead of h2 — a proxy is terminating TLS.`);
  }
  // Only meaningful with enough bytes to compress; tiny payloads legitimately
  // come back near 1:1.
  const compressionStripped = sameOrigin.decodedKB > 100 && sameOrigin.encodedKB >= sameOrigin.decodedKB * 0.9;
  if (compressionStripped) {
    notes.push(
      `${sameOrigin.encodedKB} KB transferred for ${sameOrigin.decodedKB} KB of content — compression is being stripped.`,
    );
  }
  if (!protocolDowngrade && !compressionStripped) {
    notes.push("No proxy interference detected on the same-origin host.");
  }
  return { protocolDowngrade, compressionStripped, notes };
}

/** One WebGL context configuration and the renderer it actually produced. */
export interface ContextProbe {
  label: string;
  /** Matches MapLibre's canvasContextAttributes.contextType. */
  contextType: "webgl2" | "webgl";
  powerPreference: string;
  failIfMajorPerformanceCaveat: boolean;
  ok: boolean;
  renderer: string;
  renderClass: RenderClass;
}

/**
 * Find a configuration that escapes software rendering. Chrome can hand a
 * SwiftShader context for one WebGL version while the compositor stays on the
 * GPU — chrome://gpu reports the compositor, not this. If some row comes back
 * hardware, MapLibre can be pinned to it via canvasContextAttributes.
 */
export function summarizeContextMatrix(probes: readonly ContextProbe[]): string[] {
  const out: string[] = [];
  if (probes.length === 0) return out;
  const hw = probes.filter((p) => p.ok && p.renderClass === "hardware");
  if (hw.length === 0) {
    out.push(
      "Every WebGL configuration tried returned a software renderer, so no in-app setting can recover the GPU here — " +
        "this is a browser or driver problem, not an app problem.",
    );
    return out;
  }
  if (hw.length === probes.filter((p) => p.ok).length) {
    out.push("Every WebGL configuration returned a hardware renderer.");
    return out;
  }
  const best = hw[0];
  out.push(
    `A hardware context IS available with ${best.contextType} / powerPreference "${best.powerPreference}" ` +
      `(${best.renderer}). The app can be pinned to it via canvasContextAttributes.`,
  );
  const versions = [...new Set(hw.map((p) => p.contextType))];
  if (versions.length === 1 && versions[0] === "webgl") {
    out.push("Only WebGL1 gets hardware — WebGL2 is falling back to software. Forcing contextType \"webgl\" should fix this machine.");
  }
  return out;
}

export interface ReachResult {
  host: string;
  ok: boolean;
  ms: number;
  detail: string;
}

export interface BenchRun {
  key: string;
  label: string;
  layerCount: number | null;
  stats: FrameStats | null;
  /** How long the style took to become usable. A proxy inflates this, and it
      separates "slow to arrive" from "slow to draw" — different fixes. */
  loadMs: number | null;
  loadTimedOut: boolean;
  error?: string;
}

export interface DiagReport {
  generatedAt: string;
  url: string;
  userAgent: string;
  devicePixelRatio: number;
  screen: string;
  hardwareConcurrency: number | null;
  deviceMemory: number | null;
  reducedMotion: boolean;
  webglVersion: number | null;
  vendor: string;
  renderer: string;
  renderClass: RenderClass;
  /** Whether a failIfMajorPerformanceCaveat context was granted. NOT a software
      detector: observed granted on a machine running SwiftShader (Chrome 152,
      2026-08-31). Recorded for completeness; the renderer string decides. */
  strictContextOk: boolean;
  maxTextureSize: number | null;
  contexts: ContextProbe[];
  runs: BenchRun[];
  hosts: HostTiming[];
  proxy: ProxySignals;
  reach: ReachResult[];
}

/** Verdict lines derived from the numbers, so a pasted report interprets itself. */
export function summarize(r: DiagReport): string[] {
  const out: string[] = [];
  const software = r.renderClass === "software";
  if (software) {
    out.push(
      "CRITICAL: WebGL is running on a software rasterizer (CPU), not the GPU. " +
        "This alone explains slow panning and zooming, and no basemap or layer change will fix it.",
    );
    out.push(
      "First try a FULL Chrome restart (close every window, end leftover chrome.exe processes, reopen) — " +
        "a background update can drop GPU access until a real relaunch. Then re-check chrome://gpu and chrome://policy.",
    );
  }
  out.push(...summarizeContextMatrix(r.contexts ?? []));
  const byKey = new Map(r.runs.map((x) => [x.key, x]));
  const usgs = byKey.get("usgs")?.stats;
  const esri = byKey.get("esri")?.stats;
  if (usgs && esri && usgs.medianMs > 0) {
    const ratio = esri.medianMs / usgs.medianMs;
    if (ratio >= 1.5) {
      out.push(
        `Basemap cost: raster ${usgs.fps} fps vs vector ${esri.fps} fps ` +
          `(vector frames are ${round1(ratio)}x slower). Switching to the USGS Topo basemap should measurably help.`,
      );
    } else {
      out.push(
        `Basemap cost: raster ${usgs.fps} fps vs vector ${esri.fps} fps — the two cost the same here, ` +
          "so switching basemaps is not the fix on this machine.",
      );
    }
  }
  // Fill rate is the dominant cost under software rasterization, so a smaller
  // drawing buffer is the one lever that still pays. Quantify it rather than
  // assuming it.
  const half = byKey.get("esri-half")?.stats;
  if (esri && half && esri.medianMs > 0) {
    const gain = esri.medianMs / half.medianMs;
    if (gain >= 1.3) {
      out.push(
        `Half-resolution rendering is ${round1(gain)}x faster (${esri.fps} → ${half.fps} fps). ` +
          "A reduced-resolution Performance Mode would help here.",
      );
    } else {
      out.push(
        `Half-resolution rendering changes little (${esri.fps} → ${half.fps} fps), ` +
          "so the bottleneck is not pixel fill rate.",
      );
    }
  }
  for (const run of r.runs) {
    if (run.stats && run.stats.fps < 30) out.push(`"${run.label}" ran below 30 fps (${run.stats.fps}).`);
    if (run.loadTimedOut) {
      out.push(`"${run.label}" never finished loading — its frame numbers measure a still-loading map.`);
    } else if (run.loadMs != null && run.loadMs > 4000) {
      out.push(`"${run.label}" took ${(run.loadMs / 1000).toFixed(1)}s just to load — check the network table.`);
    }
  }
  if (r.proxy.protocolDowngrade || r.proxy.compressionStripped) out.push(...r.proxy.notes);
  const blocked = r.reach.filter((x) => !x.ok).map((x) => x.host);
  if (blocked.length) out.push(`Unreachable hosts: ${blocked.join(", ")}.`);
  if (out.length === 0) out.push("No blocking problem detected in this run.");
  return out;
}

/** Markdown the user copies out of the page and pastes back. */
export function formatReport(r: DiagReport): string {
  const L: string[] = [];
  L.push("# RESST diagnostics", "");
  L.push(`- Generated: ${r.generatedAt}`);
  L.push(`- URL: ${r.url}`);
  L.push(`- User agent: ${r.userAgent}`);
  L.push("");
  L.push("## Verdict", "");
  for (const s of summarize(r)) L.push(`- ${s}`);
  L.push("");
  L.push("## Environment", "");
  L.push(`- devicePixelRatio: ${r.devicePixelRatio}`);
  L.push(`- Screen: ${r.screen}`);
  L.push(`- CPU threads: ${r.hardwareConcurrency ?? "unavailable"}`);
  L.push(`- Device memory: ${r.deviceMemory != null ? `${r.deviceMemory} GB` : "unavailable"}`);
  L.push(`- prefers-reduced-motion: ${r.reducedMotion}`);
  L.push("");
  L.push("## GPU", "");
  L.push(`- WebGL version: ${r.webglVersion ?? "unavailable"}`);
  L.push(`- Vendor: ${r.vendor}`);
  L.push(`- Renderer: ${r.renderer}`);
  L.push(`- Classified as: ${r.renderClass}`);
  L.push(`- No-caveat context: ${r.strictContextOk ? "granted" : "refused"} (advisory only — Chrome grants this on SwiftShader too)`);
  L.push(`- MAX_TEXTURE_SIZE: ${r.maxTextureSize ?? "unavailable"}`);
  L.push("");
  L.push("## WebGL context matrix", "");
  L.push("| Configuration | Result | Class | Renderer |");
  L.push("|---|---|---|---|");
  for (const c of r.contexts ?? []) {
    L.push(`| ${c.label} | ${c.ok ? "created" : "refused"} | ${c.renderClass} | ${c.renderer} |`);
  }
  L.push("");
  L.push("## Render benchmark", "");
  L.push("| Run | Layers | Load ms | Frames | FPS | Median | p90 | p99 | Worst | >50ms | >100ms |");
  L.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const run of r.runs) {
    const load = run.loadMs == null ? "n/a" : run.loadTimedOut ? `${run.loadMs} (timed out)` : String(run.loadMs);
    if (!run.stats) {
      L.push(`| ${run.label} | ${run.layerCount ?? "n/a"} | ${load} | ${run.error ?? "no frames rendered"} | | | | | | | |`);
      continue;
    }
    const s = run.stats;
    L.push(
      `| ${run.label} | ${run.layerCount ?? "n/a"} | ${load} | ${s.frames} | ${s.fps} | ${s.medianMs} | ${s.p90Ms} | ` +
        `${s.p99Ms} | ${s.worstMs} | ${s.over50} | ${s.over100} |`,
    );
  }
  L.push("");
  L.push("## Network", "");
  L.push("| Host | Requests | Median ms | p95 ms | Max ms | Protocol | Encoded KB | Decoded KB |");
  L.push("|---|---:|---:|---:|---:|---|---:|---:|");
  for (const h of r.hosts) {
    const proto = h.opaque ? "(opaque)" : h.protocols.join(",") || "n/a";
    const enc = h.opaque ? "n/a" : String(h.encodedKB);
    const dec = h.opaque ? "n/a" : String(h.decodedKB);
    L.push(`| ${h.host} | ${h.count} | ${h.medianMs} | ${h.p95Ms} | ${h.maxMs} | ${proto} | ${enc} | ${dec} |`);
  }
  L.push("");
  for (const n of r.proxy.notes) L.push(`- ${n}`);
  L.push("");
  L.push("## Host reachability", "");
  L.push("| Host | Result | ms |");
  L.push("|---|---|---:|");
  for (const x of r.reach) L.push(`| ${x.host} | ${x.ok ? "ok" : `FAILED — ${x.detail}`} | ${x.ms} |`);
  L.push("");
  return L.join("\n");
}
