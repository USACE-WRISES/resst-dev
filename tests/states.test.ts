// The state tile grid (src/dashboard/states.ts): one cell per state, inside
// the 8 × 12 grid, and a code for every inventory state name.
import { describe, expect, it } from "vitest";
import { GRID_COLS, GRID_ROWS, STATE_CODES, STATE_TILES, codeForName, stateName } from "../src/dashboard/states";

describe("state tiles", () => {
  it("place the 50 states, DC and Puerto Rico in distinct cells of the grid", () => {
    expect(STATE_TILES).toHaveLength(52);
    expect(new Set(STATE_TILES.map((t) => t.code)).size).toBe(52);
    expect(new Set(STATE_TILES.map((t) => `${t.row},${t.col}`)).size).toBe(52);
    for (const t of STATE_TILES) {
      expect(t.row).toBeGreaterThanOrEqual(1);
      expect(t.row).toBeLessThanOrEqual(GRID_ROWS);
      expect(t.col).toBeGreaterThanOrEqual(1);
      expect(t.col).toBeLessThanOrEqual(GRID_COLS);
    }
  });
  it("keep the familiar corners", () => {
    const at = (code: string) => STATE_TILES.find((t) => t.code === code)!;
    expect(at("AK")).toMatchObject({ row: 1, col: 1 });
    expect(at("ME")).toMatchObject({ row: 1, col: GRID_COLS });
    expect(at("HI")).toMatchObject({ row: GRID_ROWS, col: 1 });
    expect(at("FL").row).toBe(GRID_ROWS);
  });
  it("have a name for every code and a code for every name", () => {
    const codes = new Set(Object.values(STATE_CODES));
    expect(codes.size).toBe(52);
    for (const t of STATE_TILES) expect(codes.has(t.code)).toBe(true);
    expect(codeForName("Kansas")).toBe("KS");
    expect(codeForName("north carolina")).toBe("NC");
    expect(codeForName("Nowhere")).toBeNull();
    expect(stateName("KS")).toBe("Kansas");
    expect(stateName("ZZ")).toBe("ZZ");
  });
});
