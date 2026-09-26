// Geometry and palette for the Dashboard's SVG charts. No chart library:
// the charts are plain SVG and HTML, which USACE's remote browser isolation
// mirrors and animates locally (a canvas would stream as still frames).
// Pure: unit-tested in Node.

export const TAU = 2 * Math.PI;

/** Categorical slice colours, drawn from the app's own palette (the accent,
    the chart sediment brown, the network purple and green, the selection
    teal, the danger red, an amber) plus the muted grey for "Other". */
export const CATEGORICAL = ["#17607a", "#7a6a52", "#6a51a3", "#1b7837", "#00707b", "#a4373a", "#b7791f", "#4a5b6a"];
export const OTHER_COLOR = "#8d9ba6";

export const sliceColor = (index: number, key: string): string =>
  key === "other" ? OTHER_COLOR : CATEGORICAL[index % CATEGORICAL.length];

const r2 = (v: number): number => Math.round(v * 100) / 100;

/** Point on a circle; angles run clockwise from 12 o'clock. */
const polar = (cx: number, cy: number, r: number, a: number): [number, number] => [r2(cx + r * Math.sin(a)), r2(cy - r * Math.cos(a))];

/**
 * SVG path of a ring sector between radii r0 (inner) and r1 (outer) from
 * angle a0 to a1. A full turn draws as two half rings (one arc cannot close on
 * itself); render with fill-rule evenodd. Empty for a zero span.
 */
export function arcPath(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number): string {
  const span = a1 - a0;
  if (span <= 0) return "";
  if (span >= TAU - 1e-9) {
    const ring = (r: number) => {
      const [tx, ty] = polar(cx, cy, r, 0);
      const [bx, by] = polar(cx, cy, r, Math.PI);
      return `M${tx} ${ty} A${r} ${r} 0 1 1 ${bx} ${by} A${r} ${r} 0 1 1 ${tx} ${ty} Z`;
    };
    return `${ring(r1)} ${ring(r0)}`;
  }
  const large = span > Math.PI ? 1 : 0;
  const [x0, y0] = polar(cx, cy, r1, a0);
  const [x1, y1] = polar(cx, cy, r1, a1);
  const [x2, y2] = polar(cx, cy, r0, a1);
  const [x3, y3] = polar(cx, cy, r0, a0);
  return `M${x0} ${y0} A${r1} ${r1} 0 ${large} 1 ${x1} ${y1} L${x2} ${y2} A${r0} ${r0} 0 ${large} 0 ${x3} ${y3} Z`;
}

/** Translation that "explodes" a slice: `px` outward along its middle angle. */
export const explodeOffset = (mid: number, px: number): { dx: number; dy: number } => ({
  dx: r2(px * Math.sin(mid)) || 0, // never -0
  dy: r2(-px * Math.cos(mid)) || 0,
});

/** Start and end angles of consecutive slices, in the values' order. */
export function sliceAngles(values: number[]): Array<{ a0: number; a1: number }> {
  const total = values.reduce((s, v) => s + Math.max(0, v), 0);
  let a = 0;
  return values.map((v) => {
    const span = total > 0 ? (Math.max(0, v) / total) * TAU : 0;
    const out = { a0: a, a1: a + span };
    a += span;
    return out;
  });
}

/** Share of a total as a percent, or null when there is no total. */
export const share = (count: number, total: number): number | null => (total > 0 ? (100 * count) / total : null);

/** Which of five ramp steps a 0–100 percent falls in (breaks at 20, 40, 60, 80). */
export const rampStep = (pct: number): number => Math.max(0, Math.min(4, Math.floor(pct / 20)));
