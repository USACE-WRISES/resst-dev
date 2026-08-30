// Pure decoders for the public/sediment/ files — no fetch, no store, no
// maplibre, so vitest exercises them directly (tests/sedimentData.test.ts).
// File formats are produced by scripts/build-sediment.mjs; keep in sync.

import type { SedimentCore, SurveyObs, SurveyProvenance, Trajectory } from "./types";

interface InventoryJson {
  _meta: { trajSpan: number; trajChunks: number };
  n: number;
  dicts: { state: string[]; owner: string[]; purpose: string[]; storSrc: string[] };
  cols: Record<string, Array<number | string | null>>;
}

const f64 = (arr: Array<number | null>): Float64Array => {
  const out = new Float64Array(arr.length);
  for (let i = 0; i < arr.length; i++) out[i] = arr[i] == null ? NaN : (arr[i] as number);
  return out;
};

export function decodeCore(json: unknown): SedimentCore {
  const inv = json as InventoryJson;
  const cols = inv.cols;
  const n = inv.n;
  const ids = Int32Array.from(cols.id as number[]);
  if (ids.length !== n) throw new Error(`inventory: id column length ${ids.length} != n ${n}`);
  const rowById = new Map<number, number>();
  for (let i = 0; i < n; i++) rowById.set(ids[i], i);

  const to = Int32Array.from(cols.to as number[]);
  // Invert `to` into a CSR immediate-upstream index (counting sort, O(n)).
  const counts = new Int32Array(n);
  for (let i = 0; i < n; i++) if (to[i] >= 0) counts[to[i]]++;
  const offsets = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) offsets[i + 1] = offsets[i] + counts[i];
  const list = new Int32Array(offsets[n]);
  const cursor = offsets.slice(0, n);
  for (let i = 0; i < n; i++) {
    const t = to[i];
    if (t >= 0) list[cursor[t]++] = i;
  }

  return {
    n,
    ids,
    rowById,
    names: cols.name as string[],
    nids: cols.nid as string[],
    lon: f64(cols.lon as Array<number | null>),
    lat: f64(cols.lat as Array<number | null>),
    state: Int16Array.from(cols.state as number[]),
    owner: Int16Array.from(cols.owner as number[]),
    purpose: Int16Array.from(cols.purpose as number[]),
    storSrc: Int16Array.from(cols.storSrc as number[]),
    yrc: Int32Array.from(cols.yrc as number[]),
    flags: Int32Array.from(cols.flags as number[]),
    to,
    deltaTag: Int32Array.from(cols.deltaTag as number[]),
    maxStor: f64(cols.maxStor as Array<number | null>),
    da: f64(cols.da as Array<number | null>),
    sca: f64(cols.sca as Array<number | null>),
    capOrig: f64(cols.capOrig as Array<number | null>),
    cap2025: f64(cols.cap2025 as Array<number | null>),
    cap2050: f64(cols.cap2050 as Array<number | null>),
    sed2015: f64(cols.sed2015 as Array<number | null>),
    sed2025: f64(cols.sed2025 as Array<number | null>),
    sed2050: f64(cols.sed2050 as Array<number | null>),
    evd: Uint8Array.from(cols.evd as number[]),
    dicts: inv.dicts,
    up: { offsets, list },
    trajSpan: inv._meta.trajSpan,
    trajChunks: inv._meta.trajChunks,
  };
}

interface TrajChunkJson {
  _meta: { grid: number[] };
  rows: number[];
  yr0: Array<number | null>;
  start: number[];
  sed: number[][];
  sedHi25: Array<number | null>;
  sedLo25: Array<number | null>;
  sedHi50: Array<number | null>;
  sedLo50: Array<number | null>;
  capHi25: Array<number | null>;
  capLo25: Array<number | null>;
  capHi50: Array<number | null>;
  capLo50: Array<number | null>;
  capX: Record<string, number[]>;
}

