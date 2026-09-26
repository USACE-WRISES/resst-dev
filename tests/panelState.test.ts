// Selected Data panel and Screening state (src/state/store.ts): one open card
// at a time, the Comparable Reservoirs Back link, the network-view reset,
// the Screening panel's open state, and `active` derived from the criteria.
import { describe, expect, it, vi } from "vitest";
import { EMPTY_LIBRARY, actions, dropDrill, getMapViewState, getState } from "../src/state/store";
import { EMPTY_SCREENING, GAP_PRESETS, withPreset } from "../src/sediment/screen";

describe("openSection", () => {
  it("holds exactly one open card and survives selection changes", () => {
    actions.setOpenSection("sust");
    actions.setOpenSection("evid"); // opening a second card closes the first by construction
    expect(getState().openSection).toBe("evid");
    actions.selectSite("some-site");
    expect(getState().openSection).toBe("evid");
    actions.setOpenSection(null);
    expect(getState().openSection).toBeNull();
    actions.clearSelection();
  });
});

describe("openComparable / goBack", () => {
  it("remembers the origin, lands on Sediment Management, and Back restores both", () => {
    actions.selectSite("tuttle-creek");
    actions.setOpenSection("sim");
    actions.openComparable(
      { siteId: "fall-creek" },
      { siteId: "tuttle-creek", reservoirId: null, label: "Tuttle Creek", openSection: "sim" },
    );
    expect(getState()).toMatchObject({ selectedSiteIds: ["fall-creek"], selectedReservoirId: null, openSection: "mgmt" });
    expect(getState().returnTo?.label).toBe("Tuttle Creek");

    actions.goBack();
    expect(getState()).toMatchObject({ selectedSiteIds: ["tuttle-creek"], openSection: "sim", returnTo: null });
  });

  it("a national reservoir arrives with every card closed", () => {
    actions.openComparable({ reservoirId: "30" }, { siteId: "tuttle-creek", reservoirId: null, label: "Tuttle Creek", openSection: "sim" });
    expect(getState()).toMatchObject({ selectedSiteIds: [], selectedReservoirId: "30", openSection: null });
  });

  it("any other selection change forgets the Back target", () => {
    actions.openComparable({ reservoirId: "30" }, { siteId: "tuttle-creek", reservoirId: null, label: "Tuttle Creek", openSection: "sim" });
    actions.selectReservoir("20");
    expect(getState().returnTo).toBeNull();
    actions.openComparable({ siteId: "x" }, { siteId: null, reservoirId: "20", label: "Upstream Dam", openSection: "sim" });
    actions.clearSelection();
    expect(getState().returnTo).toBeNull();
  });
});

describe("panel collapse", () => {
  it("a multi-site selection opens Selected Data; a single site leaves it to the popup", () => {
    actions.setPanelCollapsed("details", true);
    actions.selectSite("tuttle-creek");
    expect(getState().detailsCollapsed).toBe(true); // one site: the popup offers Show details
    actions.selectSites(["tuttle-creek", "tuttle-creek"]); // dedupes to one
    expect(getState().detailsCollapsed).toBe(true);
    actions.selectSites(["tuttle-creek", "fall-creek"]);
    expect(getState().detailsCollapsed).toBe(false);
    actions.clearSelection();
  });

  it("a live refinement opens Selected Data once, when the selection first grows past one site", () => {
    actions.selectSite("tuttle-creek");
    actions.setPanelCollapsed("details", true);
    actions.selectSites(["tuttle-creek", "fall-creek"], { live: true }); // one site to two: opens
    expect(getState().detailsCollapsed).toBe(false);
    actions.setPanelCollapsed("details", true); // closed mid-refinement...
    actions.selectSites(["tuttle-creek", "fall-creek", "milford"], { live: true });
    expect(getState().detailsCollapsed).toBe(true); // ...stays closed
    actions.selectSites(["tuttle-creek", "fall-creek"]); // a new gesture opens it again
    expect(getState().detailsCollapsed).toBe(false);
    actions.clearSelection();
  });

  it("does not emit when a panel is already in the asked state", () => {
    actions.setPanelCollapsed("filters", true);
    const before = getState();
    actions.setPanelCollapsed("filters", true);
    expect(getState()).toBe(before);
  });
});

