// Results-table and Selected Data panel layout state (src/state/store.ts):
// the clamped size parsers and the persistence discipline of
// setTableHeight / setTableCollapsed / setDetailsWidth.
import { describe, expect, it, vi } from "vitest";
import {
  actions,
  DETAILS_COL_MAX,
  DETAILS_COL_MIN,
  getState,
  parseDetailsWidth,
  parseTableHeight,
  subscribe,
  TABLE_ROW_MAX,
  TABLE_ROW_MIN,
} from "../src/state/store";

describe("parseTableHeight", () => {
  it("clamps numbers and rejects garbage", () => {
    expect(parseTableHeight(null)).toBe(null);
    expect(parseTableHeight("")).toBe(null);
    expect(parseTableHeight("abc")).toBe(null);
    expect(parseTableHeight("Infinity")).toBe(null);
    expect(parseTableHeight("0.5")).toBe(0.5);
    expect(parseTableHeight("0.05")).toBe(TABLE_ROW_MIN);
    expect(parseTableHeight("9")).toBe(TABLE_ROW_MAX);
  });
});

describe("setTableHeight / setTableCollapsed", () => {
  it("clamps, persists, removes on reset, and no-ops on the same value", () => {
    const ls = { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn() };
    vi.stubGlobal("localStorage", ls);
    let emits = 0;
    const unsubscribe = subscribe(() => {
      emits += 1;
    });

    actions.setTableHeight(0.95); // clamps to the max
    expect(getState().tableHeightFrac).toBe(TABLE_ROW_MAX);
    expect(ls.setItem).toHaveBeenCalledWith("resst.tableHeight", TABLE_ROW_MAX.toFixed(4));
    expect(emits).toBe(1);

    actions.setTableHeight(TABLE_ROW_MAX); // same clamped value — no emit
    expect(emits).toBe(1);

    actions.setTableHeight(null); // reset: forget the stored value
    expect(getState().tableHeightFrac).toBe(null);
    expect(ls.removeItem).toHaveBeenCalledWith("resst.tableHeight");
    expect(emits).toBe(2);

    actions.setTableCollapsed(true);
    expect(getState().tableCollapsed).toBe(true);
    expect(ls.setItem).toHaveBeenCalledWith("resst.tableCollapsed", "1");
    actions.setTableCollapsed(true); // no-op
    expect(emits).toBe(3);
    actions.setTableCollapsed(false);
    expect(ls.removeItem).toHaveBeenCalledWith("resst.tableCollapsed");
    expect(emits).toBe(4);

    unsubscribe();
    vi.unstubAllGlobals();
  });
});

describe("parseDetailsWidth", () => {
  it("clamps to the drag range, rounds to whole pixels, and rejects garbage", () => {
    expect(parseDetailsWidth(null)).toBe(null);
    expect(parseDetailsWidth("")).toBe(null);
    expect(parseDetailsWidth("wide")).toBe(null);
    expect(parseDetailsWidth("Infinity")).toBe(null);
    expect(parseDetailsWidth("400")).toBe(400);
    expect(parseDetailsWidth("412.6")).toBe(413);
    expect(parseDetailsWidth("100")).toBe(DETAILS_COL_MIN);
    expect(parseDetailsWidth("9999")).toBe(DETAILS_COL_MAX);
  });
});

describe("setDetailsWidth", () => {
  it("clamps, persists, removes on reset, and no-ops on the same value", () => {
    const ls = { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn() };
    vi.stubGlobal("localStorage", ls);
    let emits = 0;
    const unsubscribe = subscribe(() => {
      emits += 1;
    });

    actions.setDetailsWidth(1000); // clamps to the max
    expect(getState().detailsWidthPx).toBe(DETAILS_COL_MAX);
    expect(ls.setItem).toHaveBeenCalledWith("resst.detailsWidth", String(DETAILS_COL_MAX));
    expect(emits).toBe(1);

    actions.setDetailsWidth(DETAILS_COL_MAX); // same clamped value — no emit
    expect(emits).toBe(1);

    actions.setDetailsWidth(400.4); // rounds to whole pixels
    expect(getState().detailsWidthPx).toBe(400);
    expect(ls.setItem).toHaveBeenLastCalledWith("resst.detailsWidth", "400");
    expect(emits).toBe(2);

    actions.setDetailsWidth(null); // reset: forget the stored value, back to the stylesheet default
    expect(getState().detailsWidthPx).toBe(null);
    expect(ls.removeItem).toHaveBeenCalledWith("resst.detailsWidth");
    expect(emits).toBe(3);

    unsubscribe();
    vi.unstubAllGlobals();
  });
});
