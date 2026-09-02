// The opt-in Leaflet trial on the diagnostics page. Everything Leaflet lives in
// leafletTrial.ts behind a dynamic import, so this component (part of the diag
// chunk) costs nothing until the user presses Start.

import { useEffect, useRef, useState } from "react";
import { fetchSitePoints } from "./collect";
import type { LeafletTrialHandle } from "./leafletTrial";
import {
  DOM_TRIAL_LABEL_CAP,
  DOM_TRIAL_LABEL_ZOOM,
  DOM_TRIAL_MIN_GESTURES,
  judgeDomTrial,
  type DomTrial,
  type DomTrialObservation,
  type DomTrialRenderer,
} from "./probes";

type Phase = "idle" | "loading" | "running" | "failed";

const rendererName = (r: DomTrialRenderer) => (r === "svg" ? "SVG" : "Canvas");

export function DomTrialPanel({ onUpdate }: { onUpdate: (t: DomTrial) => void }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<LeafletTrialHandle | null>(null);
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;
  const [phase, setPhase] = useState<Phase>("idle");
  const [trial, setTrial] = useState<DomTrial | null>(null);
  const [renderer, setRenderer] = useState<DomTrialRenderer>("svg");

  // "Run again" unmounts the panel; the map must go with it.
  useEffect(() => () => handleRef.current?.stop(), []);

  const update = (t: DomTrial) => {
    setTrial(t);
    onUpdateRef.current(t);
  };

  const start = async () => {
    const el = mapRef.current;
    if (!el || handleRef.current) return;
    setPhase("loading");
    try {
      const [{ startLeafletTrial }, fc] = await Promise.all([import("./leafletTrial"), fetchSitePoints()]);
      if (!mapRef.current) return; // unmounted while loading
      handleRef.current = startLeafletTrial(el, fc, update);
      setRenderer("svg");
      setPhase("running");
    } catch (err) {
      // A chunk that fails to load, or a blocked sites.json, is itself a finding.
      const message = err instanceof Error ? err.message : String(err);
      update({ loadMs: null, loadTimedOut: false, markers: 0, labelCap: DOM_TRIAL_LABEL_CAP, runs: [], error: message });
      setPhase("failed");
    }
  };

  const pick = (kind: DomTrialRenderer) => {
    handleRef.current?.setRenderer(kind);
    setRenderer(kind);
  };
  const judge = (observation: Exclude<DomTrialObservation, "not-judged">) => handleRef.current?.judge(observation);

  const run = trial?.runs.find((r) => r.renderer === renderer);
  const canJudge = phase === "running" && !!run && run.gestures >= DOM_TRIAL_MIN_GESTURES;

  let stats: string;
  if (phase === "idle") stats = "Not started.";
  else if (phase === "loading") stats = "Loading Leaflet and the site list…";
  else if (phase === "failed") stats = `Failed: ${trial?.error ?? "unknown error"}`;
  else {
    const raf = run?.raf ? `${run.raf.fps} fps (median ${run.raf.medianMs} ms)` : "no frames measured";
    const settle = run?.settle ? `median ${run.settle.medianMs} ms, max ${run.settle.maxMs} ms` : "n/a";
    const tiles =
      trial?.loadMs == null ? "loading…" : trial.loadTimedOut ? `${trial.loadMs} ms (timed out)` : `${trial.loadMs} ms`;
    stats =
      `Renderer: ${rendererName(renderer)} · Gestures: ${run?.gestures ?? 0} · rAF: ${raf} · ` +
      `Settle: ${settle} · Tiles: ${tiles}`;
  }

  const verdict = trial ? judgeDomTrial(trial) : "";
  const verdictClass = /NO-GO|FAILED/.test(verdict) ? "bad" : /^DOM map trial: GO/.test(verdict) ? "ok" : undefined;

  return (
    <>
      <h2>DOM map trial</h2>
      <div className="card" data-testid="diag-domtrial-panel">
        <p className="sub">
          Drag and zoom this map for about 20 seconds. This is how RESST would look in a DOM (non-WebGL) mode:
          image tiles, SVG site markers, labels from zoom {DOM_TRIAL_LABEL_ZOOM}. Under remote browser isolation
          the fps figures come from the remote browser, so go by feel. Then try the same with canvas markers.
        </p>
        <p>
          <button
            onClick={() => void start()}
            disabled={phase === "loading" || phase === "running"}
            data-testid="diag-domtrial-start"
          >
            {phase === "loading" ? "Loading…" : phase === "running" ? "Running" : "Start DOM map trial"}
          </button>{" "}
          <button
            className="secondary"
            aria-pressed={renderer === "svg"}
            disabled={phase !== "running"}
            onClick={() => pick("svg")}
            data-testid="diag-domtrial-renderer-svg"
          >
            SVG markers
          </button>{" "}
          <button
            className="secondary"
            aria-pressed={renderer === "canvas"}
            disabled={phase !== "running"}
            onClick={() => pick("canvas")}
            data-testid="diag-domtrial-renderer-canvas"
          >
            Canvas markers
          </button>
        </p>
        <div ref={mapRef} className="trial-map" data-testid="diag-domtrial-map" />
        <p className="status" data-testid="diag-domtrial-stats">
          {stats}
        </p>
        <p>
          <button disabled={!canJudge} onClick={() => judge("smooth")} data-testid="diag-domtrial-smooth">
            Smooth
          </button>{" "}
          <button disabled={!canJudge} onClick={() => judge("choppy")} data-testid="diag-domtrial-choppy">
            Choppy
          </button>
          {phase === "running" && !canJudge && (
            <span className="status"> Make at least {DOM_TRIAL_MIN_GESTURES} drags or zooms first.</span>
          )}
        </p>
        {trial && (
          <p className={verdictClass} data-testid="diag-domtrial-result">
            {verdict}
          </p>
        )}
      </div>
    </>
  );
}
