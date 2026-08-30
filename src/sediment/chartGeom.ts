// Pure geometry for the storage-trajectory chart: maps a reservoir's RATTES
// series (+ measured RESSED surveys and CI bounds) into viewBox-space paths,
// ticks, and an accessible summary. No React, no DOM — vitest exercises this
// directly, and TrajectoryChart.tsx just draws what it returns.
//
// All input volumes are m³ (the data files' unit); every output label and the
// y scale are acre-feet (the app's display unit — owner decision). The
// measured-vs-modeled distinction is structural: model series are lines/areas
// split into solid (≤ nowYear) and dashed (projected) segments; measured
// surveys are discrete dots.

import { compact, m3ToAcft } from "./format";

export interface TrajectoryChartInput {
  /** Reservoir/site display name (for the accessible summary). */
  name: string;
  /** Grid years (ascending) with the two model series, m³. */
  years: number[];
  capacityM3: number[];
  sedimentM3: number[];
  /** First year with storage — anchors the series at (yr0, capOrig, 0). */
  yr0: number | null;
  /** Measured survey capacities, m³ (dots). */
  surveys?: Array<{ year: number; capM3: number | null }>;
  /** 95% CI whiskers on capacity at benchmark years. */
  ci?: Array<{ year: number; capHi: number | null; capLo: number | null }>;
  /** Boundary between modeled past and projection (default 2025). */
  nowYear?: number;
  /** viewBox size (defaults 300 × 190). */
  width?: number;
  height?: number;
}

export interface ChartPoint {
  x: number;
  y: number;
  year: number;
  /** Display value, acre-feet. */
  acft: number;
}

export interface TrajectoryChartGeometry {
  width: number;
  height: number;
  plot: { x: number; y: number; w: number; h: number };
  xTicks: Array<{ x: number; label: string }>;
  yTicks: Array<{ y: number; label: string }>;
  /** Capacity line, split at nowYear (the boundary point is in both). */
  capSolid: string;
  capDashed: string;
  /** Sediment area fill (whole span) and its top-edge outline, split. */
  sedArea: string;
  sedSolid: string;
  sedDashed: string;
  /** Projected-region backdrop: x of nowYear through the right plot edge. */
  projectedX: number | null;
  /** Dashed hairline at original capacity. */
  originalY: number | null;
  surveyPts: ChartPoint[];
  whiskers: Array<{ x: number; yLo: number; yHi: number; year: number }>;
  /** Accessible one-sentence summary (chart aria-label). */
  summaryText: string;
}

const MARGIN = { top: 10, right: 12, bottom: 22, left: 46 };

