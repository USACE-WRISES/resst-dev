// Minimal typed app store — a single external snapshot consumed via React's
// useSyncExternalStore. Deliberately not a state library (assessment §9):
// the whole app state is filters + selection + a few UI toggles.

import { useSyncExternalStore } from "react";
import type { FilterState } from "../filters/engine";
import { FILTER_DEFS } from "../config/filters.generated";
import { emptyItemState } from "../filters/engine";
import type { TabId } from "../config/tabs";
import { EMPTY_SCREENING, isEmptyScreening, type ScreeningState } from "../sediment/screen";
import { parseViewHash, type View } from "./viewRoute";

export type OverlayStatus = "loading" | "ready" | "error";

/** Site keyword fields the Dashboard charts. */
export type SiteDim = "sediment_release" | "ecological_concern" | "analysis" | "site_type";
/** Which publications a literature chart or the Library counts. */
export type LitScope = "all" | "site" | "general";

/** The Dashboard's topics, one shown at a time behind the headline tiles. */
export type DashTopic = "sites" | "literature" | "screening" | "capacity";

/** An open drill-down: a chart slice, a screening quadrant, a loss class or a
    state, and (for the keyword charts) the "Break down by" field inside it. */
export interface DashDrill {
  card: "sites" | "lit" | "quadrants" | "loss" | "state";
  key: string;
  /** null = the chart's default breakdown. */
  dim: string | null;
}

/** The drills without one topic's (for a dimension change that closes it). */
export const dropDrill = (drills: Partial<Record<DashTopic, DashDrill>>, topic: DashTopic): Partial<Record<DashTopic, DashDrill>> => {
  const next = { ...drills };
  delete next[topic];
  return next;
};

/** The Dashboard's hints (true = still due): "Click a tile to switch
    topics" above the tiles, and each topic's own "Click a slice or a
    keyword…" under its title. The tiles' hint retires at the first topic
    switch; a topic's chart hint at the first drill-down in that topic, so
    the others stay until their own charts are used. Every page load shows
    them all again: nothing about them is stored (owner decisions
    2026-09-26). */
export interface DashHints {
  topics: boolean;
  explore: Record<DashTopic, boolean>;
}

/** Every hint due: the state each page load starts from. */
const freshHints = (): DashHints => ({
  topics: true,
  explore: { sites: true, literature: true, screening: true, capacity: true },
});

/** The Dashboard's own UI state: the open topic, the charted dimensions,
    each topic's open drill-down (so switching tabs keeps every one), and the
    hints. Session-only, so leaving and returning restores the page. */
export interface DashboardState {
  topic: DashTopic;
  siteDim: SiteDim;
  /** A literature keyword field (src/library/index.ts LIT_FIELDS). */
  litDim: string;
  litScope: LitScope;
  drills: Partial<Record<DashTopic, DashDrill>>;
  hints: DashHints;
}

/** A sortable column of the Library's publication table. */
export type LibrarySortKey = "year" | "title" | "site";
export interface LibrarySort {
  key: LibrarySortKey;
  dir: "asc" | "desc";
}

/** The Library's search state (session-only). */
export interface LibraryState {
  query: string;
  scope: LitScope;
  sort: LibrarySort;
  /** Selected facet values by field (OR within a field, AND across fields). */
  facets: Record<string, string[]>;
  /** Only publications about this site. */
  siteId: string | null;
  /** The publication chosen for the reading pane (null: none chosen yet). */
  openLitId: string | null;
  /** The one open filter group in the rail, by title (one at a time, like
      the Selected Data cards); null closes them all. */
  openGroup: string | null;
}

export const EMPTY_LIBRARY: LibraryState = {
  query: "",
  scope: "all",
  sort: { key: "year", dir: "desc" },
  facets: {},
  siteId: null,
  openLitId: null,
  openGroup: "Document type",
};

/** Lazily-fetched sedimentation bundles that report load status (trajectory
    chunks stay chip-less — the chart section handles them inline). */
export type SedimentPack = "core" | "surveys";
/** Metric styling the national inventory layer. */
export type NationalMetric = "pctLost2025" | "pctLost2050" | "rate" | "storage" | "evidence";
/** Which side of the selected reservoir's network is highlighted on the map. */
export type NetworkMode = "none" | "up" | "down" | "full";

/** Armed map-selection tool. The HUC tool ids double as overlay keys
    (overlays.ts), so arming one can switch its boundary layer on. */
export type MapTool = "none" | "box" | "polygon" | "huc2" | "huc4" | "huc6" | "huc8" | "river";

