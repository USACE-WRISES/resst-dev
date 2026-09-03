// Basemap picker — the ArcGIS basemap-gallery pattern: an icon button whose
// tooltip names the active basemap, opening a panel that lists every basemap
// by name. Rendered into a Leaflet control host so it stacks under the zoom
// buttons (MapPanel portals into it).

import { useEffect, useRef, useState } from "react";
import { actions, type BasemapId } from "../state/store";
import { BASEMAPS, BASEMAP_ORDER } from "./basemaps";
import { useDismissPopover } from "./useDismissPopover";

function BasemapIcon() {
  // A 2x2 of map tiles (the ArcGIS basemap-gallery glyph). Authored at 1:1:
  // an 18px viewBox rendered at 18px with 2px strokes on integer coordinates,
  // so every stroke edge lands on a device pixel and the weight holds its own
  // next to the zoom glyphs.
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="11" y="2" width="5" height="5" rx="1" />
      <rect x="2" y="11" width="5" height="5" rx="1" />
      <rect x="11" y="11" width="5" height="5" rx="1" />
    </svg>
  );
}

export function BasemapPicker({ basemap }: { basemap: BasemapId }) {
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

  const active = BASEMAPS[basemap];
  const triggerLabel = `Basemap: ${active.shortLabel}`;

  return (
    <div className="basemap-picker" ref={rootRef}>
      <button
        type="button"
        ref={triggerRef}
        className="basemap-trigger"
        aria-expanded={open}
        aria-controls="basemap-panel"
        aria-label={triggerLabel}
        title={triggerLabel}
        onClick={() => setOpen(!open)}
      >
        <span className="basemap-icon">
          <BasemapIcon />
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
                  onChange={() => actions.setBasemap(id)}
                />
                <span className="basemap-name">{BASEMAPS[id].shortLabel}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
