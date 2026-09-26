// Map popup bodies (src/map/popupHtml.ts): the documented-site card (who and
// where, purpose + NID ID, the three team-documented fields, the modeled loss
// and the reference count) and the national-reservoir card.
import { describe, expect, it } from "vitest";
import { popupHtml, reservoirPopupHtml } from "../src/map/popupHtml";
import { decodeCore } from "../src/sediment/decode";
import type { Site } from "../src/lib/types";
import type { SiteSedimentLink } from "../src/sediment/types";

const SITE: Site = {
  site_id: "tuttle-creek",
  site_name: "Tuttle Creek",
  nid_id: "KS00012",
  responsible_districtagency: "USACE,Kansas City District",
  address: "West Campground Drive, Kansas",
  city: "Manhattan, KS",
  site_type: "Flood control,Water supply",
  sediment_release: "Water Injection Dredging",
  ecological_concern: "Sand Bars,Water Quality",
  analysis: "Field Monitoring,2D Sediment",
  longitude: -96.59,
  latitude: 39.26,
};

const LINK: SiteSedimentLink = {
  site_id: "tuttle-creek",
  short_id: 10,
  nid: "KS00012",
  method: "nid",
  confidence: "high",
  cap_orig_m3: 1.2e9,
  cap2025_m3: 1.0e9,
  sed2025_m3: 2.0e8,
  sed2015_m3: 1.7e8,
  cap2050_m3: 8.5e8,
  sed2050_m3: 3.5e8,
  has_surveys: true,
  latest_survey_year: 2000,
};

/** Visible text with tags collapsed to single separators. */
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, "|")
    .replace(/\|+/g, "|")
    .replace(/^\||\|$/g, "");
const rowLabels = (html: string) => [...html.matchAll(/class="popup-row"><span>([^<]*)<\/span>/g)].map((m) => m[1]);

describe("popupHtml (documented site)", () => {
  it("leads with who and where, then purpose and NID ID", () => {
    const t = text(popupHtml(SITE, { references: 6, link: LINK }));
    expect(t).toContain("Tuttle Creek|Manhattan, KS · USACE, Kansas City District|Flood control, Water supply · NID KS00012");
  });

  it("lists the three team-documented fields in order", () => {
    const html = popupHtml(SITE, { references: 6, link: LINK });
    expect(rowLabels(html)).toEqual(["Sediment release", "Ecological concern", "Analysis"]);
    expect(text(html)).toContain("Ecological concern|Sand Bars, Water Quality");
  });

  it("ends with the modeled loss and the reference count", () => {
    const t = text(popupHtml(SITE, { references: 6, link: LINK }));
    expect(t).toContain("17%| capacity lost by 2025 |(modeled)");
    expect(t).toContain("6 references|Show details"); // the button shares the facts row
    expect(t).toContain("6 references");
    expect(text(popupHtml(SITE, { references: 1, link: null }))).toContain("1 reference");
  });

  it("says so plainly when a field or a number is missing", () => {
    const bare = { ...SITE, sediment_release: "Not Applicable", analysis: "", nid_id: "", site_type: "" };
    const html = popupHtml(bare, { references: 0, link: null });
    expect(html).toContain('<span class="popup-none">Not applicable</span>');
    expect(html).toContain('<span class="popup-none">Not recorded</span>');
    expect(text(html)).toContain("No linked references");
    expect(html).not.toContain("capacity lost");
    expect(html).not.toContain("NID ");
  });

  it("escapes site text", () => {
    expect(popupHtml({ ...SITE, site_name: "A <b>&</b> B" }, { references: 0, link: null })).toContain(
      "A &lt;b&gt;&amp;&lt;/b&gt; B",
    );
  });
});

describe("reservoirPopupHtml (national reservoir)", () => {
  const core = decodeCore({
    _meta: { trajSpan: 1, trajChunks: 1 },
    n: 2,
    dicts: { state: ["Kansas"], owner: ["Federal"], purpose: ["Flood Control"], storSrc: ["NID"] },
    cols: {
      id: [-5, 30],
      name: ["Big River", "Lone Reservoir"],
      nid: ["MOUTH_BigR", "KS90002"],
      lon: [-96.6, -96.45],
      lat: [39.1, 39.05],
      state: [-1, 0],
      owner: [-1, 0],
      purpose: [-1, 0],
      storSrc: [-1, 0],
      yrc: [0, 1990],
      flags: [1, 2 | 4],
      to: [-1, -1],
      deltaTag: [0, 0],
      maxStor: [null, 1e7],
      da: [26000, 40],
      sca: [20000, 40],
      capOrig: [null, 1e7],
      cap2025: [null, 9e6],
      cap2050: [null, 8.4e6],
      sed2015: [null, 6e5],
      sed2025: [null, 1e6],
      sed2050: [null, 1.6e6],
      evd: [0, 2],
    },
  });

  it("shows the place, the loss, storage and evidence, and flags the missing record", () => {
    const html = reservoirPopupHtml(core, 1);
    expect(text(html)).toContain("Lone Reservoir|Kansas · Federal · Flood Control · Built 1990");
    expect(rowLabels(html)).toEqual(["Est. capacity lost (2025)", "Max storage", "Evidence"]);
    expect(text(html)).toContain("Est. capacity lost (2025)|10%");
    expect(text(html)).toContain("Evidence|Modeled only");
    expect(text(html)).toContain("No documented RESST record");
  });
});
