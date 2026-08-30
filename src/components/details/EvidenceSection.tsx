// "How certain are we?" — separates what was MEASURED (RESSED bathymetric
// surveys) from what is MODELED (everything in the Sustainability section).
// The section badge classifies the evidence even while collapsed.

import { useEffect, useState } from "react";
import type { SelectedSite } from "../../state/derive";
import { useAppState } from "../../state/store";
import { ensureSurveys, surveysForRow } from "../../sediment/data";
import { formatVolumeAcft } from "../../sediment/format";
import { PROVENANCE, type SiteSedimentLink } from "../../sediment/types";
import { ProvBadge, ProvNote } from "./Provenance";

/** Section-header badge — renders from boot data, before any lazy load. */
export function evidenceBadge(link: SiteSedimentLink) {
  if (!link.has_surveys) return <ProvBadge kind="modeled" label="Modeled only" />;
  return <ProvBadge kind="measured" label={link.latest_survey_year ? `Measured · ${link.latest_survey_year}` : "Measured"} />;
}

export function EvidenceSection({ selected }: { selected: SelectedSite }) {
  const link = selected.sedimentLink;
  const row = selected.reservoirRow;
  useAppState(); // re-render on sedimentStamp
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!link?.has_surveys) return;
    setError(false);
    ensureSurveys().catch(() => setError(true));
  }, [link, retryKey]);

  if (!link) return null;

  if (!link.has_surveys) {
    return (
      <>
        <p className="muted">
          No measured sedimentation surveys are on record for this reservoir in RESSED (2013 compilation). The
          Reservoir Sustainability values are model estimates only.
        </p>
        <ProvNote text="Evidence check: USGS RESSED, 2013 public export" group={PROVENANCE.ressed} />
      </>
    );
  }

  const surveys = row != null ? surveysForRow(row) : null;
  const recency =
    link.latest_survey_year != null && link.latest_survey_year >= 2000
      ? "a relatively recent measured survey"
      : "older measured surveys";
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
      <ProvNote text="Measured surveys: USGS RESSED, 2013 public export (survey methods and datums vary)" group={PROVENANCE.ressed} />
    </>
  );
}
