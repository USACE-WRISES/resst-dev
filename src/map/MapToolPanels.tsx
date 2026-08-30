// The map's Layers / Legend controls — popover panels on the map toolbar,
// porting the Map Layers and Legend widgets. (The Bookmark Views widget was
// retired — every overlay it could set is a Layers checkbox, and all its
// views shared the app's start extent. PARITY.md difference 15.)

import { useRef, useState, type ReactNode } from "react";
import { OVERLAYS } from "./overlays";
import { actions, type AppState } from "../state/store";
import { mapCommands } from "./mapBus";
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

export function MapToolPanels({ state, zoom }: { state: AppState; zoom: number }) {
  const visibleOverlays = OVERLAYS.filter((d) => state.overlays[d.key]);

  return (
    <>
      <ToolPopover label="Layers" ariaLabel="Reference layers">
        <div className="layers-list">
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
            <span>Sites</span>
          </div>
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
