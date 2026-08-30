// "How certain are we?" — separates what was MEASURED (RESSED bathymetric
// surveys) from what is MODELED (everything in the Sustainability section).
// Works for crosswalked sites (badge year known at boot) and national-layer
// reservoirs (badge year fills in once the survey slice loads). The section
// badge classifies the evidence even while collapsed. Survey rows spell out
// the export's method/scope/pool codes (glossary popover for the rest), and
// the Original records block links the scanned RESSED datasheet when the
// legacy RESIS datasheet number exists.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useAppState } from "../../state/store";
import { ensureSurveys, getCore, surveyProvenanceForRow, surveysForRow } from "../../sediment/data";
import { formatVolumeAcft, surveyMethodText, surveyMonthLabel } from "../../sediment/format";
import { PROVENANCE, SURVEY_POOL_LABELS, ressedDatasheetUrl } from "../../sediment/types";
import { useDismissPopover } from "../../map/useDismissPopover";
import { ProvBadge, ProvNote } from "./Provenance";

/** The RATTES component that modeled this reservoir (null until the core loads). */
function RattesClassLine({ row }: { row: number | null }) {
  const core = getCore();
  if (!core || row == null) return null;
  const cls = core.evd[row];
  if (cls === 1) {
    return (
      <p className="rattes-class">
        <ProvBadge kind="measured" label="Survey-constrained" /> RATTES calibrates this reservoir's estimate to its
        repeat sedimentation surveys (Supplementary Data 1).
      </p>
    );
  }
  if (cls === 2) {
    return (
      <p className="rattes-class">
        <ProvBadge kind="modeled" label="Statistical prediction" /> RATTES estimates this reservoir statistically; it
        has no qualifying repeat surveys in the model's compilation.
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

/** Glossary for the export's survey codes; the honest wording is the contract. */
function CodesInfo() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useDismissPopover(open, ref, () => setOpen(false));
  return (
    <span className="prov-info codes-info" ref={ref}>
      <button type="button" className="linklike" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        About these survey codes
      </button>
      {open && (
        <span className="prov-pop codes-pop" role="group" aria-label="RESSED survey code glossary">
          <b>Pool</b>
          <span>
            Which part of the reservoir the survey covered. The public export never defines the letters; survey notes
            indicate T is the total pool and S is the sediment pool below the principal spillway. U appears only on
            USACE-contributed records, almost always without published values.
          </span>
          <b>Survey type and scope</b>
          <span>
            Range, contour, and range-and-contour methods and the detailed / semi-detailed / reconnaissance scopes are
            documented in USGS Data Series 434. Codes RLCS and TBS are not defined in the public documentation.
          </span>
          <b>Where the numbers live</b>
          <span>
            This app ships the 2013 public RESSED export. Some of its values are flagged as assumed rather than
            measured, and many USACE survey dates carry no published values at all. Original survey reports for
            Reclamation reservoirs are on RISE (data.usbr.gov); USACE district offices hold the records for Corps
            reservoirs.
          </span>
        </span>
      )}
    </span>
  );
}

/** Links to the original RESSED records: the scanned datasheet (legacy dsnum ids) and the USGS list. */
function OriginalRecords({ row }: { row: number | null }) {
  const prov = row != null ? surveyProvenanceForRow(row) : null;
  const dsUrl = ressedDatasheetUrl(prov?.ressedId ?? null);
  return (
    <>
      <div className="evidence-links">
        {dsUrl && (
          <a href={dsUrl} target="_blank" rel="noopener noreferrer">
            Original RESSED datasheet (PDF)
          </a>
        )}
        <a href="https://water.usgs.gov/osw/ressed/list_reservoirs/index.html" target="_blank" rel="noopener noreferrer">
          RESSED reservoir list and datasheets
        </a>
      </div>
      {prov && (prov.agency || prov.supplier) && (
        <p className="muted evidence-agency">
          {prov.agency && <>Surveys by {prov.agency}.</>}
          {prov.agency && prov.supplier ? " " : ""}
          {prov.supplier && <>Data supplied by {prov.supplier}.</>}
        </p>
      )}
    </>
  );
}

export function EvidenceSection({
  row,
  hasSurveys,
}: {
  row: number | null;
  hasSurveys: boolean;
  /** Most recent survey year when known at render time (site links carry it); badge-only, see evidenceBadgeFor. */
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
  return (
    <>
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
            {surveys.map((s, i) => {
              const month = surveyMonthLabel(s.date);
              const method = surveyMethodText(s);
              return (
                <li key={`${s.year}-${i}`}>
                  <b>{s.year}</b>
                  {month && <span className="muted"> ({month})</span>}
                  {s.capM3 != null && <> · measured capacity {formatVolumeAcft(s.capM3)}</>}
                  {s.sedTotM3 != null && <> · interval sediment {formatVolumeAcft(s.sedTotM3)}</>}
                  {s.capM3 == null && s.sedTotM3 == null && (
                    <span className="muted"> · survey date on record; no measured values in the public 2013 export</span>
                  )}
                  {method && <span className="muted"> · {method}</span>}
                  {s.pool && (
                    <span className="muted" title={`RESSED pool code ${s.pool}`}>
                      {" "}
                      · {SURVEY_POOL_LABELS[s.pool] ?? `pool ${s.pool}`}
                    </span>
                  )}
                  {s.note && <span className="survey-note muted">{s.note}</span>}
                </li>
              );
            })}
          </ul>
          {surveys.every((s) => s.capM3 == null) && (
            <p className="muted">
              Measured capacities from these surveys were not published in the 2013 RESSED export, so the chart shows
              the modeled trajectory without measured points.
            </p>
          )}
          <CodesInfo />
          <OriginalRecords row={row} />
        </>
      )}
      <RattesClassLine row={row} />
      <ProvNote text="Measured surveys: USGS RESSED, 2013 public export (survey methods and datums vary)" group={PROVENANCE.ressed} />
    </>
  );
}
