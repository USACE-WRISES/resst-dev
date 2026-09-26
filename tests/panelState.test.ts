// Selected Data panel and Screening state (src/state/store.ts): one open card
// at a time, the Comparable Reservoirs Back link, the network-view reset,
// the Screening panel's open state, and `active` derived from the criteria.
import { describe, expect, it } from "vitest";
import { actions, getState } from "../src/state/store";
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
