// Basemap picker — the ArcGIS basemap-gallery pattern: a button showing the
// active basemap, opening a panel that lists every basemap by name. Rendered
// into a maplibre control element (see BasemapControl) so it stacks under the
// zoom buttons. Selecting does not close the panel: a swap can take a second
// or fail, and the panel is where that feedback lives.

import { useEffect, useRef, useState } from "react";
import { actions, type AppState, type BasemapId } from "../state/store";
import { BASEMAPS, BASEMAP_ORDER } from "./basemaps";
import { useDismissPopover } from "./useDismissPopover";

function BasemapIcon() {
  // A 2x2 of map tiles. Sized 16px on purpose: at that size the 1.5 stroke in
  // a 24 viewBox is exactly one device pixel and every centerline lands on a
  // half-pixel, so the tiles stay crisp (18px and 24px do not).
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M2.25 2.25h7.5v7.5h-7.5zM14.25 2.25h7.5v7.5h-7.5zM2.25 14.25h7.5v7.5h-7.5zM14.25 14.25h7.5v7.5h-7.5z" />
      <path d="M3 6.75h6M15 6.75h6M3 17.25h6M15 17.25h6" />
    </svg>
  );
}

export function BasemapPicker({ basemap, status }: { basemap: BasemapId; status: AppState["basemapStatus"] }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const checkedRef = useRef<HTMLInputElement>(null);

  useDismissPopover(open, rootRef, (reason) => {
    setOpen(false);
    // Escape implies the keyboard, so hand focus back; an outside click has
    // already put focus where the user aimed it.
    if (reason === "escape") triggerRef.current?.focus();
  });

  // Opening moves focus into the group (a programmatic focus on a radio does
  // not check it, so this cannot change the basemap by itself).
  useEffect(() => {
    if (open) checkedRef.current?.focus();
  }, [open]);

  // applyBasemap's USGS branch is synchronous and never reports "loading", so
  // a loading status while USGS is active means an abandoned Esri swap.
  const busy = status === "loading" && basemap !== "usgs";
  // With a two-basemap registry a failure always reverts to the other one.
  // (A third basemap would need basemapStatus to carry the id.)
  const failed = BASEMAPS[basemap === "usgs" ? "esri" : "usgs"];
  const active = BASEMAPS[basemap];

  const choose = (id: BasemapId) => {
    if (id === basemap) {
      // Re-picking the active basemap only dismisses a stale error — it must
      // not clear a swap that is still in flight.
      if (status === "error") actions.setBasemapStatus(null);
      return;
    }
    actions.setBasemap(id);
  };

  const triggerLabel =
    status === "error" ? `Basemap: ${active.shortLabel} — ${failed.shortLabel} failed to load` : `Basemap: ${active.shortLabel}`;

  return (
    <div className="basemap-picker" ref={rootRef} data-status={busy ? "loading" : (status ?? "idle")}>
      <button
        type="button"
        ref={triggerRef}
        className="basemap-trigger"
        aria-expanded={open}
        aria-controls="basemap-panel"
        aria-label={triggerLabel}
        onClick={() => setOpen(!open)}
      >
        <span className="basemap-icon">
          <BasemapIcon />
        </span>
        <span className="basemap-name">{active.shortLabel}</span>
        <span className="basemap-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <div className="basemap-panel" id="basemap-panel">
          <p className="basemap-heading">Basemap</p>
          {/* Native radios: arrow-key navigation and "1 of 2" announcements
              come free, and the checked dot is the selected marker. */}
          <div className="basemap-list" role="radiogroup" aria-label="Basemap">
            {BASEMAP_ORDER.map((id) => (
              <label key={id} className={id === basemap ? "basemap-option active" : "basemap-option"}>
                <input
                  type="radio"
                  name="resst-basemap"
                  value={id}
                  checked={id === basemap}
                  ref={id === basemap ? checkedRef : undefined}
                  onChange={() => choose(id)}
                />
                <span className="basemap-name">{BASEMAPS[id].shortLabel}</span>
              </label>
            ))}
          </div>
          {/* Siblings of the radiogroup — a paragraph or button owned by a
              radiogroup is an unallowed child (axe aria-required-children). */}
          {busy && <p className="basemap-note">Loading {active.shortLabel}…</p>}
          {status === "error" && (
            <p className="basemap-error">
              <span>Couldn’t load {failed.shortLabel}.</span>
              <button type="button" className="ov-retry" onClick={() => actions.setBasemap(failed.id)}>
                Retry
              </button>
            </p>
          )}
        </div>
      )}
      <span className="basemap-live sr-only" role="status">
        {status === "error"
          ? `${failed.shortLabel} basemap could not be loaded. Still showing ${active.shortLabel}.`
          : busy
            ? `Loading the ${active.shortLabel} basemap.`
            : ""}
      </span>
    </div>
  );
}
