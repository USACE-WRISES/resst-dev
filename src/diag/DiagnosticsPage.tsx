// The ?diag=1 page. It mounts INSTEAD of App (see main.tsx) so the numbers it
// reports are not contaminated by the app's own layers and so it still works
// when the map wedges. Its job is to turn "the map feels laggy" into figures a
// user can compare between two machines — including a machine where DevTools
// is disabled by policy and the address bar is the only way in.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  collectEnvironment,
  collectTimings,
  probeReach,
  probeWebgl,
  runAllBenchmarks,
} from "./collect";
import {
  classifyRenderer,
  detectProxySignals,
  formatReport,
  summarize,
  summarizeTimings,
  type BenchRun,
  type DiagReport,
} from "./probes";

const STYLES = `
.diag { font: 14px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; color: #16242c;
  background: #f4f7f8; margin: 0; padding: 24px; min-height: 100vh; box-sizing: border-box; }
.diag h1 { font-size: 20px; margin: 0 0 4px; }
.diag h2 { font-size: 15px; margin: 24px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #ccd7dc; }
.diag .sub { color: #52646d; margin: 0 0 16px; }
.diag .card { background: #fff; border: 1px solid #ccd7dc; border-radius: 6px; padding: 16px; max-width: 1100px; }
.diag table { border-collapse: collapse; width: 100%; font-size: 13px; }
.diag th, .diag td { text-align: left; padding: 6px 10px; border-bottom: 1px solid #e4ebee; }
.diag th { background: #eef3f5; font-weight: 600; }
.diag td.num, .diag th.num { text-align: right; font-variant-numeric: tabular-nums; }
.diag dl { display: grid; grid-template-columns: max-content 1fr; gap: 4px 16px; margin: 0; }
.diag dt { color: #52646d; }
.diag dd { margin: 0; word-break: break-word; }
.diag .verdict li { margin-bottom: 4px; }
.diag .bad { color: #a3231a; font-weight: 600; }
.diag .ok { color: #1c6b3f; }
.diag button { font: inherit; padding: 8px 14px; border-radius: 4px; border: 1px solid #00707b;
  background: #00707b; color: #fff; cursor: pointer; }
.diag button:disabled { opacity: .55; cursor: default; }
.diag button.secondary { background: #fff; color: #00707b; }
.diag .bench { width: 800px; max-width: 100%; height: 500px; border: 1px solid #ccd7dc;
  border-radius: 6px; overflow: hidden; background: #e8ede9; }
.diag pre { background: #16242c; color: #e6eef1; padding: 12px; border-radius: 6px;
  overflow: auto; max-height: 340px; font-size: 12px; user-select: all; }
.diag .status { margin: 12px 0; color: #52646d; }
`;

type Phase = "idle" | "running" | "done";