/** Where the Selected Data panel's Back link returns to after opening a
    comparable reservoir: the previous selection and the card that was open. */
export interface ReturnTarget {
  siteId: string | null;
  reservoirId: string | null;
  /** Display name for the link ("Back to {label}"). */
  label: string;
  openSection: string | null;
}

export type BasemapId = "usgs" | "esri";
/** The boot default — the original app's Esri Topographic look (docs/PARITY.md row 2). */
export const DEFAULT_BASEMAP: BasemapId = "esri";
/** Unknown/legacy persisted values fall back to the default basemap. */
export const parseBasemapId = (raw: string | null): BasemapId =>
  raw === "usgs" || raw === "esri" ? raw : DEFAULT_BASEMAP;

export const TABLE_ROW_MIN = 0.15;
export const TABLE_ROW_MAX = 0.85;
/** Persisted table height — a fraction of the center stack. Unparseable
    values fall back to the responsive stylesheet default (null); numbers
    clamp into the draggable range. */
export const parseTableHeight = (raw: string | null): number | null => {
  if (raw == null || raw.trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.min(TABLE_ROW_MAX, Math.max(TABLE_ROW_MIN, n));
};

export const DETAILS_COL_MIN = 280;
/** The widest a dragged Selected Data panel may be; the layout also caps it
    at 70% of the window (PanelResizer, MapView), so the map keeps room. */
export const DETAILS_COL_MAX = 1200;
/** Persisted Selected Data panel width in px (desktop only — the drawers own
    narrow screens). Unparseable → the stylesheet's default track (null),
    min(800px, 50vw). */
export const parseDetailsWidth = (raw: string | null): number | null => {
  if (raw == null || raw.trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.min(DETAILS_COL_MAX, Math.max(DETAILS_COL_MIN, Math.round(n)));
};

export interface AppState {
  /** The top-level view: the map (the app as it always was), the Dashboard or
      the Library. The map stays mounted underneath the other two. */
  view: View;
  dashboard: DashboardState;
  library: LibraryState;
  filters: FilterState;
  /** Selected sites — one from a click, several from the map Select tools. */
  selectedSiteIds: string[];
  activeTab: TabId;
  /** Per-tab quick-search text. */
  tabSearch: Partial<Record<TabId, string>>;
  /** Table option: show only rows belonging to the selection. */
  showSelectionOnly: boolean;
  /** Which map-selection tool is armed. */
  mapTool: MapTool;
  /** "Near a river" buffer distance in miles (session-only). */
  riverDistanceMiles: number;
  /** Reference overlay visibility by overlay key (all off by default). */
  overlays: Record<string, boolean>;
  /** Per-overlay fetch status (entries exist only while an overlay is on and fetchable). */
  overlayStatus: Record<string, OverlayStatus>;
  /** Active basemap (persisted per-browser). */
  basemap: BasemapId;
  /** Which side panel is open as a drawer on narrow screens. */
  mobilePanel: "filters" | "details" | null;
  /** Desktop-only side-panel collapse (the drawers take over on narrow
      screens). Both start collapsed on every visit. */
  filtersCollapsed: boolean;
  detailsCollapsed: boolean;
  /** Results-table split: fraction of the center stack given to the table
      (null = the responsive stylesheet default — 46%, 52% on phones). */
  tableHeightFrac: number | null;
  /** Results table collapsed to the half-pill tab (all breakpoints); starts
      collapsed on every visit. */
  tableCollapsed: boolean;
  /** Selected Data panel width in px (null = the stylesheet's default track,
      min(800px, 50vw)). */
  detailsWidthPx: number | null;
  helpOpen: boolean;
  downloadsOpen: boolean;
  welcomeOpen: boolean;
  /** Bumped whenever a lazy sedimentation bundle finishes loading — the cheap
      signal that lets pure derivations/components re-read the module caches. */
  sedimentStamp: number;
  /** Load status per sedimentation pack (absent = never requested). */
  sedimentStatus: Partial<Record<SedimentPack, OverlayStatus>>;
  /** Selected national-inventory reservoir (ResNet ShortID as a string).
      INVARIANT: mutually exclusive with selectedSiteIds — documented RESST
      sites always use the site selection; this exists for the other ~57k. */
  selectedReservoirId: string | null;
  /** National inventory layer (all modeled reservoirs) — session-only. */
  nationalLayer: { on: boolean; metric: NationalMetric };
  /** Network-explorer highlight mode + drainage-area overlay for the current selection. */
  networkView: { mode: NetworkMode; basin: boolean };
  /** National screening criteria (session-only — an investigation, not a preference). */
  screening: ScreeningState;
  /** Whether the docked Screening panel is open (the map keeps popups and
      fits clear of it). */
  screeningOpen: boolean;
  /** The one open details-panel card (owner decision 2026-09-25: one at a
      time). Session-only; it survives the pager and selection changes. */
  openSection: string | null;
  /** Back-link target while the panel shows a reservoir opened from
      Comparable Reservoirs; every other selection change clears it. */
  returnTo: ReturnTarget | null;
}

const initialFilters = (): FilterState =>
  Object.fromEntries(FILTER_DEFS.map((d) => [d.key, emptyItemState()]));

let state: AppState = {
  // The URL hash names the view at boot (#dashboard, #library); the store
  // also runs under vitest in Node, where there is no location.
  view: (typeof location !== "undefined" && parseViewHash(location.hash)) || "map",
  dashboard: { topic: "sites", siteDim: "sediment_release", litDim: "purpose", litScope: "all", drills: {}, hints: freshHints() },
  library: EMPTY_LIBRARY,
  filters: initialFilters(),
  selectedSiteIds: [],
  activeTab: "sites",
  tabSearch: {},
  showSelectionOnly: false,
  mapTool: "none",
  riverDistanceMiles: 10,
  overlays: {},
  overlayStatus: {},
  basemap: (() => {
    try {
      return parseBasemapId(localStorage.getItem("resst.basemap"));
    } catch {
      return DEFAULT_BASEMAP;
    }
  })(),
  mobilePanel: null,
  // The Map view opens clean on every visit: the full map, with the Data
  // Filters, the results table and Selected Data collapsed (owner decision
  // 2026-09-26). Only the sizes people drag are remembered.
  filtersCollapsed: true,
  detailsCollapsed: true,
  tableHeightFrac: (() => {
    try {
      return parseTableHeight(localStorage.getItem("resst.tableHeight"));
    } catch {
      return null;
    }
  })(),
  tableCollapsed: (() => {
    try {
      localStorage.removeItem("resst.tableCollapsed"); // the old per-browser setting; the table now always starts collapsed
    } catch {
      /* storage unavailable */
    }
    return true;
  })(),
  detailsWidthPx: (() => {
    try {
      return parseDetailsWidth(localStorage.getItem("resst.detailsWidth"));
    } catch {
      return null;
    }
  })(),
  sedimentStamp: 0,
  sedimentStatus: {},
  selectedReservoirId: null,
  nationalLayer: { on: false, metric: "pctLost2025" },
  networkView: { mode: "none", basin: false },
  screening: EMPTY_SCREENING,
  screeningOpen: false,
  openSection: null,
  returnTo: null,
  helpOpen: false,
  downloadsOpen: false,
  welcomeOpen: (() => {
    try {
      return localStorage.getItem("resst.hideWelcome") !== "1";
    } catch {
      return true;
    }
  })(),
};

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const getState = (): AppState => state;
export const subscribe = (l: () => void): (() => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useAppState(): AppState {
  return useSyncExternalStore(subscribe, getState, getState);
}

/** The state as the Map view sees it: the same object until something
    other than the Dashboard's or the Library's own state, or the view,
    changes. The Map view stays mounted (hidden) under those pages, so
    without this every click there, and every switch between views, would
    re-render the whole map, table and panels. The Map view reads the view
    itself through useView. */
const PAGE_ONLY: ReadonlySet<keyof AppState> = new Set<keyof AppState>(["library", "dashboard", "view"]);
let mapViewSnapshot: AppState = state;
export const getMapViewState = (): AppState => {
  if (mapViewSnapshot !== state) {
    const prev = mapViewSnapshot;
    const changed = (Object.keys(state) as Array<keyof AppState>).some((k) => !PAGE_ONLY.has(k) && state[k] !== prev[k]);
    if (changed) mapViewSnapshot = state;
  }
  return mapViewSnapshot;
};

export function useMapViewState(): AppState {
  return useSyncExternalStore(subscribe, getMapViewState, getMapViewState);
}

const getView = (): View => state.view;
/** The current view alone: a component using it re-renders only on a switch. */
export function useView(): View {
  return useSyncExternalStore(subscribe, getView, getView);
}

function set(partial: Partial<AppState>): void {
  state = { ...state, ...partial };
  emit();
}

export const actions = {
  setFilterEnabled(key: string, enabled: boolean): void {
    const cur = state.filters[key] ?? emptyItemState();
    set({ filters: { ...state.filters, [key]: { ...cur, enabled } } });
  },
  toggleFilterValue(key: string, value: string): void {
    const cur = state.filters[key] ?? emptyItemState();
    const selected = cur.selected.includes(value)
      ? cur.selected.filter((v) => v !== value)
      : [...cur.selected, value];
    set({ filters: { ...state.filters, [key]: { ...cur, selected } } });
  },
  clearFilterValues(key: string): void {
    const cur = state.filters[key] ?? emptyItemState();
    set({ filters: { ...state.filters, [key]: { ...cur, selected: [] } } });
  },
  /** Global Clear All (approved improvement D8): every item off and emptied. */
  clearAllFilters(): void {
    set({ filters: initialFilters() });
  },
  /** Single-site selection (map click, table row, search result). Clears any
      national-reservoir selection and network highlight (the invariant). */
  selectSite(siteId: string | null): void {
    set({
      selectedSiteIds: siteId ? [siteId] : [],
      showSelectionOnly: siteId ? state.showSelectionOnly : false,
      selectedReservoirId: null,
      networkView: { mode: "none", basin: false },
      returnTo: null,
    });
  },
  /** Multi-selection from the map Select tools and the pages' "Show on map".
      Dedupes and touches nothing else beyond the selection invariant — tool
      sessions disarm explicitly via setMapTool.
      A multi-site selection has no popup, so it opens Selected Data (the
      desktop flag; narrow screens keep their drawers closed). A `live`
      refinement (the river tool's distance edits) opens it only when the
      selection first grows past one site, so a panel closed mid-refinement
      stays closed. */
  selectSites(siteIds: string[], opts: { live?: boolean } = {}): void {
    const ids = [...new Set(siteIds)];
    const reveal = ids.length > 1 && (!opts.live || state.selectedSiteIds.length <= 1);
    set({
      selectedSiteIds: ids,
      selectedReservoirId: null,
      networkView: { mode: "none", basin: false },
      returnTo: null,
      ...(reveal ? { detailsCollapsed: false } : {}),
    });
  },
  /** National-inventory reservoir selection (non-documented dams). Clears any
      site selection — at most one selection model is active at a time. */
  selectReservoir(shortId: string | null): void {
    set({
      selectedReservoirId: shortId,
      selectedSiteIds: [],
      showSelectionOnly: false,
      networkView: { mode: "none", basin: false },
      returnTo: null,
    });
  },
  clearSelection(): void {
    set({
      selectedSiteIds: [],
      showSelectionOnly: false,
      selectedReservoirId: null,
      networkView: { mode: "none", basin: false },
      returnTo: null,
    });
  },
  /** Open a reservoir from Comparable Reservoirs, remembering where the user
      came from for the panel's Back link. A documented site arrives with its
      Sediment Management card open (what did they do?); a national reservoir
      arrives with every card closed. */
  openComparable(target: { siteId: string } | { reservoirId: string }, from: ReturnTarget): void {
    const siteId = "siteId" in target ? target.siteId : null;
    set({
      selectedSiteIds: siteId ? [siteId] : [],
      selectedReservoirId: siteId ? null : (target as { reservoirId: string }).reservoirId,
      showSelectionOnly: false,
      networkView: { mode: "none", basin: false },
      openSection: siteId ? "mgmt" : null,
      returnTo: from,
    });
  },
  /** The Back link: restore the selection and the card that was open. */
  goBack(): void {
    const back = state.returnTo;
    if (!back) return;
    set({
      selectedSiteIds: back.siteId ? [back.siteId] : [],
      selectedReservoirId: back.siteId ? null : back.reservoirId,
      showSelectionOnly: false,
      networkView: { mode: "none", basin: false },
      openSection: back.openSection,
      returnTo: null,
    });
  },
  setShowSelectionOnly(on: boolean): void {
    set({ showSelectionOnly: on });
  },
  setMapTool(tool: MapTool): void {
    if (state.mapTool === tool) return; // re-arming the armed tool is a no-op
    set({ mapTool: tool });
  },
  setRiverDistanceMiles(mi: number): void {
    if (!Number.isFinite(mi)) return;
    const next = Math.min(300, Math.max(1, mi));
    if (state.riverDistanceMiles === next) return;
    set({ riverDistanceMiles: next });
  },
  setOverlay(key: string, on: boolean): void {
    set({ overlays: { ...state.overlays, [key]: on } });
  },
  /** Written by the overlay fetch pipeline; null clears the entry. */
  setOverlayStatus(key: string, status: OverlayStatus | null): void {
    const cur = state.overlayStatus[key] ?? null;
    if (cur === status) return; // no-op guard: moveend churn must not emit
    const next = { ...state.overlayStatus };
    if (status === null) delete next[key];
    else next[key] = status;
    set({ overlayStatus: next });
  },
  /** Basemap choice persists per-browser (like the welcome dismissal). */
  setBasemap(id: BasemapId): void {
    if (state.basemap === id) return; // re-picking the active basemap is a no-op
    try {
      localStorage.setItem("resst.basemap", id);
    } catch {
      /* storage unavailable — the choice lasts for this session only */
    }
    set({ basemap: id });
  },
  setActiveTab(tab: TabId): void {
    set({ activeTab: tab });
  },
  setTabSearch(tab: TabId, text: string): void {
    set({ tabSearch: { ...state.tabSearch, [tab]: text } });
  },
  setHelpOpen(open: boolean): void {
    set({ helpOpen: open });
  },
  setMobilePanel(panel: "filters" | "details" | null): void {
    set({ mobilePanel: panel });
  },
  setPanelCollapsed(panel: "filters" | "details", collapsed: boolean): void {
    if ((panel === "filters" ? state.filtersCollapsed : state.detailsCollapsed) === collapsed) return; // no-op guard
    set(panel === "filters" ? { filtersCollapsed: collapsed } : { detailsCollapsed: collapsed });
  },
  /** Drag/keyboard resize of the results table; null restores the responsive default. */
  setTableHeight(frac: number | null): void {
    const next = frac == null ? null : Math.min(TABLE_ROW_MAX, Math.max(TABLE_ROW_MIN, frac));
    if (state.tableHeightFrac === next) return; // no-op guard
    try {
      if (next == null) localStorage.removeItem("resst.tableHeight");
      else localStorage.setItem("resst.tableHeight", next.toFixed(4));
    } catch {
      /* storage unavailable — the size lasts for this session only */
    }
    set({ tableHeightFrac: next });
  },
  /** Open or close the results table (not persisted: every visit starts collapsed). */
  setTableCollapsed(collapsed: boolean): void {
    if (state.tableCollapsed === collapsed) return; // no-op guard
    set({ tableCollapsed: collapsed });
  },
  /** Drag/keyboard resize of the Selected Data panel; null restores the default width. */
  setDetailsWidth(px: number | null): void {
    const next = px == null ? null : Math.min(DETAILS_COL_MAX, Math.max(DETAILS_COL_MIN, Math.round(px)));
    if (state.detailsWidthPx === next) return; // no-op guard
    try {
      if (next == null) localStorage.removeItem("resst.detailsWidth");
      else localStorage.setItem("resst.detailsWidth", String(next));
    } catch {
      /* storage unavailable — the size lasts for this session only */
    }
    set({ detailsWidthPx: next });
  },
  setDownloadsOpen(open: boolean): void {
    set({ downloadsOpen: open });
  },
  /** Written by src/sediment/data.ts when a lazy bundle finishes loading. */
  bumpSedimentStamp(): void {
    set({ sedimentStamp: state.sedimentStamp + 1 });
  },
  setSedimentStatus(pack: SedimentPack, status: OverlayStatus | null): void {
    const cur = state.sedimentStatus[pack] ?? null;
    if (cur === status) return; // no-op guard, matches setOverlayStatus
    const next = { ...state.sedimentStatus };
    if (status === null) delete next[pack];
    else next[pack] = status;
    set({ sedimentStatus: next });
  },
  setNationalLayer(on: boolean): void {
    if (state.nationalLayer.on === on) return;
    // Turning the layer off also ends any screening session (the criteria
    // filter that layer — leaving them armed invisibly would be confusing)
    // and closes the Screening panel, which would otherwise switch it back on.
    set({
      nationalLayer: { ...state.nationalLayer, on },
      ...(on ? {} : { screening: EMPTY_SCREENING, screeningOpen: false }),
    });
  },
  setNationalMetric(metric: NationalMetric): void {
    if (state.nationalLayer.metric === metric) return;
    set({ nationalLayer: { ...state.nationalLayer, metric } });
  },
  setNetworkMode(mode: NetworkMode): void {
    if (state.networkView.mode === mode) return;
    set({ networkView: { ...state.networkView, mode } });
  },
  /** Toggle the USGS NLDI drainage-area boundary for the selected reservoir. */
  setNetworkBasin(on: boolean): void {
    if (state.networkView.basin === on) return;
    set({ networkView: { ...state.networkView, basin: on } });
  },
  /** Clear the network highlight AND the drainage-area boundary. */
  clearNetworkView(): void {
    if (state.networkView.mode === "none" && !state.networkView.basin) return;
    set({ networkView: { mode: "none", basin: false } });
  },
  /** Open one details-panel card (null closes it); opening one closes the
      others by construction. */
  setOpenSection(id: string | null): void {
    if (state.openSection === id) return;
    set({ openSection: id });
  },
  /** Replace the screening criteria. `active` follows the criteria: screening
      filters the map exactly while at least one criterion is set. */
  setScreeningCriteria(next: ScreeningState): void {
    set({ screening: { ...next, active: !isEmptyScreening(next) } });
  },
  /** Merge screening criteria. */
  setScreening(partial: Partial<ScreeningState>): void {
    actions.setScreeningCriteria({ ...state.screening, ...partial });
  },
  clearScreening(): void {
    set({ screening: EMPTY_SCREENING });
  },
  /** Open or close the docked Screening panel. */
  setScreeningOpen(open: boolean): void {
    if (state.screeningOpen === open) return;
    set({ screeningOpen: open });
  },
  /** Switch the top-level view. A mobile drawer belongs to the Map view, so it closes. */
  setView(view: View): void {
    if (state.view === view) return;
    set({ view, mobilePanel: null });
  },
  setDashboard(partial: Partial<DashboardState>): void {
    set({ dashboard: { ...state.dashboard, ...partial } });
  },
  /** Show one Dashboard topic (its headline tile is the tab). The first
      switch retires the tiles' hint. */
  setDashboardTopic(topic: DashTopic): void {
    if (state.dashboard.topic === topic) return;
    const h = state.dashboard.hints;
    set({ dashboard: { ...state.dashboard, topic, hints: h.topics ? { ...h, topics: false } : h } });
  },
  /** Open, change or (null) close one topic's drill-down; the others stay.
      The first one opened in a topic retires that topic's chart hint;
      closing one does not. */
  setDashboardDrill(topic: DashTopic, drill: DashDrill | null): void {
    const drills = { ...state.dashboard.drills };
    if (drill) drills[topic] = drill;
    else delete drills[topic];
    const h = state.dashboard.hints;
    const hints = drill && h.explore[topic] ? { ...h, explore: { ...h.explore, [topic]: false } } : h;
    set({ dashboard: { ...state.dashboard, drills, hints } });
  },
  setLibrary(partial: Partial<LibraryState>): void {
    set({ library: { ...state.library, ...partial } });
  },
  /** Add or remove one facet value (matched case-insensitively). */
  toggleLibraryFacet(field: string, value: string): void {
    const cur = state.library.facets[field] ?? [];
    const key = value.toLowerCase();
    const next = cur.some((v) => v.toLowerCase() === key) ? cur.filter((v) => v.toLowerCase() !== key) : [...cur, value];
    const facets = { ...state.library.facets };
    if (next.length > 0) facets[field] = next;
    else delete facets[field];
    set({ library: { ...state.library, facets } });
  },
  /** Clear every search criterion; the sort order, the open publication and
      the open filter group stay. */
  clearLibrary(): void {
    const { sort, openLitId, openGroup } = state.library;
    set({ library: { ...EMPTY_LIBRARY, sort, openLitId, openGroup } });
  },
  /** Open the Library on a fresh search seeded from elsewhere (a Dashboard
      slice, a site): everything else is cleared. `group` opens the filter
      group that holds the seeded keyword, so its tick is in view. */
  openLibrary(seed: { facet?: { field: string; value: string }; scope?: LitScope; siteId?: string | null; group?: string | null }): void {
    set({
      view: "library",
      mobilePanel: null,
      library: {
        ...EMPTY_LIBRARY,
        sort: state.library.sort,
        scope: seed.scope ?? "all",
        siteId: seed.siteId ?? null,
        facets: seed.facet ? { [seed.facet.field]: [seed.facet.value] } : {},
        openGroup: seed.group !== undefined ? seed.group : state.library.openGroup,
      },
    });
  },
  closeWelcome(dontShowAgain: boolean): void {
    if (dontShowAgain) {
      try {
        localStorage.setItem("resst.hideWelcome", "1");
      } catch {
        /* storage unavailable — dialog simply reappears next visit */
      }
    }
    set({ welcomeOpen: false });
  },
};
