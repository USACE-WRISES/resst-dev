// The Map view: the Data Filters panel, the map over the results table, and
// the Selected Data panel. It stays mounted and laid out under the Dashboard
// and the Library (visibility: hidden + inert), so the Leaflet map keeps its
// size and a "Show on map" from either page flies while the page is still on
// screen. It reads the store through useMapViewState, which ignores the
// pages' own state and the view, and is memoized on `data`: a click on the
// Dashboard or in the Library never re-renders the hidden map, table and
// panels. The view (useView) only sets main's class and inert; the panels
// element is memoized on the Map's own state, so a switch between views
// leaves them alone.

import { memo, useMemo, type CSSProperties } from "react";
import type { AppData } from "../lib/types";
import { actions, useMapViewState, useView } from "../state/store";
import { derive } from "../state/derive";
import { FiltersPanel } from "./FiltersPanel";
import { TablePanel } from "./TablePanel";
import { TableResizer } from "./TableResizer";
import { DetailsPanel } from "./DetailsPanel";
import { MapPanel } from "../map/MapPanel";

export const MapView = memo(function MapView({ data }: { data: AppData }) {
  const state = useMapViewState();
  const derived = derive(data, state);
  const isMap = useView() === "map";

  // One computed source for the table grid row: collapse beats a custom
  // height, and null defers to the responsive stylesheet default (46%; 52%
  // on phones).
  const tableRow = state.tableCollapsed
    ? "0px"
    : state.tableHeightFrac != null
      ? `${(state.tableHeightFrac * 100).toFixed(2)}%`
      : undefined;
  const tableRowStyle = tableRow !== undefined ? ({ "--table-row": tableRow } as CSSProperties) : undefined;
  // Custom Selected Data panel width (drag/keyboard), never more than 70% of
  // the window; null keeps the stylesheet default, min(800px, 50vw).
  const mainStyle =
    state.detailsWidthPx != null ? ({ "--details-col": `min(${state.detailsWidthPx}px, 70vw)` } as CSSProperties) : undefined;

  const panels = useMemo(
    () => (
      <>
        <div className={state.mobilePanel === "filters" ? "panel-slot filters open" : "panel-slot filters"}>
          <FiltersPanel data={data} filters={state.filters} derived={derived} />
        </div>
        <div className={state.tableCollapsed ? "center-stack table-collapsed" : "center-stack"} style={tableRowStyle}>
          <MapPanel
            sites={derived.sites}
            allSites={data.sites}
            siteById={data.siteById}
            siteByShortId={data.siteByShortId}
            entriesBySite={data.entriesBySite}
            siteSediment={data.siteSediment}
            state={state}
          />
          <TableResizer collapsed={state.tableCollapsed} heightFrac={state.tableHeightFrac} />
          <TablePanel derived={derived} state={state} />
        </div>
        <div className={state.mobilePanel === "details" ? "panel-slot details open" : "panel-slot details"}>
          <DetailsPanel derived={derived} state={state} data={data} />
        </div>
        {/* Desktop-only edge pills (the original app's sidebar toggles) — the
            drawers own the narrow-screen experience, so CSS hides these ≤1100px. */}
        <button
          type="button"
          className="side-collapse-tab side-tab-filters"
          aria-expanded={!state.filtersCollapsed}
          aria-controls="filters-panel"
          aria-label={state.filtersCollapsed ? "Expand Data Filters panel" : "Collapse Data Filters panel"}
          onClick={() => actions.setPanelCollapsed("filters", !state.filtersCollapsed)}
        >
          <svg aria-hidden="true" focusable="false" width="14" height="14" viewBox="0 0 16 16">
            <path d="M3.5 6l4.5 4.5L12.5 6" fill="none" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        </button>
        <button
          type="button"
          className="side-collapse-tab side-tab-details"
          aria-expanded={!state.detailsCollapsed}
          aria-controls="details-panel"
          aria-label={state.detailsCollapsed ? "Expand Selected Data panel" : "Collapse Selected Data panel"}
          onClick={() => actions.setPanelCollapsed("details", !state.detailsCollapsed)}
        >
          <svg aria-hidden="true" focusable="false" width="14" height="14" viewBox="0 0 16 16">
            <path d="M3.5 6l4.5 4.5L12.5 6" fill="none" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        </button>
        {state.mobilePanel && (
          <button type="button" className="drawer-scrim" aria-label="Close panel" onClick={() => actions.setMobilePanel(null)} />
        )}
      </>
    ),
    [data, state, derived],
  );

  return (
    <main
      className={
        "app-main" +
        (state.filtersCollapsed ? " filters-collapsed" : "") +
        (state.detailsCollapsed ? " details-collapsed" : "") +
        (isMap ? "" : " view-hidden")
      }
      style={mainStyle}
      inert={!isMap}
    >
      {panels}
    </main>
  );
});
