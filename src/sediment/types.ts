// Shapes for the distilled sedimentation data under public/sediment/
// (built by scripts/build-sediment.mjs — the file formats are documented
// there and in data/DATA-SOURCES.md). Everything here is maplibre-free and
// import-cycle-free so vitest exercises the decode/traversal logic in Node.

/** Bitfield in inventory cols.flags — mirror of the build script's FLAG. */
export const FLAG = {
  MOUTH: 1,
  TERMINAL: 2,
  HEADWATER: 4,
  /** ResNet's own IsSite tag — distinct from the RESST crosswalk. */
  IS_SITE: 8,
  HAS_SURVEYS: 16,
  NO_STORAGE: 64,
  LOCK: 128,
  REMOVED: 256,
  HAS_TRAJ: 512,
} as const;

/** Decoded inventory.json — columnar typed arrays, row index = key. */
export interface SedimentCore {
  n: number;
  /** ResNet ShortID per row (rows sorted ascending; 145 negative mouth nodes first). */
  ids: Int32Array;
  rowById: Map<number, number>;
  names: string[];
  nids: string[];
  lon: Float64Array;
  lat: Float64Array;
  /** Dictionary indexes into dicts.* (-1 = blank). */
  state: Int16Array;
  owner: Int16Array;
  purpose: Int16Array;
  storSrc: Int16Array;
  /** Dam closure year; 0 = unknown. */
  yrc: Int32Array;
  flags: Int32Array;
  /** Row index of the next downstream dam; -1 = none. */
  to: Int32Array;
  deltaTag: Int32Array;
  /** ResNet MaxStor_m3. */
  maxStor: Float64Array;
  /** Total drainage area, km² (NaN = missing). */
  da: Float64Array;
  /** Sediment-contributing drainage area 2025, km² (NaN = missing). */
  sca: Float64Array;
  /** RATTES headline stats, m³ (NaN = no trajectory / not applicable). */
  capOrig: Float64Array;
  cap2025: Float64Array;
  cap2050: Float64Array;
  sed2015: Float64Array;
  sed2025: Float64Array;
  sed2050: Float64Array;
  /** RATTES evidence class: 0 unknown, 1 survey-constrained, 2 MLR (0 until Supp. Data 1 lands). */
  evd: Uint8Array;
  dicts: { state: string[]; owner: string[]; purpose: string[]; storSrc: string[] };
  /** Immediate-upstream index (CSR over `to` inverted): upstream rows of r are
      up.list[up.offsets[r] .. up.offsets[r+1]). */
  up: { offsets: Int32Array; list: Int32Array };
  trajSpan: number;
  trajChunks: number;
}

/** One reservoir's chart series decoded from a trajectory chunk. */
export interface Trajectory {
  /** First year with storage (chart anchor: capacity = capOrig, sediment = 0); null = never. */
  yr0: number | null;
  /** Grid years from the first populated slot through 2050 (empty for all-zero rows). */
  years: number[];
  /** Modeled sediment, m³, 3 significant figures. */
  sedimentM3: number[];
  /** Reconstructed (or explicit capX) capacity, m³ — clamped at 0. */
  capacityM3: number[];
  /** 95% CI at the benchmark years (null members = not available). */
  ci: Array<{
    year: 2025 | 2050;
    capHi: number | null;
    capLo: number | null;
    sedHi: number | null;
    sedLo: number | null;
  }>;
}

/** One measured RESSED survey observation (converted to metric at build). */
export interface SurveyObs {
  year: number;
  /** Full survey date from the export (ISO-ish, e.g. "2000-07-01"; "" when absent). */
  date: string;
  /** Pool type code from the 2013 export ("" when absent). */
  pool: string;
  /** Survey method code, case-folded onto DS434's RNG/CON/RCT; undocumented codes verbatim. */
  method: string;
  /** Survey scope code per DS434 (D detailed / R reconnaissance / S semi-detailed). */
  sub: string;
  /** Free-text note from the export ("" when absent). */
  note: string;
  capM3: number | null;
  areaM2: number | null;
  /** Per-interval sediment deposit since the previous survey. */
  sedTotM3: number | null;
  dryWtKgM3: number | null;
}

/** Reservoir-level RESSED provenance for the Evidence section's source links. */
export interface SurveyProvenance {
  /** RESSED reservoir_id (numeric); below 100000 it is the legacy RESIS-II datasheet number. */
  ressedId: number | null;
  /** Agency that performed the surveys ("" when the export has none). */
  agency: string;
  /** Agency that supplied the data ("" when the export has none). */
  supplier: string;
}

