// The map's top-left toolbar, shared by both map engines: search, the Select
// menu, the Layers/Legend popovers, Screening, and the hint bar of an armed
// Select tool. Its children stay direct children of .map-toolbar: the
// stylesheet's pointer-events rule (`.map-toolbar > *`) and the e2e selectors
// depend on that flat shape.

import type { Site } from "../lib/types";
import type { AppState } from "../state/store";
import type { MapEngine } from "./engine";
import { SearchControl } from "./SearchControl";
import { SelectMenu } from "./SelectMenu";
import { MapToolPanels } from "./MapToolPanels";
import { ScreeningPanel } from "./ScreeningPanel";
import { SelectHintBar } from "./SelectHintBar";
import type { ToolMsg } from "./selectTools";

export function MapToolbar({
  engine = "maplibre",
  state,
  allSites,
  siteByShortId,
  zoom,
  toolMsg,
}: {
  /** Which engine hosts the toolbar (the panels word a few things per engine). */
  engine?: MapEngine;
  state: AppState;
  /** Full site list (search suggestions). */
  allSites: Site[];
  siteByShortId: Map<number, string>;
  /** Current zoom in the MapLibre basis, rounded to 0.1 (overlay zoom gates). */
  zoom: number;
  toolMsg: ToolMsg | null;
}) {
  return (
    <div className="map-toolbar">
      <SearchControl sites={allSites} />
      <SelectMenu tool={state.mapTool} distance={state.riverDistanceMiles} hasSelection={state.selectedSiteIds.length > 0} />
      <MapToolPanels state={state} zoom={zoom} siteByShortId={siteByShortId} engine={engine} />
      <ScreeningPanel state={state} siteByShortId={siteByShortId} engine={engine} />
      {state.mapTool !== "none" && (
        <SelectHintBar
          tool={state.mapTool}
          msg={toolMsg}
          distance={state.riverDistanceMiles}
          // HUC tool keys double as overlay keys; box/polygon resolve to
          // nothing and stay false.
          overlayLoading={state.overlayStatus[state.mapTool === "river" ? "rivers" : state.mapTool] === "loading"}
        />
      )}
    </div>
  );
}
