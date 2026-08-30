// Pipeline-helper checks (scripts/lib/sediment.mjs): number formatting that
// feeds the emitted JSON, the RATTES grid math, ResNet/RESSED parsing quirks
// (Python-repr lists, bare-object surveys, unit conversions, duplicate NIDs),
// and the crosswalk name-scoring primitives.
import { describe, expect, it } from "vitest";
import {
  ACFT_TO_M3,
  GRID,
  buildJsonArray,
  canonNid,
  canonSurveyMethod,
  canonSurveySub,
  dedupeRessedNids,
  fmtFixed,
  fmtSig,
  gridStartIndex,
  haversineMeters,
  jaccard,
  nameTokens,
  normalizeRessed,
  parsePyIdList,
  rattesCol,
  tidyAgency,
  type RessedReservoir,
} from "../scripts/lib/sediment.mjs";

describe("fmtSig / fmtFixed / buildJsonArray", () => {
  it("emits valid JSON tokens that round-trip at the requested precision", () => {
    for (const [v, sig, expected] of [
      [129984.42, 3, "130000"],
      [129984.42, 4, "130000"],
      [1525345.74, 3, "1530000"],
      [35200000000, 3, "3.52e+10"],
      [0.00123456, 3, "0.00123"],
      [1, 3, "1"],
      [0, 3, "0"],
    ] as const) {
      const s = fmtSig(v, sig);
      expect(s).toBe(expected);
      expect(JSON.parse(s)).toBeCloseTo(Number((v as number).toPrecision(sig)), 10);
    }
  });

  it("maps null/NaN/Infinity to the JSON null token", () => {
    expect(fmtSig(null, 3)).toBe("null");
    expect(fmtSig(NaN, 3)).toBe("null");
    expect(fmtSig(Infinity, 3)).toBe("null");
    expect(fmtFixed(null, 4)).toBe("null");
  });

  it("picks the shorter of plain and exponential notation", () => {
    // 6.5e+10 (7 chars) beats 65000000000 (11); 130000 (6) beats 1.3e+5 (6 — tie keeps plain)
    expect(fmtSig(6.5e10, 3)).toBe("6.5e+10");
    expect(fmtSig(130000, 3)).toBe("130000");
  });

  it("fmtFixed rounds to the decimal grid and drops trailing zeros", () => {
    expect(fmtFixed(-119.984815782, 4)).toBe("-119.9848");
    expect(fmtFixed(39.5, 4)).toBe("39.5");
  });

  it("buildJsonArray assembles a parseable array from formatted tokens", () => {
    const json = buildJsonArray([1.23456, null, 0], (v) => fmtSig(v as number | null, 3));
    expect(JSON.parse(json)).toEqual([1.23, null, 0]);
  });
});

describe("RATTES grid math", () => {
  it("maps years to the verified CSV field indexes", () => {
    expect(rattesCol(1699)).toBe(1);
    expect(rattesCol(2015)).toBe(317);
    expect(rattesCol(2025)).toBe(327);
    expect(rattesCol(2050)).toBe(352);
  });

  it("gridStartIndex clamps to the grid and handles edges", () => {
    expect(GRID).toHaveLength(17);
    expect(gridStartIndex(1699)).toBe(0);
    expect(gridStartIndex(1900)).toBe(0);
    expect(gridStartIndex(1901)).toBe(1); // first slot ≥ 1901 is 1910
    expect(gridStartIndex(1962)).toBe(GRID.indexOf(1970));
    expect(gridStartIndex(2024)).toBe(GRID.indexOf(2025));
    expect(gridStartIndex(2050)).toBe(GRID.indexOf(2050));
    expect(gridStartIndex(null)).toBe(-1);
    expect(gridStartIndex(2051)).toBe(-1);
  });
});

