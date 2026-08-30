// "How serious is the sedimentation problem?" — RATTES headline stats render
// instantly from the boot-loaded site link; the trajectory chart (and its
// measured-survey overlay) lazy-loads the reservoir's chunk on first view.
// Labels always say Estimated/Projected — never a bare "Current Storage"
// (a user could read that as today's water volume).

import { useEffect, useState } from "react";
import type { SelectedSite } from "../../state/derive";
import { useAppState } from "../../state/store";
import { ensureCore, ensureSurveys, ensureTrajectory, getTrajectory, surveysForRow } from "../../sediment/data";
import { annualRateM3, formatPct, formatRateAcftPerYear, formatVolumeAcft, pctLost } from "../../sediment/format";
import { PROVENANCE } from "../../sediment/types";
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

export function SustainabilitySection({ selected }: { selected: SelectedSite }) {
  const link = selected.sedimentLink;
  const row = selected.reservoirRow;
  useAppState(); // re-render when sedimentStamp bumps (chunk/surveys arrive)
  const [chartError, setChartError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!link) return;
    let cancelled = false;
    setChartError(false);
    (async () => {
      try {
        const core = await ensureCore();
        const r = core.rowById.get(link.short_id);
        if (r == null || cancelled) return;
        await ensureTrajectory(r);
      } catch {
        if (!cancelled) setChartError(true);
      }
    })();
    if (link.has_surveys) void ensureSurveys().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [link, retryKey]);

  if (!link) return null;
  const lost2025 = pctLost(link.sed2025_m3, link.cap_orig_m3);
  const lost2050 = pctLost(link.sed2050_m3, link.cap_orig_m3);
  const traj = row != null ? getTrajectory(row) : undefined;
  const surveys = row != null && link.has_surveys ? surveysForRow(row) : null;
  const ci2050 = traj?.ci.find((c) => c.year === 2050);
  let proj2050 = formatVolumeAcft(link.cap2050_m3);
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
        <Stat big label="Est. capacity lost (2025)" value={formatPct(lost2025)} />
        <Stat big label="Projected lost by 2050" value={formatPct(lost2050)} />
        <Stat label="Original storage capacity" value={formatVolumeAcft(link.cap_orig_m3)} />
        <Stat label="Est. remaining capacity (2025)" value={formatVolumeAcft(link.cap2025_m3)} />
        <Stat label="Est. accumulated sediment (2025)" value={formatVolumeAcft(link.sed2025_m3)} />
        <Stat label="Est. annual accumulation" value={formatRateAcftPerYear(annualRateM3(link.sed2025_m3, link.sed2015_m3))} />
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
          name={selected.site.site_name}
          years={traj.years}
          capacityM3={traj.capacityM3}
          sedimentM3={traj.sedimentM3}
          yr0={traj.yr0}
          surveys={(surveys ?? []).map((s) => ({ year: s.year, capM3: s.capM3 }))}
          ci={traj.ci.map((c) => ({ year: c.year, capHi: c.capHi, capLo: c.capLo }))}
        />
      )}
      {link.method === "spatial_name" && (
        <p className="prov-note">
          Linked to ResNet dam {link.nid} by location/name ({link.confidence} confidence) — see
          data/site_resnet_crosswalk.csv.
        </p>
      )}
      <ProvNote text="RATTES v1.2 · silt scenario · modeled estimate" group={PROVENANCE.rattes} />
    </>
  );
}
