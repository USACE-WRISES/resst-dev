// "How serious is the sedimentation problem?" — the two headline losses, a
// capacity bar that shows them at a glance, the supporting volumes, and the
// trajectory chart. Works for two callers: a crosswalked RESST site (stats
// render instantly from the boot-loaded link) and a national-layer
// reservoir (stats come from the loaded core row). Labels always say
// Estimated/Projected — never a bare "Current Storage" (a user could read
// that as today's water volume). The labels match the Dam Report's.

import { useEffect, useState } from "react";
import { useAppState } from "../../state/store";
import { ensureCore, ensureSurveys, ensureTrajectory, getCore, getTrajectory, surveysForRow } from "../../sediment/data";
import { annualRateM3, formatPct, formatRateAcftPerYear, formatVolumeAcft, pctLost } from "../../sediment/format";
import { PROVENANCE, type SiteSedimentLink } from "../../sediment/types";
import { TrajectoryChart } from "../charts/TrajectoryChart";
import { KeyValues, Metric, SourceLine } from "./ui";

/** Original capacity as a bar: lost by 2025 (solid), lost by 2050 (hatched), remaining. */
function CapacityBar({ lost2025, lost2050 }: { lost2025: number | null; lost2050: number | null }) {
  if (lost2025 == null) return null;
  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  const a = clamp(lost2025);
  const b = lost2050 == null ? a : clamp(Math.max(a, lost2050));
  const label =
    `Estimated ${formatPct(lost2025)} of original capacity lost by 2025` +
    (lost2050 != null ? `; projected ${formatPct(lost2050)} by 2050` : "");
  return (
    <div className="cap-bar" role="img" aria-label={label} title={label}>
      <span className="cap-bar-lost" style={{ width: `${a}%` }} />
      <span className="cap-bar-proj" style={{ left: `${a}%`, width: `${b - a}%` }} />
    </div>
  );
}

/** Header peek for the Sustainability card ("74% lost"), or null when unknown. */
export function sustainabilityPeek(sedM3: number | null | undefined, capOrigM3: number | null | undefined): string | null {
  const lost = pctLost(sedM3, capOrigM3);
  return lost == null ? null : `${formatPct(lost)} lost`;
}

export function SustainabilitySection({
  name,
  row,
  link,
  hasSurveys,
}: {
  /** Display name for the chart's accessible summary. */
  name: string;
  /** Inventory row when known (resolves via the core for link-only callers). */
  row: number | null;
  /** Site crosswalk link — instant headline stats + method note. Null for
      national-layer reservoirs (stats read from the core instead). */
  link: SiteSedimentLink | null;
  hasSurveys: boolean;
}) {
  useAppState(); // re-render when sedimentStamp bumps (core/chunk/surveys arrive)
  const [chartError, setChartError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  const targetKey = link ? link.short_id : row;
  useEffect(() => {
    if (targetKey == null) return;
    let cancelled = false;
    setChartError(false);
    (async () => {
      try {
        const core = await ensureCore();
        const r = row ?? (link ? core.rowById.get(link.short_id) : undefined);
        if (r == null || cancelled) return;
        await ensureTrajectory(r);
      } catch {
        if (!cancelled) setChartError(true);
      }
    })();
    if (hasSurveys) void ensureSurveys().catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey, retryKey]);

  const core = getCore();
  const nn = (v: number | undefined) => (v != null && Number.isFinite(v) ? v : null);
  const stats = link
    ? {
        capOrig: link.cap_orig_m3,
        cap2025: link.cap2025_m3,
        sed2025: link.sed2025_m3,
        sed2015: link.sed2015_m3,
        cap2050: link.cap2050_m3,
        sed2050: link.sed2050_m3,
      }
    : core && row != null
      ? {
          capOrig: nn(core.capOrig[row]),
          cap2025: nn(core.cap2025[row]),
          sed2025: nn(core.sed2025[row]),
          sed2015: nn(core.sed2015[row]),
          cap2050: nn(core.cap2050[row]),
          sed2050: nn(core.sed2050[row]),
        }
      : null;
  if (!stats) {
    return (
      <p className="sec-status" data-status="loading">
        Loading national dataset…
      </p>
    );
  }

  const traj = row != null ? getTrajectory(row) : undefined;
  const surveys = row != null && hasSurveys ? surveysForRow(row) : null;
  const ci2050 = traj?.ci.find((c) => c.year === 2050);
  let range2050: string | undefined;
  if (ci2050 && ci2050.capLo != null && ci2050.capHi != null) {
    const lo = formatVolumeAcft(ci2050.capLo);
    const hi = formatVolumeAcft(ci2050.capHi);
    // The CI bounds are independent model runs; near capacity exhaustion they
    // converge and a "71k–71k" range reads as noise — show it only when it says something.
    if (lo !== hi) range2050 = `95% range ${lo.replace(" ac-ft", "")}–${hi}`;
  }
  const lost2025 = pctLost(stats.sed2025, stats.capOrig);
  const lost2050 = pctLost(stats.sed2050, stats.capOrig);

  return (
    <>
      <div className="metric-row">
        <Metric value={formatPct(lost2025)} label="Est. capacity lost (2025)" />
        <Metric value={formatPct(lost2050)} label="Projected lost by 2050" />
      </div>
      <CapacityBar lost2025={lost2025} lost2050={lost2050} />
      <KeyValues
        numeric
        rows={[
          { label: "Original storage capacity", value: formatVolumeAcft(stats.capOrig) },
          { label: "Est. remaining capacity (2025)", value: formatVolumeAcft(stats.cap2025) },
          { label: "Est. accumulated sediment (2025)", value: formatVolumeAcft(stats.sed2025) },
          { label: "Est. annual accumulation", value: formatRateAcftPerYear(annualRateM3(stats.sed2025, stats.sed2015)) },
          { label: "Projected capacity (2050)", value: formatVolumeAcft(stats.cap2050), sub: range2050 },
        ]}
      />
      {chartError ? (
        <p className="sec-status" data-status="error">
          Trajectory failed to load.{" "}
          <button type="button" className="linklike" onClick={() => setRetryKey((k) => k + 1)}>
            Retry
          </button>
        </p>
      ) : traj === undefined ? (
        <p className="sec-status" data-status="loading">
          Loading modeled trajectory…
        </p>
      ) : traj === null || traj.years.length === 0 ? (
        <p className="muted">No modeled trajectory is available for this reservoir.</p>
      ) : (
        <TrajectoryChart
          name={name}
          years={traj.years}
          capacityM3={traj.capacityM3}
          sedimentM3={traj.sedimentM3}
          yr0={traj.yr0}
          surveys={(surveys ?? []).map((s) => ({ year: s.year, capM3: s.capM3 }))}
          ci={traj.ci.map((c) => ({ year: c.year, capHi: c.capHi, capLo: c.capLo }))}
        />
      )}
      {link?.method === "spatial_name" && (
        <p className="card-note">
          Matched to ResNet dam {link.nid} by location and name ({link.confidence} confidence).
        </p>
      )}
      <SourceLine text="RATTES v1.2 · silt scenario · modeled estimate" group={PROVENANCE.rattes} />
    </>
  );
}
