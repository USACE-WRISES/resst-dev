import { useEffect, useState } from "react";
import type { AppData } from "./lib/types";
import { loadAppData } from "./lib/data";
import { useAppState, actions } from "./state/store";
import { derive } from "./state/derive";
import { FiltersPanel } from "./components/FiltersPanel";
import { TablePanel } from "./components/TablePanel";
import { DetailsPanel } from "./components/DetailsPanel";
import { WelcomeDialog } from "./components/WelcomeDialog";
import { MapPanel } from "./map/MapPanel";

export default function App() {
  const [data, setData] = useState<AppData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const state = useAppState();

  useEffect(() => {
    loadAppData().then(setData, (e) => setLoadError(String(e)));
  }, []);

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
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">🌊</span>
          <h1>Reservoir Sustainable Sediment Tool (RESST)</h1>
        </div>
        <nav className="header-tools" aria-label="Application tools">
          <button type="button" className="toolbar-btn" onClick={() => actions.setHelpOpen(!state.helpOpen)}>
            Help
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
      <main className="app-main">
        <FiltersPanel data={data} filters={state.filters} derived={derived} />
        <div className="center-stack">
          <MapPanel sites={derived.sites} allSites={data.sites} siteById={data.siteById} state={state} />
          <TablePanel derived={derived} state={state} />
        </div>
        <DetailsPanel derived={derived} />
      </main>
      <footer className="app-footer">
        <span>
          Data as of {new Date(data.manifest.generated).toLocaleDateString()} · {data.sites.length.toLocaleString()} sites ·{" "}
          {data.entries.length.toLocaleString()} literature entries
        </span>
        <span>Basemap: USGS The National Map</span>
      </footer>
      {state.welcomeOpen && <WelcomeDialog />}
    </div>
  );
}
