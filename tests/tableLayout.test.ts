// Results-table layout state (src/state/store.ts): the clamped height parser
// and the persistence discipline of setTableHeight/setTableCollapsed.
import { describe, expect, it, vi } from "vitest";
import {
  actions,
  getState,
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
