// Content guards for the Help system and the expansion's terminology rules:
// no bare "Current Storage" anywhere (users could read it as today's water
// volume — the ideas doc's naming rule), the workflow structure is complete,
// the citations are present, and every referenced screenshot exists on disk.
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HELP_VIEWS } from "../src/config/helpContent";

const allText = JSON.stringify(HELP_VIEWS);

describe("help content", () => {
  it("has the five workflows plus About, each structurally complete", () => {
    expect(HELP_VIEWS.map((v) => v.name)).toEqual([
      "About",
      "Assess a Reservoir",
      "Find Analogs",
      "Screen Nationally",
      "By Region & River",
      "By Category",
    ]);
    for (const v of HELP_VIEWS.slice(1)) {
      expect(v.facets, v.id).toBeDefined();
      expect(v.steps!.length, v.id).toBeGreaterThanOrEqual(5);
    }
  });

  it('never says bare "Current Storage" (values are Estimated/Projected)', () => {
    expect(allText).not.toMatch(/current storage/i);
  });

  it("keeps the never-needs-intervention and schematic-path guardrails", () => {
    expect(allText).toContain("never a statement that a reservoir needs intervention");
    expect(allText).toContain("schematic, not the river course");
  });

  it("credits cite RATTES, ResNet, and RESSED with DOIs", () => {
    const credits = HELP_VIEWS[0].credits!.join(" ");
    expect(credits).toContain("RATTES v1.2");
    expect(credits).toContain("10.1038/s41467-026-76986-3");
    expect(credits).toContain("ResNet");
    expect(credits).toContain("10.1038/s41597-025-06315-8");
    expect(credits).toContain("RESSED");
    expect(credits).toContain("water.usgs.gov/osw/ressed");
  });

  it("every referenced screenshot exists under public/", () => {
    for (const v of HELP_VIEWS) {
      if (!v.image) continue;
      expect(existsSync(`public/${v.image.src}`), v.image.src).toBe(true);
    }
  });
});
