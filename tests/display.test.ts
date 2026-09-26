// Selected Data panel display helpers (src/lib/display.ts): keyword chips,
// literature source links, and NID values with units.
import { describe, expect, it } from "vitest";
import { formatNidValue, literatureLink, splitKeywords, tidyList } from "../src/lib/display";

describe("tidyList", () => {
  it("puts a space after list commas", () => {
    expect(tidyList("USACE,Kansas City District")).toBe("USACE, Kansas City District");
    expect(tidyList(" DOD ;  CE , Rock Island District ")).toBe("DOD ;  CE, Rock Island District");
    expect(tidyList(undefined)).toBe("");
  });
});

describe("splitKeywords", () => {
  it("splits, trims, and drops blanks and Not Applicable", () => {
    expect(splitKeywords("Sand Bars,Water Quality")).toEqual(["Sand Bars", "Water Quality"]);
    expect(splitKeywords(" Field Monitoring , 2D Sediment ,")).toEqual(["Field Monitoring", "2D Sediment"]);
    expect(splitKeywords("Not Applicable")).toEqual([]);
    expect(splitKeywords("not applicable,Drawdown")).toEqual(["Drawdown"]);
    expect(splitKeywords("")).toEqual([]);
    expect(splitKeywords(null)).toEqual([]);
  });

  it("dedupes ignoring case, keeping the first spelling", () => {
    expect(splitKeywords("Flood control,Water supply,Flood Control")).toEqual(["Flood control", "Water supply"]);
  });
});

describe("literatureLink", () => {
  it("links URLs as they are", () => {
    expect(literatureLink("https://doi.org/10.1061/9780784408148.ch15")).toEqual({
      href: "https://doi.org/10.1061/9780784408148.ch15",
    });
    expect(literatureLink("http://pubs.usgs.gov/sir/2010/5001/")).toEqual({ href: "http://pubs.usgs.gov/sir/2010/5001/" });
  });

  it("turns bare and DOI:-prefixed DOIs into doi.org links", () => {
    expect(literatureLink("10.1201/9781420004113")).toEqual({ href: "https://doi.org/10.1201/9781420004113" });
    expect(literatureLink("DOI:10.1201/9781420004113")).toEqual({ href: "https://doi.org/10.1201/9781420004113" });
    expect(literatureLink("doi: 10.1029/2005WR004131")).toEqual({ href: "https://doi.org/10.1029/2005WR004131" });
  });

  it("keeps other identifiers as text, and nothing for blanks", () => {
    expect(literatureLink("EM 1110-2-1602")).toEqual({ id: "EM 1110-2-1602" });
    expect(literatureLink("  ")).toEqual({});
    expect(literatureLink(undefined)).toEqual({});
  });
});

describe("formatNidValue", () => {
  it("puts units on measurements with thousands separators", () => {
    expect(formatNidValue("nid_height", "157")).toBe("157 ft");
    expect(formatNidValue("dam_length", "4500")).toBe("4,500 ft");
    expect(formatNidValue("nid_storage", "2257000")).toBe("2,257,000 ac-ft");
    expect(formatNidValue("surface_area", "13350")).toBe("13,350 acres");
    expect(formatNidValue("drainage_area", "9628.4")).toBe("9,628.4 sq mi");
  });

  it("omits blanks, Not Available and zero measurements", () => {
    expect(formatNidValue("max_discharge", "0")).toBe("");
    expect(formatNidValue("condition_assessment", "Not Available")).toBe("");
    expect(formatNidValue("hazard_potential", "")).toBe("");
    expect(formatNidValue("nid_height", undefined)).toBe("");
  });

  it("passes text fields and unparseable numbers through", () => {
    expect(formatNidValue("hazard_potential", "High")).toBe("High");
    expect(formatNidValue("year_completed", "1963")).toBe("1963");
    expect(formatNidValue("nid_height", "unknown")).toBe("unknown");
  });
});
