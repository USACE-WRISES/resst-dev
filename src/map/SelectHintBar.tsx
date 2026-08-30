// The armed-mode strip on the map toolbar's second row: the gesture hint (or
// the session's live busy/empty/error/result text, announced via
// role="status"), the river distance input, the polygon Finish button, and
// Cancel — which reads Done once a river pick is live.

import { useEffect, useState } from "react";
import { actions, type MapTool } from "../state/store";
import { selectSessionCommands, type ToolMsg } from "./selectTools";

const DEFAULT_HINT: Record<Exclude<MapTool, "none">, string> = {
  box: "Drag a box around sites. Shift adds to the selection. Esc cancels.",
  polygon: "Click the map to add corners; double-click, Enter, or Finish selects. Shift adds. Esc cancels.",
  huc2: "Click a HUC-2 basin to select its sites. Shift adds. Esc cancels.",
  huc4: "Click a HUC-4 basin to select its sites. Shift adds. Esc cancels.",
  huc6: "Click a HUC-6 basin to select its sites. Shift adds. Esc cancels.",
  huc8: "Click a HUC-8 basin to select its sites. Shift adds. Esc cancels.",
  river: "Click a river to select sites near it. Shift adds. Esc cancels.",
};

export function SelectHintBar({ tool, msg, distance, overlayLoading }: {
  tool: Exclude<MapTool, "none">;
  msg: ToolMsg | null;
  distance: number;
  /** The armed tool's snapshot is still downloading (first use per session). */
  overlayLoading: boolean;
}) {
  // Local text mirror: a half-typed "2" (of "25") neither snaps to the clamp
  // nor recomputes; every valid parse commits to the store, which debounces
  // the live recompute.
  const [text, setText] = useState(String(distance));
  useEffect(() => setText(String(distance)), [distance]);
  const refining = msg?.kind === "river";
  return (
    <div className="map-hint-bar" data-kind={msg?.kind ?? "hint"}>
      <span role="status">
        {msg?.text ??
          (overlayLoading ? "Map data is downloading; the layer appears in a moment. Esc cancels." : DEFAULT_HINT[tool])}
      </span>
      {tool === "river" && (
        <label className="hint-distance">
          within
          <input
            type="number"
            inputMode="decimal"
            min={1}
            max={300}
            step={1}
            value={text}
            aria-label="Distance from the river in miles"
            onChange={(e) => {
              setText(e.target.value);
              const v = Number(e.target.value);
              if (e.target.value.trim() !== "" && Number.isFinite(v)) actions.setRiverDistanceMiles(v);
            }}
          />
          mi
        </label>
      )}
      {tool === "polygon" && (
        <button type="button" className="hint-btn" onClick={() => selectSessionCommands()?.finish?.()}>
          Finish
        </button>
      )}
      <button type="button" className="hint-btn" onClick={() => actions.setMapTool("none")}>
        {refining ? "Done" : "Cancel"}
      </button>
    </div>
  );
}
