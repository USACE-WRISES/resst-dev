// The map's Layers / Legend controls — popover panels on the map toolbar,
// porting the Map Layers and Legend widgets. (The Bookmark Views widget was
// retired — every overlay it could set is a Layers checkbox, and all its
// views shared the app's start extent. PARITY.md difference 15.)

import { useRef, useState, type ReactNode } from "react";
import { OVERLAYS } from "./overlays";
import { actions, type AppState, type NationalMetric } from "../state/store";
import { ensureCore, getCore } from "../sediment/data";
import { screenCore } from "../sediment/screen";
import { mapCommands } from "./mapBus";
import { NATIONAL_METRICS } from "./nationalLayer";
import { NET_DOWN, NET_MOUTH, NET_UP } from "./palette";
import { useDismissPopover } from "./useDismissPopover";

function ToolPopover({ label, children, ariaLabel }: { label: string; children: ReactNode; ariaLabel: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismissPopover(open, ref, () => setOpen(false));
  return (
    <div className="tool-popover" ref={ref}>
      <button type="button" className={open ? "map-tool active" : "map-tool"} aria-expanded={open} onClick={() => setOpen(!open)}>
        {label} ▾
      </button>
      {open && (
        <div className="tool-popover-panel" role="group" aria-label={ariaLabel}>
          {children}
        </div>
      )}
    </div>
  );
}

export function MapToolPanels({ state, zoom, siteByShortId }: { state: AppState; zoom: number; siteByShortId: Map<number, string> }) {
  const visibleOverlays = OVERLAYS.filter((d) => state.overlays[d.key]);
  // A checked "All modeled reservoirs" silently showing a fraction of them
  // would be confusing — say so whenever screening filters the layer.
  const core = getCore();
  const screenSummary =
    state.nationalLayer.on && state.screening.active && core
      ? screenCore(core, new Set(siteByShortId.keys()), state.screening)
      : null;

  return (
    <>
      <ToolPopover label="Layers" ariaLabel="Reference layers">
        <div className="layers-list">
          <div className="layer-row nat-row">
            <label className="value-option">
              <input
                type="checkbox"
                checked={state.nationalLayer.on}
                onChange={(e) => actions.setNationalLayer(e.target.checked)}
              />
              <span className="swatch nat-swatch" aria-hidden="true" />
              <span>All modeled reservoirs (57,307)</span>
            </label>
            {state.nationalLayer.on && (
              <span className="ov-status" role="status" data-status={state.sedimentStatus.core ?? "idle"}>
                {state.sedimentStatus.core === "loading"
                  ? "loading…"
                  : state.sedimentStatus.core === "error"
                    ? "failed"
                    : ""}
              </span>
            )}
            {state.nationalLayer.on && state.sedimentStatus.core === "error" && (
              <button
                type="button"
                className="ov-retry"
                aria-label="Retry loading the national reservoir dataset"
                onClick={() => void ensureCore().catch(() => {})}
              >
                Retry
              </button>
            )}
          </div>
          {state.nationalLayer.on && state.screening.active && (
            <p className="nat-screen-note" role="status">
              Screening is filtering this layer
              {screenSummary ? ` — ${screenSummary.matches.toLocaleString("en-US")} of ${screenSummary.total.toLocaleString("en-US")} shown` : ""}
              .{" "}
              <button type="button" className="linklike" onClick={() => actions.clearScreening()}>
                Clear
              </button>
            </p>
          )}
          {state.nationalLayer.on && (
            <label className="nat-metric">
              <span>Style by</span>
              <select
                className="metric-select"
                value={state.nationalLayer.metric}
                onChange={(e) => actions.setNationalMetric(e.target.value as NationalMetric)}
              >
                {(Object.keys(NATIONAL_METRICS) as NationalMetric[]).map((m) => (
                  <option key={m} value={m}>
                    {NATIONAL_METRICS[m].label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {OVERLAYS.map((d) => {
            const on = !!state.overlays[d.key];
            const status = state.overlayStatus[d.key];
            const gated = on && zoom < d.minZoom;
            return (
              <div key={d.key} className="layer-row">
                <label className="value-option">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(e) => actions.setOverlay(d.key, e.target.checked)}
                  />
                  <span className="swatch" style={{ background: d.color }} aria-hidden="true" />
                  <span>{d.label}</span>
                </label>
                {on && (
                  <span className="ov-status" role="status" data-status={gated ? "gated" : status ?? "idle"}>
                    {gated ? "zoom in to load" : status === "loading" ? "loading…" : status === "error" ? "failed" : ""}
                  </span>
                )}
                {on && !gated && status === "error" && (
                  <button
                    type="button"
                    className="ov-retry"
                    aria-label={`Retry loading ${d.label}`}
                    onClick={() => mapCommands()?.refreshOverlay(d.key)}
                  >
                    Retry
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </ToolPopover>

      <ToolPopover label="Legend" ariaLabel="Legend">
        <div className="legend-list">
          <div className="legend-row">
            <span className="legend-dot" style={{ background: "#ff0000", borderColor: "#ffff00" }} aria-hidden="true" />
            <span>RESST documented site</span>
          </div>
          {state.nationalLayer.on && (
            <div className="legend-ramp">
              <p className="legend-ramp-title">{NATIONAL_METRICS[state.nationalLayer.metric].label} (RATTES, modeled)</p>
              {NATIONAL_METRICS[state.nationalLayer.metric].legend.map((e) => (
                <div key={e.label} className="legend-row">
                  <span className="legend-dot" style={{ background: e.color, borderColor: "#fff" }} aria-hidden="true" />
                  <span>{e.label}</span>
                </div>
              ))}
            </div>
          )}
          {state.networkView.mode !== "none" && (
            <>
              {state.networkView.mode !== "down" && (
                <div className="legend-row">
                  <span className="legend-dot" style={{ background: NET_UP, borderColor: "#fff" }} aria-hidden="true" />
                  <span>Upstream dam</span>
                </div>
              )}
              {state.networkView.mode !== "up" && (
                <>
                  <div className="legend-row">
                    <span className="legend-dot" style={{ background: NET_DOWN, borderColor: "#fff" }} aria-hidden="true" />
                    <span>Downstream dam</span>
                  </div>
                  <div className="legend-row">
                    <span className="legend-line legend-dashed" style={{ color: NET_DOWN }} aria-hidden="true" />
                    <span>Downstream path (schematic, not the river course)</span>
                  </div>
                  <div className="legend-row">
                    <span className="legend-dot" style={{ background: NET_MOUTH, borderColor: "#fff" }} aria-hidden="true" />
                    <span>River mouth</span>
                  </div>
                </>
              )}
            </>
          )}
          {visibleOverlays.map((d) => (
            <div key={d.key} className="legend-row">
              <span
                className={d.kind === "points" ? "legend-dot" : "legend-line"}
                style={d.kind === "points" ? { background: d.color, borderColor: "#fff" } : { background: d.color }}
                aria-hidden="true"
              />
              <span>{d.label}</span>
            </div>
          ))}
          {visibleOverlays.length === 0 && state.networkView.mode === "none" && (
            <p className="muted">Only Sites are visible. Turn on reference layers under Layers.</p>
          )}
        </div>
      </ToolPopover>
    </>
  );
}