describe("clearNetworkView", () => {
  it("clears the highlight mode and the drainage area together", () => {
    actions.selectSite("tuttle-creek");
    actions.setNetworkMode("up");
    actions.setNetworkBasin(true);
    actions.clearNetworkView();
    expect(getState().networkView).toEqual({ mode: "none", basin: false });
    actions.clearSelection();
  });
});

describe("views", () => {
  it("boots on the Map view without a browser location and switches with a no-op guard", () => {
    expect(getState().view).toBe("map");
    // Every page load shows every hint.
    expect(getState().dashboard.hints).toEqual({ topics: true, explore: { sites: true, literature: true, screening: true, capacity: true } });
    actions.setMobilePanel("details");
    actions.setView("dashboard");
    expect(getState()).toMatchObject({ view: "dashboard", mobilePanel: null }); // a drawer belongs to the map
    const before = getState();
    actions.setView("dashboard");
    expect(getState()).toBe(before); // no emit for the same view
    actions.setView("map");
  });

  it("merges Dashboard state and switches its topic", () => {
    expect(getState().dashboard).toMatchObject({ topic: "sites", siteDim: "sediment_release", drills: {} });
    actions.setDashboard({ litScope: "general" });
    expect(getState().dashboard).toMatchObject({ topic: "sites", litScope: "general" });
    actions.setDashboardTopic("capacity");
    expect(getState().dashboard.topic).toBe("capacity");
    const before = getState();
    actions.setDashboardTopic("capacity");
    expect(getState()).toBe(before); // no emit for the same topic
    actions.setDashboard({ topic: "sites", litScope: "all" });
  });

  it("keeps one drill-down per topic, so switching tabs keeps each", () => {
    actions.setDashboardDrill("sites", { card: "sites", key: "dam removal", dim: null });
    actions.setDashboardDrill("capacity", { card: "state", key: "KS", dim: null });
    actions.setDashboardDrill("sites", { card: "sites", key: "dam removal", dim: "analysis" });
    expect(getState().dashboard.drills).toEqual({
      sites: { card: "sites", key: "dam removal", dim: "analysis" },
      capacity: { card: "state", key: "KS", dim: null },
    });
    actions.setDashboardDrill("capacity", null); // closing one leaves the other
    expect(getState().dashboard.drills).toEqual({ sites: { card: "sites", key: "dam removal", dim: "analysis" } });
    expect(dropDrill(getState().dashboard.drills, "sites")).toEqual({});
    actions.setDashboardDrill("sites", null);
    expect(getState().dashboard.drills).toEqual({});
  });

  it("retires the tiles' hint at the first topic switch and each chart hint at its own topic's first drill, storing nothing", () => {
    const ls = { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn() };
    vi.stubGlobal("localStorage", ls);
    const all = { sites: true, literature: true, screening: true, capacity: true };
    actions.setDashboard({ hints: { topics: true, explore: all } });
    actions.setDashboardDrill("sites", null); // closing a drill teaches nothing
    expect(getState().dashboard.hints).toEqual({ topics: true, explore: all });
    actions.setDashboardDrill("sites", { card: "sites", key: "dam removal", dim: null });
    const afterSites = getState().dashboard.hints;
    expect(afterSites.explore).toEqual({ ...all, sites: false }); // the other topics keep theirs
    actions.setDashboardDrill("sites", { card: "sites", key: "diversion", dim: null });
    expect(getState().dashboard.hints).toBe(afterSites); // already retired: unchanged
    actions.setDashboardDrill("capacity", { card: "state", key: "KS", dim: null });
    expect(getState().dashboard.hints.explore).toEqual({ ...all, sites: false, capacity: false });
    const topic = getState().dashboard.topic;
    actions.setDashboardTopic(topic); // the open topic: a no-op
    expect(getState().dashboard.hints.topics).toBe(true);
    actions.setDashboardTopic(topic === "literature" ? "sites" : "literature");
    expect(getState().dashboard.hints.topics).toBe(false);
    expect(ls.setItem).not.toHaveBeenCalled(); // so the next page load shows them all again
    vi.unstubAllGlobals();
    actions.setDashboard({ topic: "sites", drills: {}, hints: { topics: true, explore: all } });
  });

  it("toggles Library facets case-insensitively; Clear all keeps the sort, the open publication and the open group", () => {
    expect(EMPTY_LIBRARY).toMatchObject({ sort: { key: "year", dir: "desc" }, openGroup: "Document type" });
    const sort = { key: "title", dir: "asc" } as const;
    actions.setLibrary({ query: "tuttle", sort, openLitId: "L0001", scope: "site", openGroup: "Focus" });
    actions.toggleLibraryFacet("document_type", "Journal Article");
    actions.toggleLibraryFacet("purpose", "Analysis");
    expect(getState().library.facets).toEqual({ document_type: ["Journal Article"], purpose: ["Analysis"] });
    actions.toggleLibraryFacet("document_type", "journal article");
    expect(getState().library.facets).toEqual({ purpose: ["Analysis"] });
    actions.clearLibrary();
    expect(getState().library).toEqual({ ...EMPTY_LIBRARY, sort, openLitId: "L0001", openGroup: "Focus" });
  });

  it("opens the Library on a seeded search and nothing else, with the seeded keyword's group open", () => {
    actions.setLibrary({ query: "old", facets: { purpose: ["Design"] }, openGroup: "Decade" });
    actions.openLibrary({ facet: { field: "modeling", value: "Regression" }, scope: "general", group: "Methods" });
    expect(getState().view).toBe("library");
    expect(getState().library).toMatchObject({ query: "", scope: "general", facets: { modeling: ["Regression"] }, siteId: null, openGroup: "Methods" });
    actions.openLibrary({ siteId: "tuttle-creek" }); // no group: the open one stays
    expect(getState().library).toMatchObject({ scope: "all", facets: {}, siteId: "tuttle-creek", openGroup: "Methods" });
    actions.setLibrary({ ...EMPTY_LIBRARY });
    actions.setView("map");
  });

  it("the Map view's snapshot ignores the pages' own state and the view", () => {
    const before = getMapViewState();
    actions.setLibrary({ openLitId: "L0002" });
    actions.setDashboard({ litDim: "modeling" });
    expect(getMapViewState()).toBe(before); // a click in the Library or on the Dashboard: no Map re-render
    expect(getMapViewState().library).not.toBe(getState().library);
    actions.setView("library");
    actions.setView("dashboard");
    expect(getMapViewState()).toBe(before); // a switch between views: no Map re-render (MapView reads the view itself)
    actions.setView("map");
    actions.selectSite("tuttle-creek");
    const after = getMapViewState();
    expect(after).not.toBe(before);
    expect(after).toBe(getState());
    expect(after.selectedSiteIds).toEqual(["tuttle-creek"]);
    actions.clearSelection();
    actions.setLibrary({ ...EMPTY_LIBRARY });
    actions.setDashboard({ litDim: "purpose" });
  });
});

describe("screening state", () => {
  it("active follows the criteria, so resetting everything to Any ends screening", () => {
    actions.setScreeningCriteria(withPreset(EMPTY_SCREENING, GAP_PRESETS[1]));
    expect(getState().screening.active).toBe(true);
    actions.setScreening({ documented: "any", pctLost2025Min: null });
    expect(getState().screening.active).toBe(false);
    actions.setScreening({ state: 3 });
    expect(getState().screening.active).toBe(true);
    actions.clearScreening();
    expect(getState().screening).toEqual(EMPTY_SCREENING);
  });

  it("turning the national layer off closes the panel and clears the criteria", () => {
    actions.setNationalLayer(true);
    actions.setScreeningOpen(true);
    actions.setScreening({ terminalOnly: true });
    actions.setNationalLayer(false);
    expect(getState().screeningOpen).toBe(false);
    expect(getState().screening).toEqual(EMPTY_SCREENING);
  });
});