export default function DiagnosticsPage() {
  const benchRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState("");
  const [report, setReport] = useState<DiagReport | null>(null);
  const [copied, setCopied] = useState(false);

  const run = useCallback(async () => {
    const container = benchRef.current;
    if (!container) return;
    setPhase("running");
    setReport(null);
    setCopied(false);

    setStatus("Reading GPU and environment…");
    const env = collectEnvironment();
    const gl = probeWebgl();

    let runs: BenchRun[] = [];
    try {
      runs = await runAllBenchmarks(container, (label) => setStatus(`Benchmarking: ${label}…`));
    } catch (err) {
      setStatus(`Benchmark failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    setStatus("Probing network dependencies…");
    const reach = await probeReach();

    const hosts = summarizeTimings(collectTimings());
    const proxy = detectProxySignals(
      hosts.find((h) => h.host === location.host),
      location.origin,
    );

    setReport({
      generatedAt: new Date().toISOString(),
      url: location.href,
      ...env,
      ...gl,
      renderClass: classifyRenderer(gl.renderer),
      runs,
      hosts,
      proxy,
      reach,
    });
    setStatus("");
    setPhase("done");
  }, []);

  useEffect(() => {
    // StrictMode double-invokes effects in dev; the benchmark must not run twice.
    if (startedRef.current) return;
    startedRef.current = true;
    void run();
  }, [run]);

  const markdown = report ? formatReport(report) : "";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
    } catch {
      // Clipboard access is often restricted on managed machines. The <pre>
      // below is select-all-able, so say so rather than failing silently.
      setCopied(false);
      setStatus("Clipboard blocked — select the report text below and copy manually.");
    }
  };

  return (
    <div className="diag">
      <style>{STYLES}</style>
      <h1>RESST performance diagnostics</h1>
      <p className="sub">
        Runs a fixed map benchmark and network probe on this machine. Run it on each computer you want to
        compare, then copy the report at the bottom.
      </p>

      <div className="card">
        <div ref={benchRef} className="bench" data-testid="diag-bench" />
        <p className="status" data-testid="diag-status">
          {phase === "running" ? status || "Working…" : phase === "done" ? "Finished." : "Starting…"}
        </p>
        <button onClick={() => void run()} disabled={phase === "running"} data-testid="diag-rerun">
          {phase === "running" ? "Running…" : "Run again"}
        </button>{" "}
        <a href={import.meta.env.BASE_URL}>Back to the app</a>
      </div>

      {report && (
        <>
          <h2>Verdict</h2>
          <div className="card">
            <ul className="verdict" data-testid="diag-verdict">
              {summarize(report).map((s) => (
                <li key={s} className={/CRITICAL|WARNING|FAILED|Unreachable|stripped|proxy/i.test(s) ? "bad" : undefined}>
                  {s}
                </li>
              ))}
            </ul>
          </div>

          <h2>Render benchmark</h2>
          <div className="card">
            <table data-testid="diag-bench-table">
              <thead>
                <tr>
                  <th>Run</th>
                  <th className="num">Layers</th>
                  <th className="num">Load ms</th>
                  <th className="num">Frames</th>
                  <th className="num">FPS</th>
                  <th className="num">Median ms</th>
                  <th className="num">p90</th>
                  <th className="num">p99</th>
                  <th className="num">Worst</th>
                  <th className="num">&gt;50ms</th>
                </tr>
              </thead>
              <tbody>
                {report.runs.map((r) => (
                  <tr key={r.key}>
                    <td>{r.label}</td>
                    <td className="num">{r.layerCount ?? "n/a"}</td>
                    <td className={r.loadTimedOut ? "num bad" : "num"}>
                      {r.loadMs == null ? "n/a" : r.loadTimedOut ? `${r.loadMs}+` : r.loadMs}
                    </td>
                    {r.stats ? (
                      <>
                        <td className="num">{r.stats.frames}</td>
                        <td className="num">{r.stats.fps}</td>
                        <td className="num">{r.stats.medianMs}</td>
                        <td className="num">{r.stats.p90Ms}</td>
                        <td className="num">{r.stats.p99Ms}</td>
                        <td className="num">{r.stats.worstMs}</td>
                        <td className="num">{r.stats.over50}</td>
                      </>
                    ) : (
                      <td colSpan={7}>{r.error ?? "no frames rendered"}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2>GPU and environment</h2>
          <div className="card">
            <dl>
              <dt>Renderer</dt>
              <dd className={report.renderClass === "software" ? "bad" : "ok"}>{report.renderer}</dd>
              <dt>Vendor</dt>
              <dd>{report.vendor}</dd>
              <dt>Classified as</dt>
              <dd className={report.renderClass === "software" ? "bad" : undefined}>{report.renderClass}</dd>
              <dt>No-caveat context</dt>
              <dd className={report.strictContextOk ? "ok" : "bad"}>{report.strictContextOk ? "granted" : "REFUSED"}</dd>
              <dt>WebGL version</dt>
              <dd>{report.webglVersion ?? "unavailable"}</dd>
              <dt>devicePixelRatio</dt>
              <dd>{report.devicePixelRatio}</dd>
              <dt>Display</dt>
              <dd>{report.screen}</dd>
              <dt>CPU threads</dt>
              <dd>{report.hardwareConcurrency ?? "unavailable"}</dd>
              <dt>Device memory</dt>
              <dd>{report.deviceMemory != null ? `${report.deviceMemory} GB` : "unavailable"}</dd>
              <dt>Reduced motion</dt>
              <dd>{String(report.reducedMotion)}</dd>
            </dl>
          </div>

          <h2>Network</h2>
          <div className="card">
            <table>
              <thead>
                <tr>
                  <th>Host</th>
                  <th className="num">Requests</th>
                  <th className="num">Median ms</th>
                  <th className="num">p95 ms</th>
                  <th>Protocol</th>
                  <th className="num">Encoded KB</th>
                  <th className="num">Decoded KB</th>
                </tr>
              </thead>
              <tbody>
                {report.hosts.map((h) => (
                  <tr key={h.host}>
                    <td>{h.host}</td>
                    <td className="num">{h.count}</td>
                    <td className="num">{h.medianMs}</td>
                    <td className="num">{h.p95Ms}</td>
                    <td>{h.opaque ? "(opaque)" : h.protocols.join(", ") || "n/a"}</td>
                    <td className="num">{h.opaque ? "n/a" : h.encodedKB}</td>
                    <td className="num">{h.opaque ? "n/a" : h.decodedKB}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul>
              {report.proxy.notes.map((n) => (
                <li key={n} className={report.proxy.protocolDowngrade || report.proxy.compressionStripped ? "bad" : undefined}>
                  {n}
                </li>
              ))}
            </ul>
          </div>

          <h2>Host reachability</h2>
          <div className="card">
            <table>
              <thead>
                <tr>
                  <th>Host</th>
                  <th>Result</th>
                  <th className="num">ms</th>
                </tr>
              </thead>
              <tbody>
                {report.reach.map((x) => (
                  <tr key={x.host}>
                    <td>{x.host}</td>
                    <td className={x.ok ? "ok" : "bad"}>{x.ok ? "reachable" : x.detail}</td>
                    <td className="num">{x.ms}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2>Report to copy</h2>
          <div className="card">
            <p>
              <button onClick={() => void copy()} data-testid="diag-copy">
                {copied ? "Copied" : "Copy report"}
              </button>
            </p>
            <pre data-testid="diag-markdown">{markdown}</pre>
          </div>
        </>
      )}
    </div>
  );
}
