// "How certain are we?" — separates what was MEASURED (RESSED bathymetric
// surveys) from what is MODELED (everything in the Sustainability section).
// Works for crosswalked sites (badge year known at boot) and national-layer
// reservoirs (badge year fills in once the survey slice loads). The section
// badge classifies the evidence even while collapsed.

import { useEffect, useState, type ReactNode } from "react";
import { useAppState } from "../../state/store";
import { ensureSurveys, getCore, surveysForRow } from "../../sediment/data";
import { formatVolumeAcft } from "../../sediment/format";
import { PROVENANCE } from "../../sediment/types";
import { ProvBadge, ProvNote } from "./Provenance";

/** The RATTES component that modeled this reservoir (null until the core loads). */
function RattesClassLine({ row }: { row: number | null }) {
  const core = getCore();
  if (!core || row == null) return null;
  const cls = core.evd[row];
  if (cls === 1) {
    return (
      <p className="rattes-class">
        <ProvBadge kind="measured" label="Survey-constrained" /> RATTES models this reservoir with its
        survey-constrained sediment-yield component — it has qualifying repeat sedimentation surveys in the model's
        compilation (Supplementary Data 1).
      </p>
    );
  }
  if (cls === 2) {
    return (
      <p className="rattes-class">
        <ProvBadge kind="modeled" label="Statistical prediction" /> RATTES models this reservoir with its statistical
        (regression) component — no qualifying repeat-survey history in the model's compilation.
      </p>
    );
  }
  return null;
}

/** Section-header badge — renders before any lazy load when latestYear is known. */
export function evidenceBadgeFor(hasSurveys: boolean, latestYear: number | null | undefined): ReactNode {
  if (!hasSurveys) return <ProvBadge kind="modeled" label="Modeled only" />;
  return <ProvBadge kind="measured" label={latestYear ? `Measured · ${latestYear}` : "Measured"} />;
}

export function EvidenceSection({
  row,
  hasSurveys,
  latestYear,
}: {
  row: number | null;
  hasSurveys: boolean;
  /** Most recent survey year when known at render time (site links carry it). */
  latestYear?: number | null;
}) {
  useAppState(); // re-render on sedimentStamp
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!hasSurveys) return;
    setError(false);
    ensureSurveys().catch(() => setError(true));
  }, [hasSurveys, retryKey]);

  if (!hasSurveys) {
    return (
      <>
        <p className="muted">
          No measured sedimentation surveys are on record for this reservoir in RESSED (2013 compilation). The
          Reservoir Sustainability values are model estimates only.
        </p>
        <RattesClassLine row={row} />
        <ProvNote text="Evidence check: USGS RESSED, 2013 public export" group={PROVENANCE.ressed} />
      </>
    );
  }

  const surveys = row != null ? surveysForRow(row) : null;
  const newest = latestYear ?? (surveys?.length ? surveys[surveys.length - 1].year : null);
  const recency = newest != null && newest >= 2000 ? "a relatively recent measured survey" : "older measured surveys";
  return (
    <>
      <p className="evidence-intro">
        This reservoir has {recency} on record — measured values below, modeled estimates in Reservoir Sustainability.
      </p>
      {error ? (
        <p className="sec-status" data-status="error">
          Surveys failed to load.{" "}
          <button type="button" className="linklike" onClick={() => setRetryKey((k) => k + 1)}>
            Retry
          </button>
        </p>
      ) : surveys == null ? (
        <p className="sec-status" data-status="loading">
          Loading measured surveys…
        </p>
      ) : surveys.length === 0 ? (
        <p className="muted">Survey records exist but could not be listed for this reservoir.</p>
      ) : (
        <>
          <ul className="survey-list">
            {surveys.map((s, i) => (
              <li key={`${s.year}-${i}`}>
                <b>{s.year}</b>
                {s.capM3 != null && <> — measured capacity {formatVolumeAcft(s.capM3)}</>}
                {s.sedTotM3 != null && <> · interval sediment {formatVolumeAcft(s.sedTotM3)}</>}
                {s.capM3 == null && s.sedTotM3 == null && (
                  <span className="muted"> — survey conducted; values not in the public compilation</span>
                )}
                {s.pool && <span className="muted"> · pool {s.pool}</span>}
              </li>
            ))}
          </ul>
          {surveys.every((s) => s.capM3 == null) && (
            <p className="muted">
              Measured capacities from these surveys were not published in the 2013 RESSED export, so the chart shows
              the modeled trajectory without measured points.
            </p>
          )}
        </>
      )}
      <RattesClassLine row={row} />
      <ProvNote text="Measured surveys: USGS RESSED, 2013 public export (survey methods and datums vary)" group={PROVENANCE.ressed} />
    </>
  );
}