/** DS434-documented survey method codes; codes it never defined (RLCS, TBS…) render as themselves. */
export const SURVEY_METHOD_LABELS: Record<string, string> = {
  RNG: "range survey",
  CON: "contour survey",
  RCT: "range and contour survey",
};

/** DS434 survey scope codes. */
export const SURVEY_SUBTYPE_LABELS: Record<string, string> = {
  D: "detailed",
  R: "reconnaissance",
  S: "semi-detailed",
};

/** Pool letters are not expanded anywhere in the public RESSED documentation;
    these labels follow the structural evidence in the export (nested S/T pool
    pairs; notes like "Sediment Pool Only") and the U-only USACE tranche.
    Unlisted letters (A, G, O) render as "pool {code}". */
export const SURVEY_POOL_LABELS: Record<string, string> = {
  T: "total pool",
  S: "sediment pool",
  U: "pool not specified",
};

/**
 * Scanned SCS Form 34 datasheet URL for legacy RESIS reservoirs. The RESSED
 * reservoir_id below 100000 IS the datasheet number: id 32003 ↔ 32-3.pdf
 * (Kanopolis), 45025 ↔ 45-25.pdf; 20/20 sampled ids resolve (2026-08-30,
 * see data/DATA-SOURCES.md). Post-RESIS ids (100xxx) have no sheet.
 */
export function ressedDatasheetUrl(ressedId: number | null): string | null {
  if (ressedId == null || !Number.isFinite(ressedId) || ressedId <= 0 || ressedId >= 100000) return null;
  return `https://water.usgs.gov/osw/ressed/datasheets/${Math.floor(ressedId / 1000)}-${ressedId % 1000}.pdf`;
}

/** One row of public/sediment/sites.json — RESST site ↔ ResNet/RATTES link
    plus headline stats so site panels render before inventory.json loads. */
export interface SiteSedimentLink {
  site_id: string;
  short_id: number;
  nid: string;
  method: "nid" | "spatial_name" | "manual";
  confidence: "high" | "medium" | "low";
  cap_orig_m3: number | null;
  cap2025_m3: number | null;
  sed2025_m3: number | null;
  sed2015_m3: number | null;
  cap2050_m3: number | null;
  sed2050_m3: number | null;
  has_surveys: boolean;
  /** Most recent RESSED survey year (null when has_surveys is false). */
  latest_survey_year: number | null;
}

export type ProvenanceType =
  | "observed"
  | "network-derived"
  | "survey-constrained model"
  | "statistical prediction"
  | "reported";

export interface ProvenanceGroup {
  source: string;
  version: string;
  doi?: string;
  url?: string;
  type: ProvenanceType;
  /** One-line caveat rendered with the badge popover. */
  note: string;
}

/** Source metadata rendered by the provenance UI (Help→About carries the full citations). */
export const PROVENANCE: Record<"rattes" | "resnet" | "ressed" | "resst", ProvenanceGroup> = {
  rattes: {
    source: "RATTES national reservoir-sedimentation model (Eckland, Foster, Hurst, Beyene & Overeem, Nature Communications)",
    version: "v1.2, silt scenario",
    doi: "10.1038/s41467-026-76986-3",
    type: "statistical prediction",
    note: "Modeled estimate. Survey-constrained at 924 reservoirs, statistically predicted elsewhere. Not a measurement.",
  },
  resnet: {
    source: "ResNet routed dam network (Hurst, Foster & Eckland, Scientific Data 12:2044)",
    version: "v1 (2025)",
    doi: "10.1038/s41597-025-06315-8",
    type: "network-derived",
    note: "Derived from NID dam locations routed on NHDPlusV2 flowlines; inherits their positional and attribute errors.",
  },
  ressed: {
    source: "USGS RESSED reservoir sedimentation surveys",
    version: "2013-04-04 public export",
    url: "https://water.usgs.gov/osw/ressed/",
    type: "observed",
    note: "Measured bathymetric/topographic surveys, mostly 1930–1990; survey methods and datums vary.",
  },
  resst: {
    source: "RESST documented sediment release & management database",
    version: "current",
    type: "reported",
    note: "Compiled by the RESST team from project documentation and literature.",
  },
};

/** m³ → acre-feet (display conversion; data files stay metric). */
export const M3_PER_ACFT = 1233.48184;
