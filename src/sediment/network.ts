// Network traversal over the decoded inventory — pure functions on
// SedimentCore (Node-testable; tests build tiny cores by hand). The shipped
// graph is just the `to` downstream-pointer array; upstream structure is its
// CSR inversion (core.up), built at decode time. Because every node has at
// most one downstream pointer, the reverse graph is a forest.

import { FLAG, type SedimentCore } from "./types";

/**
 * Ordered rows strictly downstream of `row` (first = immediate downstream),
 * ending at a mouth node, a dam with no downstream link, or — defensively —
 * when a cycle is detected (bad upstream data must not hang the UI).
 */
export function downstreamChain(core: SedimentCore, row: number): number[] {
  const out: number[] = [];
  const seen = new Set<number>([row]);
  let cur = core.to[row];
  while (cur >= 0 && !seen.has(cur)) {
    out.push(cur);
    seen.add(cur);
    cur = core.to[cur];
  }
  return out;
}

/** Immediate upstream rows (unordered). */
export function upstreamImmediate(core: SedimentCore, row: number): number[] {
  const { offsets, list } = core.up;
  const out: number[] = [];
  for (let i = offsets[row]; i < offsets[row + 1]; i++) out.push(list[i]);
  return out;
}

/** Every row upstream of `row` (excluding it) — BFS over the CSR forest. */
export function upstreamSet(core: SedimentCore, row: number): Set<number> {
  const out = new Set<number>();
  const queue = upstreamImmediate(core, row);
  while (queue.length) {
    const r = queue.pop() as number;
    if (out.has(r)) continue; // defensive — a forest never revisits
    out.add(r);
    const { offsets, list } = core.up;
    for (let i = offsets[r]; i < offsets[r + 1]; i++) queue.push(list[i]);
  }
  return out;
}

const upstreamCountsCache = new WeakMap<SedimentCore, Int32Array>();

/**
 * Total upstream dam count for every row (mouth nodes excluded from counts).
 * One O(n) pass: processing rows most-upstream-first lets each node add its
 * subtree size to its downstream parent. Memoized per core.
 */
export function upstreamCounts(core: SedimentCore): Int32Array {
  const cached = upstreamCountsCache.get(core);
  if (cached) return cached;
  const n = core.n;
  const counts = new Int32Array(n);
  // Kahn-style: repeatedly consume nodes whose upstream contributions are all
  // in. indegree here = number of immediate upstream dams not yet processed.
  const pending = new Int32Array(n);
  const queue: number[] = [];
  for (let r = 0; r < n; r++) {
    pending[r] = core.up.offsets[r + 1] - core.up.offsets[r];
    if (pending[r] === 0) queue.push(r);
  }
  let head = 0;
  while (head < queue.length) {
    const r = queue[head++];
    const t = core.to[r];
    if (t >= 0) {
      const contribution = counts[r] + (core.flags[r] & FLAG.MOUTH ? 0 : 1);
      counts[t] += contribution;
      if (--pending[t] === 0) queue.push(t);
    }
  }
  upstreamCountsCache.set(core, counts);
  return counts;
}

/** The mouth node this row ultimately drains to, or null when the chain ends
    inland (isolated dam, internal basin, or network exiting the country). */
export function mouthOf(core: SedimentCore, row: number): number | null {
  const chain = downstreamChain(core, row);
  const last = chain.length ? chain[chain.length - 1] : row;
  return core.flags[last] & FLAG.MOUTH ? last : null;
}

/** Downstream dams (mouth excluded) between `row` and the network end. */
export function downstreamDamCount(core: SedimentCore, row: number): number {
  let n = 0;
  for (const r of downstreamChain(core, row)) if (!(core.flags[r] & FLAG.MOUTH)) n++;
  return n;
}
