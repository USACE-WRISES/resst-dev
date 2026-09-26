// The view switch's URL hashes (src/state/viewRoute.ts): only the three views
// parse, so the skip link's #results-table and any stray hash are left alone.
import { describe, expect, it } from "vitest";
import { VIEWS, parseViewHash, viewHash } from "../src/state/viewRoute";

describe("viewRoute", () => {
  it("parses the view hashes, case-insensitively, with or without a slash", () => {
    expect(parseViewHash("#dashboard")).toBe("dashboard");
    expect(parseViewHash("#Library")).toBe("library");
    expect(parseViewHash("#/dashboard")).toBe("dashboard");
    expect(parseViewHash("#map")).toBe("map");
  });

  it("returns null for everything that is not a view", () => {
    expect(parseViewHash("")).toBeNull();
    expect(parseViewHash("#")).toBeNull();
    expect(parseViewHash("#results-table")).toBeNull();
    expect(parseViewHash("#dashboard2")).toBeNull();
  });

  it("names each view's hash, the Map view as the bare URL, and round-trips", () => {
    expect(viewHash("map")).toBe("");
    expect(viewHash("dashboard")).toBe("#dashboard");
    expect(viewHash("library")).toBe("#library");
    for (const v of VIEWS) expect(parseViewHash(viewHash(v)) ?? "map").toBe(v);
  });
});