export function buildTrajectoryGeometry(input: TrajectoryChartInput): TrajectoryChartGeometry | null {
  const { years, capacityM3, sedimentM3 } = input;
  if (years.length === 0 || years.length !== capacityM3.length || years.length !== sedimentM3.length) return null;
  const nowYear = input.nowYear ?? 2025;
  const width = input.width ?? 300;
  const height = input.height ?? 190;
  const plot = {
    x: MARGIN.left,
    y: MARGIN.top,
    w: width - MARGIN.left - MARGIN.right,
    h: height - MARGIN.top - MARGIN.bottom,
  };

  // Anchor the model series at construction: capacity = capOrig, sediment = 0.
  const capOrig = capacityM3[0] + sedimentM3[0];
  const anchorYear = input.yr0 != null && input.yr0 < years[0] ? input.yr0 : null;
  const capSeries: Array<[number, number]> = anchorYear != null ? [[anchorYear, capOrig]] : [];
  const sedSeries: Array<[number, number]> = anchorYear != null ? [[anchorYear, 0]] : [];
  for (let i = 0; i < years.length; i++) {
    capSeries.push([years[i], capacityM3[i]]);
    sedSeries.push([years[i], sedimentM3[i]]);
  }

  const surveys = (input.surveys ?? []).filter((s): s is { year: number; capM3: number } => s.capM3 != null);
  const ci = (input.ci ?? []).filter((c) => c.capHi != null && c.capLo != null);

  const xMin = Math.min(capSeries[0][0], ...surveys.map((s) => s.year));
  const xMax = Math.max(years[years.length - 1], nowYear);
  const yMaxM3 = Math.max(
    capOrig,
    ...capSeries.map(([, v]) => v),
    ...sedSeries.map(([, v]) => v),
    ...surveys.map((s) => s.capM3),
    ...ci.map((c) => c.capHi as number),
  );
  if (!(yMaxM3 > 0) || !(xMax > xMin)) return null;

  const xSpan = xMax - xMin;
  const x = (year: number) => plot.x + ((year - xMin) / xSpan) * plot.w;
  const yMaxAcft = m3ToAcft(yMaxM3) * 1.05;
  const y = (m3: number) => plot.y + plot.h - (m3ToAcft(m3) / yMaxAcft) * plot.h;
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const pt = (year: number, m3: number) => `${r2(x(year))} ${r2(y(m3))}`;
  const path = (pts: Array<[number, number]>) => (pts.length ? "M" + pts.map(([yr, v]) => pt(yr, v)).join(" L") : "");

  // Split each series at nowYear (grid years include it; the anchor never passes it).
  const splitAt = (series: Array<[number, number]>): [Array<[number, number]>, Array<[number, number]>] => {
    const past = series.filter(([yr]) => yr <= nowYear);
    const future = series.filter(([yr]) => yr >= nowYear);
    return [past, future.length > 1 ? future : []];
  };
  const [capPast, capFuture] = splitAt(capSeries);
  const [sedPast, sedFuture] = splitAt(sedSeries);

  const baselineY = r2(plot.y + plot.h);
  const sedArea =
    sedSeries.length > 1
      ? `M${r2(x(sedSeries[0][0]))} ${baselineY} L` +
        sedSeries.map(([yr, v]) => pt(yr, v)).join(" L") +
        ` L${r2(x(sedSeries[sedSeries.length - 1][0]))} ${baselineY} Z`
      : "";

  // Y ticks: 4 nice steps in acre-feet.
  const rawStep = yMaxAcft / 4;
  const mag = 10 ** Math.floor(Math.log10(rawStep));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= rawStep) ?? rawStep;
  const yTicks: Array<{ y: number; label: string }> = [];
  for (let v = 0; v <= yMaxAcft; v += step) {
    yTicks.push({ y: r2(plot.y + plot.h - (v / yMaxAcft) * plot.h), label: compact(v) });
  }

  // X ticks: decades (or 20/50-year steps for long spans), plus the last year.
  const xStep = xSpan > 220 ? 50 : xSpan > 110 ? 20 : 10;
  const xTicks: Array<{ x: number; label: string }> = [];
  for (let yr = Math.ceil(xMin / xStep) * xStep; yr <= xMax; yr += xStep) {
    if (xMax - yr < xStep / 2 && yr !== xMax) continue; // avoid crowding the final label
    xTicks.push({ x: r2(x(yr)), label: String(yr) });
  }
  if (xTicks.length === 0 || xTicks[xTicks.length - 1].label !== String(xMax))
    xTicks.push({ x: r2(x(xMax)), label: String(xMax) });

  const capNow = capSeries.find(([yr]) => yr === nowYear)?.[1] ?? null;
  const sedNow = sedSeries.find(([yr]) => yr === nowYear)?.[1] ?? null;
  const capEnd = capSeries[capSeries.length - 1][1];
  const pctLostNow = capNow != null && sedNow != null && capOrig > 0 ? Math.round((100 * sedNow) / capOrig) : null;
  const fmt = (m3: number) => `${compact(m3ToAcft(m3))} ac-ft`;
  const summaryText =
    `Storage trajectory for ${input.name}: original capacity ${fmt(capOrig)}` +
    (input.yr0 != null ? ` (${input.yr0})` : "") +
    (capNow != null ? `; modeled ${fmt(capNow)} remaining in ${nowYear}` : "") +
    (pctLostNow != null ? ` (${pctLostNow}% lost)` : "") +
    (years[years.length - 1] > nowYear ? `; projected ${fmt(capEnd)} by ${years[years.length - 1]}` : "") +
    `. ${surveys.length ? `${surveys.length} measured survey${surveys.length === 1 ? "" : "s"} shown.` : "No measured capacity points shown."}`;

  return {
    width,
    height,
    plot,
    xTicks,
    yTicks,
    capSolid: path(capPast),
    capDashed: path(capFuture),
    sedArea,
    sedSolid: path(sedPast),
    sedDashed: path(sedFuture),
    projectedX: xMax > nowYear ? r2(x(nowYear)) : null,
    originalY: r2(y(capOrig)),
    surveyPts: surveys.map((s) => ({ x: r2(x(s.year)), y: r2(y(s.capM3)), year: s.year, acft: m3ToAcft(s.capM3) })),
    whiskers: ci.map((c) => ({
      x: r2(x(c.year)),
      yHi: r2(y(c.capHi as number)),
      yLo: r2(y(c.capLo as number)),
      year: c.year,
    })),
    summaryText,
  };
}
