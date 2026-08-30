// The Dam Report's frozen model builder: section presence per target kind,
// format.ts-derived display strings, null tolerance, and the copy guard that
// keeps authored report prose em-dash-free (table placeholders stay "—").
import { describe, expect, it } from "vitest";
import { decodeCore } from "../src/sediment/decode";
import { FLAG, type SiteSedimentLink, type SurveyObs, type Trajectory } from "../src/sediment/types";
import type { AppData, LiteratureEntry, NidRecord, Site } from "../src/lib/types";
import { buildReportModel, type ReportInputs, type ReportTarget } from "../src/report/reportModel";

// Same six-row network fixture as sedimentData.test.ts:
// mouth(0) ← Last Dam(1) ← Mid Dam(2) ← {Head A(3), Head B(4)}; Lone Dam(5).
const M = FLAG.MOUTH;
const T = FLAG.TERMINAL;
const H = FLAG.HEADWATER;
const FIXTURE_FLAGS = [M, T, 0, H, H, T | H];

function makeInventory() {
  const n = 6;
  const fill = (v: number | null) => new Array(n).fill(v);
  return {
    _meta: { trajSpan: 3, trajChunks: 2 },
    n,
    dicts: { state: ["Kansas"], owner: ["Federal"], purpose: ["Flood Control"], storSrc: ["NID"] },
    cols: {
      id: [-5, 10, 20, 30, 40, 50],
      name: ["Big River", "Last Dam", "Mid Dam", "Head A", "Head B", "Lone Dam"],
      nid: ["MOUTH_BigR", "KS00001", "KS00002", "KS00003", "KS00004", "KS00005"],
      lon: [-96.1, -96.2, -96.3, -96.4, -96.5, -97],
      lat: [39.1, 39.2, 39.3, 39.4, 39.5, 38],
      state: [-1, 0, 0, 0, 0, 0],
      owner: [-1, 0, 0, 0, 0, 0],
      purpose: [-1, 0, 0, 0, 0, 0],
      storSrc: [-1, 0, 0, 0, 0, 0],
      yrc: [0, 1950, 1962, 1970, 0, 1980],
      flags: FIXTURE_FLAGS.map((f, i) => (i === 0 ? f : f | FLAG.HAS_TRAJ)),
      to: [-1, 0, 1, 2, 2, -1],
      deltaTag: fill(0),
      maxStor: [null, 5e6, 2e6, 1e6, 1e6, 3e5],
      da: [1000, 900, 700, 200, 150, 50],
      sca: [800, 700, 500, 200, 150, null],
      capOrig: [null, 5e6, 2e6, 1e6, 1e6, 3e5],
      cap2025: [null, 4e6, 1.5e6, 9e5, 9.5e5, 2.5e5],
      cap2050: [null, 3.5e6, 1.2e6, 8.5e5, 9e5, 2.2e5],
      sed2015: [null, 8e5, 4e5, 8e4, 4e4, 4e4],
      sed2025: [null, 1e6, 5e5, 1e5, 5e4, 5e4],
      sed2050: [null, 1.5e6, 8e5, 1.5e5, 1e5, 8e4],
      evd: [0, 1, 2, 2, 2, 2],
    },
  };
}

const core = decodeCore(makeInventory());

const SITE: Site = {
  site_id: "last-dam",
  site_name: "Last Dam",
  nid_id: "KS00001",
  responsible_districtagency: "Kansas City District",
  address: "",
  city: "Manhattan",
  site_type: "Flood Control",
  sediment_release: "Drawdown Flushing",
  ecological_concern: "Turbidity",
  analysis: "Sediment transport modeling",
  longitude: -96.2,
  latitude: 39.2,
};

const ENTRIES: LiteratureEntry[] = [
  {
    entry_id: "E1",
    lit_id: "L1",
    site_id: "last-dam",
    site_name: "Last Dam",
    title: "Flushing at Last Dam",
    year: "2019",
    author: "Doe, J.",
    doi: "https://doi.org/10.0/x",
    document_type: "Journal Article",
  } as LiteratureEntry,
];

