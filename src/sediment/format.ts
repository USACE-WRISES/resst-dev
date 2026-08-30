// Display formatting for sedimentation values. The data files are metric
// (RATTES/ResNet native m³); the app displays acre-feet — the unit the NID
// panel section already speaks and US reservoir practice expects (owner
// decision). Pure module: unit-tested in Node.

import { M3_PER_ACFT } from "./types";

export const m3ToAcft = (m3: number): number => m3 / M3_PER_ACFT;

/** Compact volume: "1.2M ac-ft", "845k ac-ft", "312 ac-ft". null-safe. */
export function formatVolumeAcft(m3: number | null | undefined): string {
  if (m3 == null || !Number.isFinite(m3)) return "—";
  const v = m3ToAcft(m3);
  return `${compact(v)} ac-ft`;
}

/** Compact unitless number: 1234567 → "1.23M". Three significant figures. */
export function compact(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e9) return trim3(v / 1e9) + "B";
  if (abs >= 1e6) return trim3(v / 1e6) + "M";
  if (abs >= 1e3) return trim3(v / 1e3) + "k";
  if (abs >= 10 || v === 0 || Number.isInteger(v)) return String(Math.round(v));
  return trim3(v);
}

const trim3 = (v: number): string => {
  const s = v.toPrecision(3);
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
};

/** Percent of original capacity lost by `sed`, e.g. "16%". null when unknowable. */
export function pctLost(sedM3: number | null | undefined, capOrigM3: number | null | undefined): number | null {
  if (sedM3 == null || capOrigM3 == null || !Number.isFinite(sedM3) || !Number.isFinite(capOrigM3) || capOrigM3 <= 0)
    return null;
  return (100 * sedM3) / capOrigM3;
}

export function formatPct(pct: number | null | undefined): string {
  if (pct == null || !Number.isFinite(pct)) return "—";
  if (pct > 0 && pct < 1) return "<1%";
  return `${Math.round(pct)}%`;
}

/** Recent modeled accumulation rate from the shipped primitives, m³/yr. */
export function annualRateM3(sed2025: number | null | undefined, sed2015: number | null | undefined): number | null {
  if (sed2025 == null || sed2015 == null || !Number.isFinite(sed2025) || !Number.isFinite(sed2015)) return null;
  return (sed2025 - sed2015) / 10;
}

/** "12,400 ac-ft/yr" (rate formatting keeps a per-year suffix). */
export function formatRateAcftPerYear(m3PerYear: number | null | undefined): string {
  if (m3PerYear == null || !Number.isFinite(m3PerYear)) return "—";
  return `${compact(m3ToAcft(m3PerYear))} ac-ft/yr`;
}

/** Area in km² → "18,200 km²" (rounded to 3 significant figures, grouped). */
export function formatKm2(km2: number | null | undefined): string {
  if (km2 == null || !Number.isFinite(km2)) return "—";
  const v = Number(km2.toPrecision(3));
  return `${v.toLocaleString("en-US")} km²`;
}

/** Insert spaces into synthetic CamelCase names ("SacramentoRiver" → "Sacramento River"). */
export const prettifyName = (s: string): string => s.replace(/([a-z])([A-Z])/g, "$1 $2");
