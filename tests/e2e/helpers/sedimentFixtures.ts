// Tiny stand-ins for the public/sediment/ files, routed onto **/sediment/**
// so e2e never depends on the real multi-MB distillations (the precedent is
// overlayFixtures.ts for **/overlays/*.json). Geography sits inside the
// Kansas fixture basin ([-96.9, -96.3] × [39.0, 39.5]) used by
// selection.spec.ts, and the crosswalked dam is Tuttle Creek (site_id
// "tuttle-creek", the app's first site) at its real coordinates, so the
// fixtures compose with existing specs.
//
// Network shape:  Upstream Dam(20) → Tuttle Creek Dam(10) → Big River mouth(-5)
//                 Lone Reservoir(30) — isolated, not crosswalked
import type { Page } from "@playwright/test";

// Real 17-slot grid from scripts/lib/sediment.mjs (kept literal — fixtures
// must not import the pipeline).
export const GRID = [1900, 1910, 1920, 1930, 1940, 1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020, 2025, 2030, 2040, 2050];

// FLAG bits (mirror of src/sediment/types.ts).
const MOUTH = 1;
const TERMINAL = 2;
const HEADWATER = 4;
const HAS_SURVEYS = 16;
const HAS_TRAJ = 512;

export const INVENTORY_FIXTURE = {
  _meta: { trajSpan: 4, trajChunks: 1 },
  n: 4,
  dicts: { state: ["Kansas"], owner: ["Federal"], purpose: ["Flood Control"], storSrc: ["NID"] },
  cols: {
    id: [-5, 10, 20, 30],
    name: ["Big River", "Tuttle Creek Dam", "Upstream Dam", "Lone Reservoir"],
    nid: ["MOUTH_BigR", "KS00012", "KS90001", "KS90002"],
    lon: [-96.6, -96.5943, -96.55, -96.45],
    lat: [39.1, 39.2562, 39.35, 39.05],
    state: [-1, 0, 0, 0],
    owner: [-1, 0, 0, 0],
    purpose: [-1, 0, 0, 0],
    storSrc: [-1, 0, 0, 0],
    yrc: [0, 1962, 1955, 1990],
    flags: [MOUTH, TERMINAL | HAS_TRAJ | HAS_SURVEYS, HEADWATER | HAS_TRAJ, TERMINAL | HEADWATER | HAS_TRAJ],
    to: [-1, 0, 1, -1],
    deltaTag: [0, 0, 0, 0],
    maxStor: [null, 1.2e9, 5e7, 1e7],
    da: [26000, 25000, 3000, 40],
    sca: [20000, 19000, 3000, 40],
    capOrig: [null, 1.2e9, 5e7, 1e7],
    cap2025: [null, 1.0e9, 2.5e7, 9e6],
    cap2050: [null, 8.5e8, 1.5e7, 8.4e6],
    sed2015: [null, 1.7e8, 2.2e7, 6e5],
    sed2025: [null, 2.0e8, 2.5e7, 1e6],
    sed2050: [null, 3.5e8, 3.5e7, 1.6e6],
    evd: [0, 1, 2, 2], // Tuttle stand-in is survey-constrained; the rest statistical
  },
};

export const TRAJ_CHUNK_FIXTURE = {
  _meta: {
    source: "fixture",
    grid: GRID,
    chunk: "1/1",
    span: 4,
    sigFigs: 3,
    capacityRule: "cap[i] = capOrig - sed[i] unless the row appears in capX",
  },
  rows: [1, 2, 3],
  yr0: [1962, 1955, 1990],
  start: [7, 6, 9],
  sed: [
    // Tuttle stand-in, 1970→2050 (2025 slot matches inventory sed2025).
    [2e7, 5e7, 8e7, 1.1e8, 1.5e8, 1.9e8, 2.0e8, 2.2e8, 2.9e8, 3.5e8],
    // Upstream Dam, 1960→2050 — 50% capacity lost by 2025.
    [2e6, 5e6, 8e6, 1.2e7, 1.6e7, 2.0e7, 2.3e7, 2.5e7, 2.7e7, 3.1e7, 3.5e7],
    // Lone Reservoir, 1990→2050.
    [1e5, 3e5, 5e5, 7e5, 1e6, 1.2e6, 1.4e6, 1.6e6],
  ],
  sedHi25: [2.4e8, 3.0e7, 1.3e6],
  sedLo25: [1.6e8, 2.0e7, 7e5],
  sedHi50: [4.2e8, 4.2e7, 2.1e6],
  sedLo50: [2.8e8, 2.8e7, 1.1e6],
  capHi25: [1.04e9, 3.0e7, 9.3e6],
  capLo25: [9.6e8, 2.0e7, 8.7e6],
  capHi50: [9.2e8, 2.2e7, 8.9e6],
  capLo50: [7.8e8, 8e6, 7.9e6],
  capX: {},
};

export const SURVEYS_FIXTURE = {
  _meta: { source: "fixture", type: "measured" },
  reservoirs: {
    id: ["101"],
    name: ["TUTTLE CREEK"],
    nid: ["KS00012"],
    row: [1],
    lon: [-96.5943],
    lat: [39.2562],
    state: ["KS"],
    began: [1962],
  },
  surveys: {
    rIdx: [0, 0],
    year: [1970, 2000],
    pool: ["S", "S"],
    cap: [1.15e9, 1.05e9],
    area: [null, null],
    sedTot: [3e7, 6e7],
    dryWt: [null, null],
  },
};

export const SITE_LINKS_FIXTURE = {
  _meta: { source: "fixture" },
  sites: [
    {
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
    },
  ],
};

export interface SedimentRouteOptions {
  /** Return HTTP 500 for these files until the returned handle's clear() is
      called — exercises the error → Retry paths. */
  failing?: Array<"sites" | "inventory" | "surveys" | "trajectories">;
}

export interface SedimentRoutes {
  /** Stop failing the files passed via options.failing (Retry succeeds). */
  clearFailures: () => void;
}

/** Route every sediment file onto the fixtures. Call before page.goto. */
export async function stubSediment(page: Page, options: SedimentRouteOptions = {}): Promise<SedimentRoutes> {
  const failing = new Set(options.failing ?? []);
  const json = (body: unknown) => ({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
  await page.route("**/sediment/**", (route) => {
    const url = route.request().url();
    const kind = url.includes("/trajectories/")
      ? ("trajectories" as const)
      : url.endsWith("/inventory.json")
        ? ("inventory" as const)
        : url.endsWith("/surveys.json")
          ? ("surveys" as const)
          : url.endsWith("/sites.json")
            ? ("sites" as const)
            : null;
    if (kind && failing.has(kind)) return route.fulfill({ status: 500, body: "fixture failure" });
    switch (kind) {
      case "sites":
        return route.fulfill(json(SITE_LINKS_FIXTURE));
      case "inventory":
        return route.fulfill(json(INVENTORY_FIXTURE));
      case "surveys":
        return route.fulfill(json(SURVEYS_FIXTURE));
      case "trajectories":
        return route.fulfill(json(TRAJ_CHUNK_FIXTURE));
      default:
        return route.continue();
    }
  });
  return { clearFailures: () => failing.clear() };
}
