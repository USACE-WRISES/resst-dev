// The toolbar's panel toggles. "Data" opens and closes the Data Filters panel
// (a drawer at 1100px and narrower) and "Table" the results table. The Map
// view starts with both collapsed on every visit (owner decision 2026-09-26),
// so the accent dot on Data says filters are on while the panel is closed.
// Rendered as a fragment: both buttons stay direct children of .map-toolbar.
// On a narrow map (the .map-compact wrap class) they show their icons only;
// their aria-labels keep the names.

import { actions, type AppState } from "../state/store";
import { NARROW, useMediaQuery } from "../lib/useMediaQuery";
import { SlidersIcon, TableIcon } from "../components/icons";

export function PanelToggles({ state }: { state: AppState }) {
  const narrow = useMediaQuery(NARROW);
  const filtersOpen = narrow ? state.mobilePanel === "filters" : !state.filtersCollapsed;
  const tableOpen = !state.tableCollapsed;
  const filtering = Object.values(state.filters).some((f) => f.enabled);
  const toggleFilters = () => {
    if (narrow) actions.setMobilePanel(filtersOpen ? null : "filters");
    else actions.setPanelCollapsed("filters", filtersOpen);
  };
  return (
    <>
      <button
        type="button"
        className={filtersOpen ? "map-tool map-tool-toggle map-tool-panel active" : "map-tool map-tool-toggle map-tool-panel"}
        aria-expanded={filtersOpen}
        aria-controls="filters-panel"
        aria-label={filtering ? "Data filters (some filters are on)" : "Data filters"}
        onClick={toggleFilters}
      >
        <SlidersIcon />
        <span className="map-tool-label">Data</span>
        {filtering && <span className="map-tool-dot" aria-hidden="true" />}
      </button>
      <button
        type="button"
        className={tableOpen ? "map-tool map-tool-toggle map-tool-panel active" : "map-tool map-tool-toggle map-tool-panel"}
        aria-expanded={tableOpen}
        aria-controls="results-table"
        aria-label="Table"
        onClick={() => actions.setTableCollapsed(tableOpen)}
      >
        <TableIcon />
        <span className="map-tool-label">Table</span>
      </button>
    </>
  );
}
