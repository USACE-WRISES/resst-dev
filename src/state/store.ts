// Minimal typed app store — a single external snapshot consumed via React's
// useSyncExternalStore. Deliberately not a state library (assessment §9):
// the whole app state is filters + selection + a few UI toggles.

import { useSyncExternalStore } from "react";
import type { FilterState } from "../filters/engine";
import { FILTER_DEFS } from "../config/filters.generated";
import { emptyItemState } from "../filters/engine";
import type { TabId } from "../config/tabs";

export interface AppState {
  filters: FilterState;
  /** Selected sites — one from a click, several from the box-select tool. */
  selectedSiteIds: string[];
  activeTab: TabId;
  /** Per-tab quick-search text. */
  tabSearch: Partial<Record<TabId, string>>;
  /** Table option: show only rows belonging to the selection. */
  showSelectionOnly: boolean;
  /** Box-select tool armed on the map. */
  boxSelectActive: boolean;
  /** Reference overlay visibility by overlay key (all off by default). */
  overlays: Record<string, boolean>;
  /** Which side panel is open as a drawer on narrow screens. */
  mobilePanel: "filters" | "details" | null;
  /** Desktop-only side-panel collapse (the drawers take over on narrow screens). */
  filtersCollapsed: boolean;
  detailsCollapsed: boolean;
  helpOpen: boolean;
  downloadsOpen: boolean;
  welcomeOpen: boolean;
}

const initialFilters = (): FilterState =>
  Object.fromEntries(FILTER_DEFS.map((d) => [d.key, emptyItemState()]));

let state: AppState = {
  filters: initialFilters(),
  selectedSiteIds: [],
  activeTab: "sites",
  tabSearch: {},
  showSelectionOnly: false,
  boxSelectActive: false,
  overlays: {},
  mobilePanel: null,
  filtersCollapsed: false,
  detailsCollapsed: false,
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
  /** Single-site selection (map click, table row, search result). */
  selectSite(siteId: string | null): void {
    set({ selectedSiteIds: siteId ? [siteId] : [], showSelectionOnly: siteId ? state.showSelectionOnly : false });
  },
  /** Multi-selection from the box-select tool. */
  selectSites(siteIds: string[]): void {
    set({ selectedSiteIds: [...new Set(siteIds)], boxSelectActive: false });
  },
  clearSelection(): void {
    set({ selectedSiteIds: [], showSelectionOnly: false });
  },
  setShowSelectionOnly(on: boolean): void {
    set({ showSelectionOnly: on });
  },
  setBoxSelectActive(on: boolean): void {
    set({ boxSelectActive: on });
  },
  setOverlay(key: string, on: boolean): void {
    set({ overlays: { ...state.overlays, [key]: on } });
  },
  /** Apply a saved map view's overlay set (the caller also fits the extent). */
  setOverlays(overlays: Record<string, boolean>): void {
    set({ overlays });
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
  setDownloadsOpen(open: boolean): void {
    set({ downloadsOpen: open });
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
