// Pure geometry for the map Select tools: point-in-polygon over decoded HUC
// rings and drawn polygons, and point-to-polyline distance for the near-a-river
// corridor. Everything works on [lon, lat] degree pairs and stays free of
// maplibre imports so vitest runs it in node.
//
// Accuracy notes: the distance math projects each segment to local meters with
// the longitude scaled by cos(latitude) — under 0.5% error for spans below
// ~200 km, which is plenty for click-scale containment and ≤300-mile
// corridors. None of it is antimeridian-safe on its own; callers cover
// maplibre's unwrapped longitudes by retrying the test point at lon ± 360
// (see selectTools.matchSites).

import type { Position } from "geojson";

/** [lon, lat] in degrees. */
export type Pt = [number, number];
/** [west, south, east, north]. */
export type Bbox = [number, number, number, number];

export const milesToMeters = (mi: number): number => mi * 1609.344;

/** Ground meters per CSS pixel at a zoom/latitude (512px world at z0 — the
 * same basis as esriQuantized.quantizationTolerance). */
export const metersPerPixel = (zoom: number, lat: number): number =>
  (Math.cos((lat * Math.PI) / 180) * 40075016.686) / (512 * 2 ** zoom);

const EARTH_RADIUS_M = 6371008.8;
const DEG_TO_M = (Math.PI / 180) * EARTH_RADIUS_M; // ≈ 111,195 m per degree

/** Even-odd ray cast against one ring. The ring may arrive open or closed —
 * the j = len-1 wrap handles both identically. Points exactly on the boundary
 * are implementation-defined (either answer is defensible there). */
export function pointInRing([x, y]: Pt, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Even-odd over a flat ring list: XOR across rings makes outers, holes, and
 * multipart polygons all fall out correctly with no role/winding metadata —
 * exactly what dequantizePolygons hands back. */
export function pointInRings(p: Pt, rings: Position[][]): boolean {
  let inside = false;
  for (const ring of rings) if (pointInRing(p, ring)) inside = !inside;
  return inside;
}

/** Meters from p to the segment [a, b], via a local equirectangular
 * projection centered on p (lon scaled by cos of p's latitude). */
export function pointToSegmentMeters(p: Pt, a: Position, b: Position): number {
  const kx = Math.cos((p[1] * Math.PI) / 180) * DEG_TO_M;
  const ky = DEG_TO_M;
  const ax = (a[0] - p[0]) * kx;
  const ay = (a[1] - p[1]) * ky;
  const bx = (b[0] - p[0]) * kx;
  const by = (b[1] - p[1]) * ky;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
  return Math.hypot(ax + t * dx, ay + t * dy);
}

/** Minimum distance in meters from p to any segment of any part. */
export function pointToPartsMeters(p: Pt, parts: Position[][]): number {
  let best = Infinity;
  for (const part of parts) {
    for (let i = 1; i < part.length; i++) {
      const d = pointToSegmentMeters(p, part[i - 1], part[i]);
      if (d < best) best = d;
    }
    if (part.length === 1) best = Math.min(best, pointToSegmentMeters(p, part[0], part[0]));
  }
  return best;
}

/** A river's fetched course: its line parts plus their union bbox, so the
 * per-site distance test can reject far-away points cheaply. */
export interface Corridor {
  parts: Position[][];
  bbox: Bbox;
}

export function corridorOf(parts: Position[][]): Corridor {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const part of parts) {
    for (const [x, y] of part) {
      if (x < w) w = x;
      if (x > e) e = x;
      if (y < s) s = y;
      if (y > n) n = y;
    }
  }
  return { parts, bbox: [w, s, e, n] };
}

/** True when p lies within `meters` of any corridor part. Fast path: reject
 * when p falls outside the bbox expanded by the buffer (latitude pad in
 * degrees = m / DEG_TO_M; longitude pad divided by the cos of the corridor's
 * worst-case latitude so it never under-expands). */
export function withinCorridor(p: Pt, c: Corridor, meters: number): boolean {
  const [w, s, e, n] = c.bbox;
  const latPad = meters / DEG_TO_M;
  const maxAbsLat = Math.min(85, Math.max(Math.abs(s), Math.abs(n)));
  const lonPad = latPad / Math.max(0.05, Math.cos((maxAbsLat * Math.PI) / 180));
  if (p[0] < w - lonPad || p[0] > e + lonPad || p[1] < s - latPad || p[1] > n + latPad) return false;
  return pointToPartsMeters(p, c.parts) <= meters;
}

/** Namesake filter: a by-name river fetch returns every feature sharing the
 * name (the Arizona Salt River AND the Missouri one). Keep only the parts
 * whose bboxes chain back — with gaps of at most `gapMeters` — to the part
 * nearest the clicked seed. One river's own segments touch or nearly touch;
 * namesakes sit hundreds of kilometers away. O(n²) over the handful of parts
 * a named 1:10M river has. */
export function partsNearSeed(parts: Position[][], seed: Pt, gapMeters = 50_000): Position[][] {
  if (parts.length <= 1) return parts;
  const boxes = parts.map((part) => corridorOf([part]).bbox);
  const gapDeg = gapMeters / DEG_TO_M; // conservative: no cos shrink, gaps only widen
  const boxesTouch = (a: Bbox, b: Bbox): boolean =>
    a[0] <= b[2] + gapDeg && b[0] <= a[2] + gapDeg && a[1] <= b[3] + gapDeg && b[1] <= a[3] + gapDeg;

  let seedIdx = 0;
  let seedDist = Infinity;
  for (let i = 0; i < parts.length; i++) {
    const d = pointToPartsMeters(seed, [parts[i]]);
    if (d < seedDist) {
      seedDist = d;
      seedIdx = i;
    }
  }
  const keep = new Set<number>([seedIdx]);
  const queue = [seedIdx];
  while (queue.length) {
    const i = queue.pop()!;
    for (let j = 0; j < parts.length; j++) {
      if (!keep.has(j) && boxesTouch(boxes[i], boxes[j])) {
        keep.add(j);
        queue.push(j);
      }
    }
  }
  return parts.filter((_, i) => keep.has(i));
}
