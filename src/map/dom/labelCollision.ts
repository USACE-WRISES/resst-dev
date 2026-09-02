// Greedy label placement for the Leaflet map, standing in for MapLibre's
// text-optional collision: labels are accepted in site order while their
// estimated screen boxes stay clear of every accepted one. Pure, so vitest
// pins it; the estimate (6.2 px per character at 11 px, 14 px tall, 7 px
// above the marker) only has to be consistent, not exact.

export interface LabelBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const LABEL_CHAR_PX = 6.2;
export const LABEL_PAD_PX = 6;
export const LABEL_H_PX = 14;
/** Gap between the marker centre and the label's bottom edge. */
export const LABEL_GAP_PX = 7;
/** Permanent tooltips are DOM nodes; never show more than this many at once. */
export const LABEL_CAP = 150;

/** The screen box a label of `text` occupies above the point `p`. */
export function labelBox(p: { x: number; y: number }, text: string): LabelBox {
  const w = text.length * LABEL_CHAR_PX + LABEL_PAD_PX;
  return { x: p.x - w / 2, y: p.y - LABEL_GAP_PX - LABEL_H_PX, w, h: LABEL_H_PX };
}

/** Strict overlap: boxes that only touch along an edge do not collide. */
export function boxesOverlap(a: LabelBox, b: LabelBox): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/**
 * The items whose labels fit, in input order, at most `cap` of them. First
 * come, first placed — later labels yield to earlier ones, never the reverse.
 */
export function placeLabels<T>(items: readonly T[], boxOf: (item: T) => LabelBox, cap = LABEL_CAP): T[] {
  const accepted: LabelBox[] = [];
  const out: T[] = [];
  for (const item of items) {
    if (out.length >= cap) break;
    const box = boxOf(item);
    if (accepted.some((a) => boxesOverlap(a, box))) continue;
    accepted.push(box);
    out.push(item);
  }
  return out;
}
