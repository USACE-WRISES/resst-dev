// "How serious is the sedimentation problem?" — RATTES headline stats plus
// the trajectory chart. Works for two callers: a crosswalked RESST site
// (stats render instantly from the boot-loaded link) and a national-layer
// reservoir (stats come from the loaded core row). Labels always say
// Estimated/Projected — never a bare "Current Storage" (a user could read
// that as today's water volume).

import { useEffect, useState } from "react";
import { useAppState } from "../../state/store";
import { ensureCore, ensureSurveys, ensureTrajectory, getCore, getTrajectory, surveysForRow } from "../../sediment/data";
import { annualRateM3, formatPct, formatRateAcftPerYear, formatVolumeAcft, pctLost } from "../../sediment/format";
import { PROVENANCE, type SiteSedimentLink } from "../../sediment/types";
import { TrajectoryChart } from "../charts/TrajectoryChart";
import { ProvNote } from "./Provenance";

function Stat({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div className={big ? "stat-cell stat-big" : "stat-cell"}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
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
  let proj2050 = formatVolumeAcft(stats.cap2050);
  if (ci2050 && ci2050.capLo != null && ci2050.capHi != null) {
    const lo = formatVolumeAcft(ci2050.capLo);
    const hi = formatVolumeAcft(ci2050.capHi);
    // The CI bounds are independent model runs; near capacity exhaustion they
    // converge and a "71k–71k" range reads as noise — show it only when it says something.
    if (lo !== hi) proj2050 += ` (${lo.replace(" ac-ft", "")}–${hi})`;
  }

  return (
    <>
      <div className="stat-grid">
        <Stat big label="Est. capacity lost (2025)" value={formatPct(pctLost(stats.sed2025, stats.capOrig))} />
        <Stat big label="Projected lost by 2050" value={formatPct(pctLost(stats.sed2050, stats.capOrig))} />
        <Stat label="Original storage capacity" value={formatVolumeAcft(stats.capOrig)} />
        <Stat label="Est. remaining capacity (2025)" value={formatVolumeAcft(stats.cap2025)} />
        <Stat label="Est. accumulated sediment (2025)" value={formatVolumeAcft(stats.sed2025)} />
        <Stat label="Est. annual accumulation" value={formatRateAcftPerYear(annualRateM3(stats.sed2025, stats.sed2015))} />
        <Stat label="Projected capacity (2050)" value={proj2050} />
      </div>
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
        <p className="prov-note">
          Linked to ResNet dam {link.nid} by location/name ({link.confidence} confidence); see
          data/site_resnet_crosswalk.csv.
        </p>
      )}
      <ProvNote text="RATTES v1.2 · silt scenario · modeled estimate" group={PROVENANCE.rattes} />
    </>
  );
}
