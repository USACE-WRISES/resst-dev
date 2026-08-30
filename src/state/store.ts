// Minimal typed app store — a single external snapshot consumed via React's
// useSyncExternalStore. Deliberately not a state library (assessment §9):
// the whole app state is filters + selection + a few UI toggles.

import { useSyncExternalStore } from "react";
import type { FilterState } from "../filters/engine";
import { FILTER_DEFS } from "../config/filters.generated";
import { emptyItemState } from "../filters/engine";
import type { TabId } from "../config/tabs";
import { EMPTY_SCREENING, type ScreeningState } from "../sediment/screen";

export type OverlayStatus = "loading" | "ready" | "error";

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
export const DETAILS_COL_MAX = 620;
/** Persisted Selected Data panel width in px (desktop only — the drawers own
    narrow screens). Unparseable → the stylesheet's 320px track (null). */
export const parseDetailsWidth = (raw: string | null): number | null => {
  if (raw == null || raw.trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.min(DETAILS_COL_MAX, Math.max(DETAILS_COL_MIN, Math.round(n)));
};

export interface AppState {
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
  /** Esri basemap swap status — null when idle or complete. */
  basemapStatus: "loading" | "error" | null;
  /** Which side panel is open as a drawer on narrow screens. */
  mobilePanel: "filters" | "details" | null;
  /** Desktop-only side-panel collapse (the drawers take over on narrow screens). */
  filtersCollapsed: boolean;
  detailsCollapsed: boolean;
  /** Results-table split: fraction of the center stack given to the table
      (null = the responsive stylesheet default — 46%, 52% on phones). */
  tableHeightFrac: number | null;
  /** Results table collapsed to the half-pill tab (all breakpoints). */
  tableCollapsed: boolean;
  /** Selected Data panel width in px (null = the stylesheet's 320px track). */
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
  /** Details-panel collapsible sections: section id -> open override. */
  panelSections: Record<string, boolean>;
}

const initialFilters = (): FilterState =>
  Object.fromEntries(FILTER_DEFS.map((d) => [d.key, emptyItemState()]));

let state: AppState = {
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
  basemapStatus: null,
  mobilePanel: null,
  filtersCollapsed: false,
  detailsCollapsed: false,
  tableHeightFrac: (() => {
    try {
      return parseTableHeight(localStorage.getItem("resst.tableHeight"));
    } catch {
      return null;
    }
  })(),
  tableCollapsed: (() => {
    try {
      return localStorage.getItem("resst.tableCollapsed") === "1";
    } catch {
      return false;
    }
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
  panelSections: {},
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
    });
  },
  /** Multi-selection from the map Select tools. Dedupes and touches nothing
      else beyond the selection invariant — tool sessions disarm explicitly
      via setMapTool. */
  selectSites(siteIds: string[]): void {
    set({ selectedSiteIds: [...new Set(siteIds)], selectedReservoirId: null, networkView: { mode: "none", basin: false } });
  },
  /** National-inventory reservoir selection (non-documented dams). Clears any
      site selection — at most one selection model is active at a time. */
  selectReservoir(shortId: string | null): void {
    set({
      selectedReservoirId: shortId,
      selectedSiteIds: [],
      showSelectionOnly: false,
      networkView: { mode: "none", basin: false },
    });
  },
  clearSelection(): void {
    set({ selectedSiteIds: [], showSelectionOnly: false, selectedReservoirId: null, networkView: { mode: "none", basin: false } });
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
  /** Failure revert: show `id` WITHOUT persisting it, and forget the stored
      choice so the next visit retries the default basemap. */
  revertBasemap(id: BasemapId): void {
    try {
      localStorage.removeItem("resst.basemap");
    } catch {
      /* storage unavailable — nothing was persisted anyway */
    }
    if (state.basemap === id) return;
    set({ basemap: id });
  },
  /** Written by the basemap swap in map/basemaps.ts; null clears it. */
  setBasemapStatus(status: "loading" | "error" | null): void {
    if (state.basemapStatus === status) return; // no-op guard, matches setOverlayStatus
    set({ basemapStatus: status });
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
  setTableCollapsed(collapsed: boolean): void {
    if (state.tableCollapsed === collapsed) return; // no-op guard
    try {
      if (collapsed) localStorage.setItem("resst.tableCollapsed", "1");
      else localStorage.removeItem("resst.tableCollapsed");
    } catch {
      /* storage unavailable — persists for this session only */
    }
    set({ tableCollapsed: collapsed });
  },
  /** Drag/keyboard resize of the Selected Data panel; null restores the 320px default. */
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
    // filter that layer — leaving them armed invisibly would be confusing).
    set({ nationalLayer: { ...state.nationalLayer, on }, ...(on ? {} : { screening: EMPTY_SCREENING }) });
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
  /** Collapsible details-panel sections (session-only; survives the pager). */
  setPanelSection(id: string, open: boolean): void {
    set({ panelSections: { ...state.panelSections, [id]: open } });
  },
  /** Merge screening criteria (marks the session active unless told otherwise). */
  setScreening(partial: Partial<ScreeningState>): void {
    set({ screening: { ...state.screening, active: true, ...partial } });
  },
  /** Replace the whole criteria set (the gap-analysis presets). */
  applyScreeningPreset(criteria: Partial<ScreeningState>): void {
    set({ screening: { ...EMPTY_SCREENING, ...criteria, active: true } });
  },
  clearScreening(): void {
    set({ screening: EMPTY_SCREENING });
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
