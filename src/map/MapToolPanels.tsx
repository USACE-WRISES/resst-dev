// The map's Views / Layers / Legend controls — popover panels on the map
// toolbar, porting the Bookmark Views, Map Layers, and Legend widgets.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { MAP_VIEWS } from "../config/mapViews.generated";
import { OVERLAYS } from "./overlays";
import { actions, type AppState } from "../state/store";
import { mapCommands } from "./mapBus";

function ToolPopover({ label, children, ariaLabel }: { label: string; children: ReactNode; ariaLabel: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
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
      <ToolPopover label="Views" ariaLabel="Saved map views">
        <div className="views-grid">
          {MAP_VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              className="view-card"
              onClick={() => {
                actions.setOverlays({ ...v.overlays });
                mapCommands()?.fitBounds(v.bounds);
              }}
            >
              {v.thumb && <img src={`${import.meta.env.BASE_URL}${v.thumb}`} alt="" loading="lazy" />}
              <span>{v.name}</span>
            </button>
          ))}
        </div>
      </ToolPopover>

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
          {visibleOverlays.length === 0 && <p className="muted">Only Sites are visible. Turn on reference layers under Layers.</p>}
        </div>
      </ToolPopover>
    </>
  );
}