describe("parsePyIdList / canonNid", () => {
  it("extracts ids from the np.float64 repr without matching the 64 in float64", () => {
    expect(parsePyIdList("[np.float64(288955.0), np.float64(289838.0)]")).toEqual([288955, 289838]);
  });

  it("handles plain lists, negatives, and empties", () => {
    expect(parsePyIdList("[2, 9, 1]")).toEqual([2, 9, 1]);
    expect(parsePyIdList("[np.float64(-2.0)]")).toEqual([-2]);
    expect(parsePyIdList("")).toEqual([]);
    expect(parsePyIdList(null)).toEqual([]);
  });

  it("canonNid trims RESSED whitespace and uppercases", () => {
    expect(canonNid("ID00279 ")).toBe("ID00279");
    expect(canonNid(" tx00018")).toBe("TX00018");
    expect(canonNid(null)).toBe("");
  });
});

describe("survey code canonicalization (round 3)", () => {
  it("folds the export's dirty method variants onto DS434 codes, passes unknowns verbatim", () => {
    expect(canonSurveyMethod("RNG")).toBe("RNG");
    expect(canonSurveyMethod("Range")).toBe("RNG");
    expect(canonSurveyMethod("RANGE")).toBe("RNG");
    expect(canonSurveyMethod("RGN")).toBe("RNG");
    expect(canonSurveyMethod("Contour")).toBe("CON");
    expect(canonSurveyMethod("Range-Contour")).toBe("RCT");
    expect(canonSurveyMethod("RLCS")).toBe("RLCS"); // undocumented USACE code stays honest
    expect(canonSurveyMethod("  ")).toBe("");
    expect(canonSurveyMethod(null)).toBe("");
  });

  it("collapses subtype word forms to the DS434 letter", () => {
    expect(canonSurveySub("D")).toBe("D");
    expect(canonSurveySub("Detailed")).toBe("D");
    expect(canonSurveySub("DETAILED")).toBe("D");
    expect(canonSurveySub("detailed")).toBe("D");
    expect(canonSurveySub("R")).toBe("R");
    expect(canonSurveySub("S")).toBe("S");
    expect(canonSurveySub("G")).toBe("G"); // unmapped letter passes through
    expect(canonSurveySub(null)).toBe("");
  });

  it("tidyAgency strips the export's trailing '; ' filler", () => {
    expect(tidyAgency("DOD; CE; ")).toBe("DOD; CE");
    expect(tidyAgency("USDA; SCS; Region 4, Fort Worth, Tx")).toBe("USDA; SCS; Region 4, Fort Worth, Tx");
    expect(tidyAgency("  LAFCD;  ")).toBe("LAFCD");
    expect(tidyAgency(null)).toBe("");
  });
});

