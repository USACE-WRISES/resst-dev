// The toolbar's consolidated Select menu: box / polygon / HUC levels /
// near-a-river, plus Clear selection. Picking a mode arms it and closes the
// popover; picking the armed mode disarms. The panel is role="group" with
// aria-pressed toggle buttons, NOT role="menu" — the labeled HUC row and the
// description spans would violate menu's required-children contract.

import { useRef, useState } from "react";
import { actions, type MapTool } from "../state/store";
import { useDismissPopover } from "./useDismissPopover";

export const TOOL_LABEL: Record<Exclude<MapTool, "none">, string> = {
  box: "Box",
  polygon: "Polygon",
  huc2: "HUC-2",
  huc4: "HUC-4",
  huc6: "HUC-6",
  huc8: "HUC-8",
  river: "River",
};

export function SelectMenu({ tool, distance, hasSelection }: {
  tool: MapTool;
  distance: number;
  hasSelection: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismissPopover(open, ref, () => setOpen(false));
  const pick = (t: Exclude<MapTool, "none">) => {
    actions.setMapTool(tool === t ? "none" : t);
    setOpen(false);
  };
  const armed = tool !== "none";
  return (
    <div className="tool-popover" ref={ref}>
      <button
        type="button"
        className={armed || open ? "map-tool active" : "map-tool"}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {armed ? `Select: ${TOOL_LABEL[tool as Exclude<MapTool, "none">]}` : "Select"} ▾
      </button>
      {open && (
        <div className="tool-popover-panel select-menu" role="group" aria-label="Select sites on the map">
          <button type="button" className="select-item" aria-pressed={tool === "box"} onClick={() => pick("box")}>
            <b>Box</b>
            <span>Drag a rectangle around sites</span>
          </button>
          <button type="button" className="select-item" aria-pressed={tool === "polygon"} onClick={() => pick("polygon")}>
            <b>Polygon</b>
            <span>Click corners; double-click or Enter finishes</span>
          </button>
          <div className="select-group" role="group" aria-label="By watershed unit (HUC)">
            <span className="select-group-label">By watershed — click a basin</span>
            <div className="select-huc-row">
              {(["huc2", "huc4", "huc6", "huc8"] as const).map((t) => (
                <button key={t} type="button" className="select-huc" aria-pressed={tool === t} onClick={() => pick(t)}>
                  {TOOL_LABEL[t]}
                </button>
              ))}
            </div>
          </div>
          <button type="button" className="select-item" aria-pressed={tool === "river"} onClick={() => pick("river")}>
            <b>Near a river</b>
            <span>Click a river — sites within {distance} miles</span>
          </button>
          <div className="select-menu-sep" role="presentation" />
          <button
            type="button"
            className="select-item"
            disabled={!hasSelection}
            onClick={() => {
              actions.clearSelection();
              setOpen(false);
            }}
          >
            <b>Clear selection</b>
          </button>
        </div>
      )}
    </div>
  );
}
