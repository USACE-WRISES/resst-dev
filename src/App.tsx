import { useEffect, useState } from "react";
import type { AppData } from "./lib/types";
import { loadAppData } from "./lib/data";
import { useAppState, actions } from "./state/store";
import { derive } from "./state/derive";
import { FiltersPanel } from "./components/FiltersPanel";
import { TablePanel } from "./components/TablePanel";
import { DetailsPanel } from "./components/DetailsPanel";
import { WelcomeDialog } from "./components/WelcomeDialog";
import { HelpOverlay } from "./components/HelpOverlay";
import { DownloadPanel } from "./components/DownloadPanel";
import { MapPanel } from "./map/MapPanel";
import { BASEMAPS } from "./map/basemaps";
import { Logo } from "./components/Logo";

export default function App() {
  const [data, setData] = useState<AppData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const state = useAppState();

  useEffect(() => {
    loadAppData().then(setData, (e) => setLoadError(String(e)));
  }, []);

  // Escape closes an open mobile drawer (dialogs handle their own Escape).
  useEffect(() => {
    if (!state.mobilePanel) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && actions.setMobilePanel(null);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [state.mobilePanel]);

  if (loadError) {
    return (
      <div className="load-screen" role="alert">
        <h1>Reservoir Sustainable Sediment Tool</h1>
        <p>The application data failed to load: {loadError}</p>
        <p>Reload the page to try again. If this keeps happening, please open an issue on the project repository.</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="load-screen" aria-busy="true">
        <h1>Reservoir Sustainable Sediment Tool</h1>
        <p>Loading data…</p>
      </div>
    );
  }

  const derived = derive(data, state);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#results-table">
        Skip to results table
      </a>
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true"><Logo size={26} /></span>
          <h1>Reservoir Sustainable Sediment Tool (RESST)</h1>
        </div>
        <nav className="header-tools" aria-label="Application tools">
          <button type="button" className="toolbar-btn" onClick={() => actions.setHelpOpen(!state.helpOpen)}>
            Help
          </button>
          <button type="button" className="toolbar-btn" onClick={() => actions.setDownloadsOpen(true)}>
            Download Data
          </button>
          <a
            className="toolbar-btn"
            href="https://github.com/USACE-WRISES/resst-dev"
            target="_blank"
            rel="noopener noreferrer"
          >
            Data &amp; Code
          </a>
        </nav>
      </header>
      <main
        className={
          "app-main" +
          (state.filtersCollapsed ? " filters-collapsed" : "") +
          (state.detailsCollapsed ? " details-collapsed" : "")
        }
      >
        <div className={state.mobilePanel === "filters" ? "panel-slot filters open" : "panel-slot filters"}>
          <FiltersPanel data={data} filters={state.filters} derived={derived} />
          <button
            type="button"
            className="panel-rail rail-filters"
            aria-expanded={false}
            aria-controls="filters-panel"
            aria-label="Expand Data Filters panel"
            onClick={() => actions.setPanelCollapsed("filters", false)}
          >
            <span aria-hidden="true">»</span>
            <span className="rail-text">Data Filters</span>
          </button>
        </div>
        <div className="center-stack">
          <MapPanel sites={derived.sites} allSites={data.sites} siteById={data.siteById} state={state} />
          <TablePanel derived={derived} state={state} />
        </div>
        <div className={state.mobilePanel === "details" ? "panel-slot details open" : "panel-slot details"}>
          <DetailsPanel derived={derived} />
          <button
            type="button"
            className="panel-rail rail-details"
            aria-expanded={false}
            aria-controls="details-panel"
            aria-label="Expand Selected Data panel"
            onClick={() => actions.setPanelCollapsed("details", false)}
          >
            <span aria-hidden="true">«</span>
            <span className="rail-text">Selected Data</span>
          </button>
        </div>
        {state.mobilePanel && (
          <button
            type="button"
            className="drawer-scrim"
            aria-label="Close panel"
            onClick={() => actions.setMobilePanel(null)}
          />
        )}
      </main>
      <nav className="mobile-bar" aria-label="Panels">
        <button
          type="button"
          className="for-filters"
          aria-pressed={state.mobilePanel === "filters"}
          onClick={() => actions.setMobilePanel(state.mobilePanel === "filters" ? null : "filters")}
        >
          Filters
        </button>
        <button
          type="button"
          aria-pressed={state.mobilePanel === "details"}
          onClick={() => actions.setMobilePanel(state.mobilePanel === "details" ? null : "details")}
        >
          Selected{derived.selection.sites.length > 0 ? ` (${derived.selection.sites.length})` : ""}
        </button>
      </nav>
      <footer className="app-footer">
        <span>
          Data as of {new Date(data.manifest.generated).toLocaleDateString()} · {data.sites.length.toLocaleString()} sites ·{" "}
          {data.entries.length.toLocaleString()} literature entries
        </span>
        <span>Basemap: {BASEMAPS[state.basemap].label}</span>
      </footer>
      {state.welcomeOpen && <WelcomeDialog />}
      {state.helpOpen && <HelpOverlay />}
      {state.downloadsOpen && <DownloadPanel manifest={data.manifest} />}
    </div>
  );
}