const NID: NidRecord = {
  nidid: "KS00001",
  name: "Last Dam",
  river_or_stream: "Big Blue",
  state: "KS",
  primary_purpose: "Flood Control",
  year_completed: "1950",
} as NidRecord;

const LINK: SiteSedimentLink = {
  site_id: "last-dam",
  short_id: 10,
  nid: "KS00001",
  method: "spatial_name",
  confidence: "medium",
  cap_orig_m3: 5e6,
  cap2025_m3: 4e6,
  sed2025_m3: 1e6,
  sed2015_m3: 8e5,
  cap2050_m3: 3.5e6,
  sed2050_m3: 1.5e6,
  has_surveys: true,
  latest_survey_year: 2000,
};

const TRAJ: Trajectory = {
  yr0: 1950,
  years: [1950, 2000, 2025, 2050],
  sedimentM3: [0, 5e5, 1e6, 1.5e6],
  capacityM3: [5e6, 4.5e6, 4e6, 3.5e6],
  ci: [
    { year: 2025, capHi: 4.2e6, capLo: 3.8e6, sedHi: null, sedLo: null },
    { year: 2050, capHi: 3.9e6, capLo: 3.1e6, sedHi: null, sedLo: null },
  ],
};

const SURVEYS: SurveyObs[] = [
  { year: 2000, date: "2000-07-01", pool: "S", method: "RNG", sub: "D", note: "", capM3: 4.4e6, areaM2: null, sedTotM3: 5e5, dryWtKgM3: null },
];

const DATA = {
  manifest: { generated: "2026-08-29T00:00:00Z", counts: {}, sha256: {} },
  siteByShortId: new Map([[10, "last-dam"]]),
  siteById: new Map([["last-dam", SITE]]),
} as unknown as AppData;

const siteTarget: ReportTarget = { kind: "site", site: SITE, entries: ENTRIES, nid: NID, link: LINK };

const baseInputs = (over: Partial<ReportInputs>): ReportInputs => ({
  target: siteTarget,
  data: DATA,
  core,
  row: 1,
  trajectory: TRAJ,
  surveys: SURVEYS,
  surveyProv: { ressedId: 32003, agency: "USDI; BR", supplier: "DOD; CE" },
  similar: { documented: [{ row: 2, score: 88 }], overall: [{ row: 5, score: 61 }] },
  generatedIso: "2026-08-30",
  ...over,
});

