// Camera insets for the map chrome (src/map/viewInsets.ts), with the numbers
// measured at the e2e viewport: 1440×900 gives a ~770×443 map whose
// one-row toolbar ends 43px down (search box through Screening, x 10–587).
import { describe, expect, it } from "vitest";
import { fitPadding, popupShift, type Rect } from "../src/map/viewInsets";

const TOOLBAR: Rect = { left: 10, top: 10, right: 587, bottom: 43 };
const TWO_ROW_TOOLBAR: Rect = { left: 10, top: 10, right: 630, bottom: 80 }; // hint bar armed
const DOCK: Rect = { left: 10, top: 51, right: 350, bottom: 430 };

describe("popupShift", () => {
  it("leaves the camera alone when the popup already clears the toolbar", () => {
    // Site at y 221.5 needs 43 + 8 + 106 + 28 = 185 — it fits.
    expect(popupShift({ mapW: 770, mapH: 443, popupW: 280, popupH: 106, toolbar: TOOLBAR, dock: null })).toEqual({
      dx: 0,
      dy: 0,
    });
  });

  it("lowers the site just enough when the map is short (table at 70%)", () => {
    // 246px map: centre 123, the popup needs the site at y 185.
    expect(popupShift({ mapW: 770, mapH: 246, popupW: 280, popupH: 106, toolbar: TOOLBAR, dock: null })).toEqual({
      dx: 0,
      dy: 62,
    });
  });

  it("accounts for the second toolbar row while a Select tool is armed", () => {
    const { dy } = popupShift({ mapW: 770, mapH: 443, popupW: 280, popupH: 130, toolbar: TWO_ROW_TOOLBAR, dock: null });
    expect(dy).toBe(25); // needs y 80 + 8 + 130 + 28 = 246 against a 221.5 centre
  });

  it("keeps the marker inside a map too short for the popup", () => {
    const { dy } = popupShift({ mapW: 770, mapH: 150, popupW: 280, popupH: 106, toolbar: TOOLBAR, dock: null });
    expect(dy).toBe(150 - 12 - 75); // pinned 12px above the bottom edge
  });

  it("does not shift for a toolbar the popup does not overlap horizontally", () => {
    const narrow: Rect = { left: 10, top: 10, right: 150, bottom: 43 };
    expect(popupShift({ mapW: 770, mapH: 300, popupW: 280, popupH: 106, toolbar: narrow, dock: null }).dy).toBe(0);
  });

  it("moves the site right of an open dock when the map is wide enough", () => {
    // Popup left edge lands at dock right + 8 = 358: centre 498 vs 385.
    expect(popupShift({ mapW: 770, mapH: 443, popupW: 280, popupH: 106, toolbar: TOOLBAR, dock: DOCK })).toEqual({
      dx: 113,
      dy: 0,
    });
  });

  it("stays centred when there is no room beside the dock (1280px layout)", () => {
    expect(popupShift({ mapW: 610, mapH: 443, popupW: 280, popupH: 106, toolbar: TOOLBAR, dock: DOCK }).dx).toBe(0);
  });
});

describe("fitPadding", () => {
  it("keeps the old 60px padding at the default layout", () => {
    expect(fitPadding({ mapW: 770, mapH: 443, toolbar: TOOLBAR, dock: null })).toEqual({
      paddingTopLeft: [60, 60],
      paddingBottomRight: [60, 60],
    });
  });

  it("clears a two-row toolbar and an open dock", () => {
    expect(fitPadding({ mapW: 1000, mapH: 600, toolbar: TWO_ROW_TOOLBAR, dock: DOCK }).paddingTopLeft).toEqual([366, 96]);
  });

  it("caps every inset at 40% of the map so the fit scale never goes negative", () => {
    expect(fitPadding({ mapW: 400, mapH: 120, toolbar: TWO_ROW_TOOLBAR, dock: DOCK })).toEqual({
      paddingTopLeft: [160, 48],
      paddingBottomRight: [60, 48],
    });
  });
});
