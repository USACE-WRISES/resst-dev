// Lazy loading + session caching for the distilled sedimentation data.
// Mirrors the overlays.ts staticRuntime philosophy: single-flight, fetch-once,
// abort-free (files are small), failure resets the promise so Retry refetches.
// Components call ensure*() from effects; every successful load bumps the
// store's sedimentStamp so derive/useAppState consumers re-render, and the
// core/surveys loads report status for chips + Retry affordances.

import { actions } from "../state/store";
import { decodeCore, decodeSurveyProvenance, decodeSurveys, decodeTrajChunk } from "./decode";
import type { SedimentCore, SurveyObs, SurveyProvenance, Trajectory } from "./types";

async function fetchJson(rel: string): Promise<unknown> {
  const res = await fetch(`${import.meta.env.BASE_URL}sediment/${rel}`);
  if (!res.ok) throw new Error(`Failed to load sediment/${rel}: HTTP ${res.status}`);
  return res.json();
}

// ------------------------------------------------------------- core ---------

let corePromise: Promise<SedimentCore> | null = null;
let core: SedimentCore | null = null;

/** Kick off (or join) the national-inventory load (~2.3 MB gzipped). */
export function ensureCore(): Promise<SedimentCore> {
  if (!corePromise) {
    actions.setSedimentStatus("core", "loading");
    corePromise = fetchJson("inventory.json").then(
      (json) => {
        core = decodeCore(json);
        actions.setSedimentStatus("core", "ready");
        actions.bumpSedimentStamp();
        return core;
      },
      (err) => {
        corePromise = null; // reset so a Retry refetches
        actions.setSedimentStatus("core", "error");
        throw err;
      },
    );
  }
  return corePromise;
}

/** The decoded inventory, or null while not (yet) loaded. */
export const getCore = (): SedimentCore | null => core;

// ----------------------------------------------------------- surveys --------

let surveysPromise: Promise<Map<number, SurveyObs[]>> | null = null;
let surveysByRow: Map<number, SurveyObs[]> | null = null;
let surveyProvByRow: Map<number, SurveyProvenance> | null = null;

/** Kick off (or join) the RESSED measured-surveys load (~0.1 MB gzipped). */
export function ensureSurveys(): Promise<Map<number, SurveyObs[]>> {
  if (!surveysPromise) {
    actions.setSedimentStatus("surveys", "loading");
    surveysPromise = fetchJson("surveys.json").then(
      (json) => {
        surveysByRow = decodeSurveys(json);
        surveyProvByRow = decodeSurveyProvenance(json);
        actions.setSedimentStatus("surveys", "ready");
        actions.bumpSedimentStamp();
        return surveysByRow;
      },
      (err) => {
        surveysPromise = null;
        actions.setSedimentStatus("surveys", "error");
        throw err;
      },
    );
  }
  return surveysPromise;
}

/** Measured surveys for an inventory row — [] when none, null while unloaded. */
export function surveysForRow(row: number): SurveyObs[] | null {
  if (!surveysByRow) return null;
  return surveysByRow.get(row) ?? [];
}

/** RESSED reservoir-level provenance (datasheet id, agencies) — null when unloaded or unjoined. */
export function surveyProvenanceForRow(row: number): SurveyProvenance | null {
  return surveyProvByRow?.get(row) ?? null;
}

// ------------------------------------------------------- trajectories -------

const chunkPromises = new Map<number, Promise<void>>();
const trajByRow = new Map<number, Trajectory>();
const loadedChunks = new Set<number>();

/**
 * Ensure the trajectory chunk containing `row` is resident. Requires the core
 * (for chunk span + capacity reconstruction) — awaited internally.
 * Resolves to the row's Trajectory, or null for rows without one (mouths).
 */
export async function ensureTrajectory(row: number): Promise<Trajectory | null> {
  const c = await ensureCore();
  const chunk = Math.floor(row / c.trajSpan);
  if (!loadedChunks.has(chunk)) {
    let p = chunkPromises.get(chunk);
    if (!p) {
      p = fetchJson(`trajectories/traj-${String(chunk).padStart(2, "0")}.json`).then(
        (json) => {
          const decoded = decodeTrajChunk(json, (r) => c.capOrig[r]);
          for (const [r, t] of decoded) trajByRow.set(r, t);
          loadedChunks.add(chunk);
          actions.bumpSedimentStamp();
        },
        (err) => {
          chunkPromises.delete(chunk); // reset for retry
          throw err;
        },
      );
      chunkPromises.set(chunk, p);
    }
    await p;
  }
  return trajByRow.get(row) ?? null;
}

/** Synchronous peek: Trajectory, null (row has none), or undefined (chunk not loaded). */
export function getTrajectory(row: number): Trajectory | null | undefined {
  if (trajByRow.has(row)) return trajByRow.get(row) as Trajectory;
  if (!core) return undefined;
  return loadedChunks.has(Math.floor(row / core.trajSpan)) ? null : undefined;
}

// ------------------------------------------------------------- testing ------

/** Test-only: drop every cache so specs start cold (mirrors a fresh session). */
export function resetSedimentCachesForTests(): void {
  corePromise = null;
  core = null;
  surveysPromise = null;
  surveysByRow = null;
  chunkPromises.clear();
  trajByRow.clear();
  loadedChunks.clear();
}