describe("buildReportModel: documented site with a crosswalk", () => {
  const m = buildReportModel(baseInputs({}));

  it("carries the header, identity, and team-collected sections", () => {
    expect(m.kicker).toBe("RESST Site Report");
    expect(m.reportId).toBe("last-dam");
    expect(m.identity).toContainEqual({ label: "NID ID", value: "KS00001" });
    expect(m.identity).toContainEqual({ label: "Coordinates", value: "39.2000, -96.2000" });
    expect(m.management).toContainEqual({ label: "Sediment Release", value: "Drawdown Flushing" });
    expect(m.literature![0]).toEqual({
      title: "Flushing at Last Dam",
      meta: "Doe, J. · 2019 · Journal Article",
      doi: "https://doi.org/10.0/x",
    });
  });

  it("derives sustainability strings through format.ts (20% lost, CI range on 2050)", () => {
    const stats = Object.fromEntries(m.sustainability!.stats.map((s) => [s.label, s.value]));
    expect(stats["Est. capacity lost (2025)"]).toBe("20%"); // 1e6 / 5e6
    expect(stats["Projected lost by 2050"]).toBe("30%");
    expect(stats["Original storage capacity"]).toBe("4.05k ac-ft");
    expect(stats["Projected capacity (2050)"]).toContain("(");
    expect(m.sustainability!.chart!.surveys).toEqual([{ year: 2000, capM3: 4.4e6 }]);
    expect(m.sustainability!.linkNote).toContain("medium confidence");
  });

  it("builds evidence lines, the datasheet link, and the survey-constrained class", () => {
    expect(m.evidence!.lines[0]).toBe("2000 (Jul) · measured capacity 3.57k ac-ft · interval sediment 405 ac-ft · range survey, detailed · sediment pool");
    expect(m.evidence!.datasheetUrl).toBe("https://water.usgs.gov/osw/ressed/datasheets/32-3.pdf");
    expect(m.evidence!.agencyLine).toBe("Surveys by USDI; BR. Data supplied by DOD; CE.");
    expect(m.evidence!.rattesClass).toBe(1);
  });

  it("computes the network and comparables from the core", () => {
    expect(m.network!.chips).toEqual(["Terminal dam"]);
    expect(m.network!.sentences[1]).toBe("This is the last dam before the river reaches its mouth (Big River).");
    expect(m.network!.flowPath).toBe("Big River");
    expect(m.network!.flowNote).toContain("follow this flow path only");
    expect(m.network!.connectivity!.label).toContain("without first passing another dam");
    expect(m.comparables!.documented[0].name).toBe("Mid Dam");
    expect(m.comparables!.overall[0].name).toBe("Lone Dam");
    expect(m.nid).toContainEqual({ label: "Dam Name", value: "Last Dam" });
    expect(m.map).toMatchObject({ lon: -96.2, lat: 39.2 });
    expect(m.references.map((r) => r.source).join(" ")).toContain("RATTES");
  });

  it("keeps authored report prose em-dash-free (placeholders excepted)", () => {
    const prose = [
      m.kicker,
      m.dataVintages,
      m.noModelNote ?? "",
      m.sustainability?.chartNote ?? "",
      m.sustainability?.linkNote ?? "",
      m.evidence?.noneNote ?? "",
      m.evidence?.agencyLine ?? "",
      m.comparables?.caveat ?? "",
      m.network?.flowNote ?? "",
      ...m.references.map((r) => r.note),
      ...(m.network?.sentences ?? []),
    ].join(" ");
    expect(prose).not.toContain("—");
  });
});

describe("buildReportModel: degraded and alternate targets", () => {
  it("a site without a crosswalk keeps team data and the honest note", () => {
    const m = buildReportModel(
      baseInputs({
        target: { kind: "site", site: SITE, entries: ENTRIES, nid: null, link: null },
        core: null,
        row: null,
        trajectory: undefined,
        surveys: null,
        surveyProv: null,
        similar: null,
      }),
    );
    expect(m.sustainability).toBeNull();
    expect(m.evidence).toBeNull();
    expect(m.network).toBeNull();
    expect(m.comparables).toBeNull();
    expect(m.nid).toBeNull();
    expect(m.noModelNote).toContain("not linked to a modeled reservoir");
    expect(m.management!.length).toBe(3);
    expect(m.references.map((r) => r.source).join(" ")).not.toContain("RATTES");
  });

  it("a failed trajectory degrades to a chart note, never a crash", () => {
    const m = buildReportModel(baseInputs({ trajectory: undefined }));
    expect(m.sustainability!.chart).toBeNull();
    expect(m.sustainability!.chartNote).toContain("unavailable");
    const stats = Object.fromEntries(m.sustainability!.stats.map((s) => [s.label, s.value]));
    expect(stats["Projected capacity (2050)"]).toBe("2.84k ac-ft"); // no CI without the trajectory
  });

  it("a reservoir target reads identity from the core and skips site sections", () => {
    const m = buildReportModel(
      baseInputs({
        target: { kind: "reservoir", shortId: 30 },
        row: 3,
        trajectory: null,
        surveys: [],
        surveyProv: null,
        similar: { documented: [], overall: [] },
      }),
    );
    expect(m.kicker).toBe("National Inventory Reservoir Report");
    expect(m.title).toBe("Head A");
    expect(m.reportId).toBe("reservoir-30");
    expect(m.management).toBeNull();
    expect(m.literature).toBeNull();
    expect(m.nid).toBeNull();
    expect(m.identity).toContainEqual({ label: "State", value: "Kansas" });
    expect(m.evidence!.hasSurveys).toBe(false);
    expect(m.evidence!.noneNote).toContain("model estimates only");
    expect(m.network!.sentences[0]).toContain("headwater dam");
  });
});