/**
 * Decode one trajectory chunk into per-row Trajectory objects. Capacity is
 * reconstructed as capOrig − sediment (the RATTES invariant) unless the row
 * carries an explicit capX series; tiny negatives from mixed-precision
 * rounding clamp to 0. capOrigOf receives the GLOBAL row index.
 */
export function decodeTrajChunk(json: unknown, capOrigOf: (row: number) => number): Map<number, Trajectory> {
  const c = json as TrajChunkJson;
  const grid = c._meta.grid;
  const out = new Map<number, Trajectory>();
  for (let k = 0; k < c.rows.length; k++) {
    const row = c.rows[k];
    const start = c.start[k];
    const sed = c.sed[k] ?? [];
    const years = start >= 0 ? grid.slice(start) : [];
    const capX = c.capX[String(row)];
    const capOrig = capOrigOf(row);
    const capacity = sed.map((s, i) => {
      if (capX) return capX[i];
      if (!Number.isFinite(capOrig)) return NaN;
      return Math.max(0, capOrig - s);
    });
    out.set(row, {
      yr0: c.yr0[k],
      years,
      sedimentM3: sed,
      capacityM3: capacity,
      ci: [
        { year: 2025, capHi: c.capHi25[k], capLo: c.capLo25[k], sedHi: c.sedHi25[k], sedLo: c.sedLo25[k] },
        { year: 2050, capHi: c.capHi50[k], capLo: c.capLo50[k], sedHi: c.sedHi50[k], sedLo: c.sedLo50[k] },
      ],
    });
  }
  return out;
}

interface SurveysJson {
  reservoirs: {
    id: string[];
    name: string[];
    nid: Array<string | null>;
    row: Array<number | null>;
    lon: Array<number | null>;
    lat: Array<number | null>;
    state: string[];
    began: Array<number | null>;
    agency?: string[];
    supplier?: string[];
  };
  surveys: {
    rIdx: number[];
    year: number[];
    date?: string[];
    pool: string[];
    method?: string[];
    sub?: string[];
    note?: string[];
    cap: Array<number | null>;
    area: Array<number | null>;
    sedTot: Array<number | null>;
    dryWt: Array<number | null>;
  };
}

/** Decode surveys.json into a per-inventory-row survey list (joined rows only). */
export function decodeSurveys(json: unknown): Map<number, SurveyObs[]> {
  const s = json as SurveysJson;
  const rowOfReservoir = s.reservoirs.row;
  const out = new Map<number, SurveyObs[]>();
  for (let i = 0; i < s.surveys.rIdx.length; i++) {
    const row = rowOfReservoir[s.surveys.rIdx[i]];
    if (row == null) continue;
    let list = out.get(row);
    if (!list) out.set(row, (list = []));
    list.push({
      year: s.surveys.year[i],
      date: s.surveys.date?.[i] ?? "",
      pool: s.surveys.pool[i],
      method: s.surveys.method?.[i] ?? "",
      sub: s.surveys.sub?.[i] ?? "",
      note: s.surveys.note?.[i] ?? "",
      capM3: s.surveys.cap[i],
      areaM2: s.surveys.area[i],
      sedTotM3: s.surveys.sedTot[i],
      dryWtKgM3: s.surveys.dryWt[i],
    });
  }
  return out; // build emits surveys date-sorted per reservoir — order survives
}

/** Reservoir-level RESSED provenance keyed by joined inventory row. */
export function decodeSurveyProvenance(json: unknown): Map<number, SurveyProvenance> {
  const s = json as SurveysJson;
  const out = new Map<number, SurveyProvenance>();
  for (let i = 0; i < s.reservoirs.row.length; i++) {
    const row = s.reservoirs.row[i];
    if (row == null) continue;
    const idNum = Number(s.reservoirs.id[i]);
    out.set(row, {
      ressedId: Number.isFinite(idNum) ? idNum : null,
      agency: s.reservoirs.agency?.[i] ?? "",
      supplier: s.reservoirs.supplier?.[i] ?? "",
    });
  }
  return out;
}