describe("normalizeRessed", () => {
  const wrap = (reservoir: unknown[]) => ({ ressed: { reservoir } });

  it("normalizes bare-object survey/stat, converts units, and sorts by date", () => {
    const { reservoirs, dropped } = normalizeRessed(
      wrap([
        {
          reservoir_id: 7,
          reservoir_nm: "Anderson Ranch",
          nid_id: "ID00279 ",
          latitude: 43.36,
          longitude: -115.45,
          state_fips_alpha_cd: "ID",
          date_storage_began: "1950-06-30",
          agency_performing_survey: "USDI; BR; ",
          agency_supplying_data: "USDI; BR; ",
          survey: {
            survey_id: 1,
            survey_date: "1998-06-01",
            pool_type_cd: "A",
            survey_type_cd: "Contour",
            survey_subtype_cd: "Detailed",
            note_tx: "  5-Ft. Contour Map.  ",
            stat: { stat_def_id: 3, stat_value: 474942 }, // bare object, not array
          },
        },
      ]),
    );
    expect(dropped).toEqual({ badYear: 0 });
    expect(reservoirs).toHaveLength(1);
    const r = reservoirs[0];
    expect(r.nid).toBe("ID00279");
    expect(r.began).toBe(1950);
    expect(r.agency).toBe("USDI; BR");
    expect(r.supplier).toBe("USDI; BR");
    expect(r.surveys).toHaveLength(1);
    expect(r.surveys[0].year).toBe(1998);
    expect(r.surveys[0].date).toBe("1998-06-01");
    expect(r.surveys[0].method).toBe("CON");
    expect(r.surveys[0].sub).toBe("D");
    expect(r.surveys[0].note).toBe("5-Ft. Contour Map.");
    expect(r.surveys[0].cap).toBeCloseTo(474942 * ACFT_TO_M3, 3);
    expect(r.surveys[0].area).toBeNull();
  });

  it("drops artifact years, keeps stat-less surveys as date-only evidence, keeps first duplicate stat", () => {
    const { reservoirs, dropped, dateOnly } = normalizeRessed(
      wrap([
        {
          reservoir_id: "9",
          reservoir_nm: "X",
          survey: [
            { survey_id: 1, survey_date: "2975-01-01", stat: [{ stat_def_id: 3, stat_value: 1 }] },
            { survey_id: 2, survey_date: "1960-01-01", stat: [{ stat_def_id: 99, stat_value: 5 }] },
            {
              survey_id: 3,
              survey_date: "1950-02-03",
              stat: [
                { stat_def_id: 3, stat_value: 100 },
                { stat_def_id: 3, stat_value: 999 },
              ],
            },
          ],
        },
      ]),
    );
    expect(dropped).toEqual({ badYear: 1 });
    expect(dateOnly).toBe(1); // the 1960 survey has no workhorse stat but keeps its date
    expect(reservoirs[0].surveys).toHaveLength(2);
    expect(reservoirs[0].surveys[0].cap).toBeCloseTo(100 * ACFT_TO_M3, 6); // 1950 first (date-sorted)
    expect(reservoirs[0].surveys[1]).toMatchObject({ year: 1960, cap: null, area: null, sedTot: null, dryWt: null });
  });
});

describe("dedupeRessedNids", () => {
  const res = (id: string, nid: string, years: number[]): RessedReservoir => ({
    id,
    name: id,
    nid,
    lon: null,
    lat: null,
    state: "",
    began: null,
    agency: "",
    supplier: "",
    surveys: years.map((year) => ({
      year,
      date: `${year}-01-01`,
      pool: "",
      method: "",
      sub: "",
      note: "",
      cap: 1,
      area: null,
      sedTot: null,
      dryWt: null,
    })),
  });

  it("prefers most surveys, then latest year, then lowest id — deterministically", () => {
    const list = [res("30", "AA00001", [1950, 1960]), res("10", "AA00001", [1980]), res("20", "AA00001", [1950, 1990])];
    expect(dedupeRessedNids(list).get("AA00001")).toBe(2); // 20: two surveys, latest 1990
    const tie = [res("30", "BB00001", [1950]), res("10", "BB00001", [1950])];
    expect(dedupeRessedNids(tie).get("BB00001")).toBe(1); // lowest id wins the full tie
  });
});

describe("crosswalk scoring primitives", () => {
  it("nameTokens splits CamelCase and drops generic hydronyms", () => {
    expect(nameTokens("SacramentoRiver")).toEqual(new Set(["sacramento"]));
    expect(nameTokens("Tuttle Creek Dam")).toEqual(new Set(["tuttle"]));
    expect(nameTokens("Dam Lake Reservoir")).toEqual(new Set());
  });

  it("jaccard is 0 on empty sets and 1 on identity", () => {
    expect(jaccard(new Set(), nameTokens("Tuttle Creek"))).toBe(0);
    expect(jaccard(nameTokens("Tuttle Creek Dam"), nameTokens("tuttle creek lake"))).toBe(1);
    expect(jaccard(new Set(["a", "b"]), new Set(["b", "c"]))).toBeCloseTo(1 / 3, 10);
  });

  it("haversine matches a known distance (1° latitude ≈ 111.2 km)", () => {
    expect(haversineMeters(-96, 39, -96, 40)).toBeCloseTo(111195, -3);
    expect(haversineMeters(-96, 39, -96, 39)).toBe(0);
  });
});
