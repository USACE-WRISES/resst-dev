import { lazy, Suspense, useEffect, useState, type ComponentType, type ReactNode } from "react";
import type { AppData } from "./lib/types";
import { loadAppData } from "./lib/data";
import { useAppState, actions } from "./state/store";
import { parseViewHash, viewHash, type View } from "./state/viewRoute";
import { derive } from "./state/derive";
import { WelcomeDialog } from "./components/WelcomeDialog";
import { HelpOverlay } from "./components/HelpOverlay";
import { DownloadPanel } from "./components/DownloadPanel";
import { ViewSwitch } from "./components/ViewSwitch";
import { MapView } from "./components/MapView";
import { BASEMAPS } from "./map/basemaps";
import { Logo } from "./components/Logo";

// The Dashboard and the Library are separate chunks: the Map view's bundle
// stays what it was. Both are fetched while the browser is idle once the data
// is in (App's prefetch effect), and a page whose code is in renders at once.
// React.lazy alone suspends on a page's first render even when its code is
// cached, and React then holds the fallback for at least 300 ms.
function lazyPage<P extends object>(load: () => Promise<{ default: ComponentType<P> }>) {
  let loaded: ComponentType<P> | null = null;
  const preload = () =>
    load().then((m) => {
      loaded = m.default;
      return m;
    });
  const Lazy = lazy(preload);
  function Page(props: P) {
    // Chosen once per mount: swapping the type later would remount the page.
    const [Component] = useState<ComponentType<P>>(() => loaded ?? Lazy);
    return <Component {...props} />;
  }
  return { Page, preload };
}
const dashboardPage = lazyPage(() => import("./dashboard/Dashboard"));
const libraryPage = lazyPage(() => import("./library/Library"));
const Dashboard = dashboardPage.Page;
const Library = libraryPage.Page;

type Page = Exclude<View, "map">;

/** A page mounts on its first visit and then stays mounted: while another
    view shows it is parked (hidden, inert, skipped by style and layout), so
    coming back is instant and keeps its scroll, search and drill-down. */
function PageSlot({ label, active, children }: { label: string; active: boolean; children: ReactNode }) {
  return (
    <section className={active ? "view-page" : "view-page is-parked"} aria-label={label} inert={!active}>
      <Suspense fallback={<p className="view-loading">Loading…</p>}>{children}</Suspense>
    </section>
  );
}

export default function App() {
  const [data, setData] = useState<AppData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const state = useAppState();
  const isMap = state.view === "map";
  // The pages opened so far; each stays mounted from its first visit on.
  const [visited, setVisited] = useState<ReadonlySet<Page>>(() => new Set(state.view === "map" ? [] : [state.view]));
  if (state.view !== "map" && !visited.has(state.view)) setVisited(new Set([...visited, state.view]));

  useEffect(() => {
    loadAppData().then(setData, (e) => setLoadError(String(e)));
  }, []);

  // Fetch the pages' code while the browser is idle, once the data is in.
  useEffect(() => {
    if (!data) return;
    const load = () => {
      dashboardPage.preload().catch(() => {});
      libraryPage.preload().catch(() => {});
    };
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(load, { timeout: 4000 });
      return () => window.cancelIdleCallback(id);
    }
    const t = window.setTimeout(load, 1500);
    return () => window.clearTimeout(t);
  }, [data]);

  // Escape closes an open mobile drawer (dialogs handle their own Escape).
  useEffect(() => {
    if (!state.mobilePanel) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && actions.setMobilePanel(null);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [state.mobilePanel]);

  // The URL hash names the view (#dashboard, #library; the Map view is the
  // bare URL). Written without history entries, and only when it disagrees,
  // so an unrelated hash such as the skip link's target is never touched.
  useEffect(() => {
    const inUrl = parseViewHash(location.hash) ?? "map";
    if (inUrl !== state.view) history.replaceState(null, "", location.pathname + location.search + viewHash(state.view));
  }, [state.view]);
  useEffect(() => {
    const onHash = () => {
      const v = parseViewHash(location.hash);
      if (v) actions.setView(v);
      else if (location.hash === "") actions.setView("map");
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
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

  // Cached on the filters and the selection (the Map view derives the same
  // object); the mobile bar needs the selection count.
  const derived = derive(data, state);
  const filtersActive = Object.values(state.filters).some((f) => f.enabled);

  return (
    <div className="app-shell">
      {isMap && (
        // The table starts collapsed: open it before the jump, or focus lands on a hidden table.
        <a className="skip-link" href="#results-table" onClick={() => actions.setTableCollapsed(false)}>
          Skip to results table
        </a>
      )}
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true"><Logo size={26} /></span>
          <h1>Reservoir Sustainable Sediment Tool (RESST)</h1>
        </div>
        <ViewSwitch view={state.view} />
        <nav className="header-tools" aria-label="Application tools">
          <button type="button" className="toolbar-btn" onClick={() => actions.setHelpOpen(!state.helpOpen)}>
            Help
          </button>
          <button type="button" className="toolbar-btn" onClick={() => actions.setDownloadsOpen(true)}>
            Download Data
          </button>
        </nav>
      </header>
      {/* The Map view stays mounted and laid out under the other views
          (src/components/MapView.tsx); the pages sit over it and stay
          mounted, parked, once visited. Their props are their own slices,
          so a parked page never re-renders on the Map view. */}
      <div className="view-stack">
        <MapView data={data} />
        {visited.has("dashboard") && (
          <PageSlot label="Dashboard" active={state.view === "dashboard"}>
            <Dashboard data={data} dash={state.dashboard} coreStatus={state.sedimentStatus.core ?? null} filtersActive={filtersActive} />
          </PageSlot>
        )}
        {visited.has("library") && (
          <PageSlot label="Library" active={state.view === "library"}>
            <Library data={data} lib={state.library} />
          </PageSlot>
        )}
      </div>
      {isMap && (
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
            Selected
            {derived.selection.sites.length > 0
              ? ` (${derived.selection.sites.length})`
              : state.selectedReservoirId
                ? " (1)" // a national-inventory reservoir is selected
                : ""}
          </button>
        </nav>
      )}
      <footer className="app-footer">
        <span>
          Data as of {new Date(data.manifest.generated).toLocaleDateString()} · {data.sites.length.toLocaleString()} sites ·{" "}
          {data.entries.length.toLocaleString()} literature entries
          <span className="footer-vintage"> · RATTES v1.2 (2026) · ResNet v1 (2025) · RESSED (2013)</span>
        </span>
        <span>Basemap: {BASEMAPS[state.basemap].label}</span>
      </footer>
      {state.welcomeOpen && <WelcomeDialog />}
      {state.helpOpen && <HelpOverlay />}
      {state.downloadsOpen && <DownloadPanel manifest={data.manifest} />}
    </div>
  );
}
