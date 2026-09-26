// "How certain are we?" — separates what was MEASURED (RESSED bathymetric
// surveys) from what is MODELED (everything in the Sustainability card).
// Works for crosswalked sites (badge year known at boot) and national-layer
// reservoirs (badge year fills in once the survey slice loads). The section
// badge classifies the evidence even while collapsed.
//
// Layout: a one-line summary and the RATTES class, the surveys as a compact
// Year | Capacity | Sediment table, the per-survey method, pool and notes
// behind a "Survey methods and notes" disclosure (the export's codes spelled
// out, glossary popover for the rest), then the original-record links.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMapViewState } from "../../state/store";
import { ensureSurveys, getCore, surveyProvenanceForRow, surveysForRow } from "../../sediment/data";
import { compact, m3ToAcft, surveyMethodText, surveyMonthLabel } from "../../sediment/format";
import { PROVENANCE, SURVEY_POOL_LABELS, ressedDatasheetUrl } from "../../sediment/types";
import { useDismissPopover } from "../../map/useDismissPopover";
import { ExternalLink } from "../icons";
import { ProvBadge } from "./Provenance";
import { SourceLine } from "./ui";
import { usePanelPopover } from "./usePanelPopover";

const RESSED_LIST_URL = "https://water.usgs.gov/osw/ressed/list_reservoirs/index.html";

/** The RATTES component that modeled this reservoir (null until the core loads). */
function RattesClassLine({ row }: { row: number | null }) {
  const core = getCore();
  if (!core || row == null) return null;
  const cls = core.evd[row];
  if (cls === 1) {
    return (
      <p className="rattes-class">
        <ProvBadge kind="measured" label="Survey-constrained" /> RATTES calibrates this reservoir's estimate to its
        repeat surveys.
      </p>
    );
  }
  if (cls === 2) {
    return (
      <p className="rattes-class">
        <ProvBadge kind="modeled" label="Statistical prediction" /> RATTES estimates this reservoir statistically (no
        qualifying repeat surveys).
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
  const popRef = useRef<HTMLSpanElement>(null);
  useDismissPopover(open, ref, () => setOpen(false));
  usePanelPopover(open, ref, popRef, true); // spans the link row; just scroll it into view
  return (
    <span className="prov-info codes-info" ref={ref}>
      <button type="button" className="text-btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        About survey codes
      </button>
      {open && (
        <span className="prov-pop codes-pop" role="group" aria-label="RESSED survey code glossary" ref={popRef}>
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

/** Who surveyed and who supplied the data, said once when they are the same. */
function AgencyLine({ row }: { row: number | null }) {
  const prov = row != null ? surveyProvenanceForRow(row) : null;
  if (!prov || (!prov.agency && !prov.supplier)) return null;
  const text =
    prov.agency && prov.agency === prov.supplier
      ? `Surveys and data by ${prov.agency}.`
      : [prov.agency && `Surveys by ${prov.agency}.`, prov.supplier && `Data supplied by ${prov.supplier}.`]
          .filter(Boolean)
          .join(" ");
  return <p className="muted evidence-agency">{text}</p>;
}

/** Links to the original RESSED records and the code glossary, in one row. */
function RecordLinks({ row }: { row: number | null }) {
  const prov = row != null ? surveyProvenanceForRow(row) : null;
  const dsUrl = ressedDatasheetUrl(prov?.ressedId ?? null);
  return (
    <div className="evidence-links">
      {dsUrl && (
        <a href={dsUrl} target="_blank" rel="noopener noreferrer">
          Original datasheet (PDF) <ExternalLink />
        </a>
      )}
      <a href={RESSED_LIST_URL} target="_blank" rel="noopener noreferrer">
        All RESSED datasheets <ExternalLink />
      </a>
      <CodesInfo />
    </div>
  );
}

const acft = (m3: number | null) => (m3 == null || !Number.isFinite(m3) ? "—" : compact(m3ToAcft(m3)));

export function EvidenceSection({
  row,
  hasSurveys,
}: {
  row: number | null;
  hasSurveys: boolean;
  /** Most recent survey year when known at render time (site links carry it); badge-only, see evidenceBadgeFor. */
  latestYear?: number | null;
}) {
  useMapViewState(); // re-render on sedimentStamp
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
        <p className="card-lead">
          No measured sedimentation surveys are on record in RESSED (2013 compilation). The Reservoir Sustainability
          values are model estimates only.
        </p>
        <RattesClassLine row={row} />
        <SourceLine text="Checked against USGS RESSED, 2013 public export" group={PROVENANCE.ressed} />
      </>
    );
  }

  const surveys = row != null ? surveysForRow(row) : null;
  const years = (surveys ?? []).map((s) => s.year);
  // Many USACE survey dates carry no published values; a table of dashes
  // says nothing, so those reservoirs get one plain sentence instead.
  const anyValues = (surveys ?? []).some((s) => s.capM3 != null || s.sedTotM3 != null);
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
          <p className="card-lead">
            <b>
              {surveys.length} measured survey{surveys.length === 1 ? "" : "s"}
            </b>
            {" · "}
            {Math.min(...years) === Math.max(...years) ? years[0] : `${Math.min(...years)} to ${Math.max(...years)}`}
          </p>
          <RattesClassLine row={row} />
          {anyValues ? (
            <>
              <table className="survey-table">
                <caption className="sr-only">Measured sedimentation surveys, acre-feet</caption>
                <thead>
                  <tr>
                    <th scope="col">Year</th>
                    <th scope="col">Capacity</th>
                    <th scope="col">Sediment since prior</th>
                  </tr>
                </thead>
                <tbody>
                  {surveys.map((s, i) => (
                    <tr key={`${s.year}-${i}`}>
                      <td>{s.year}</td>
                      <td>{acft(s.capM3)}</td>
                      <td>{acft(s.sedTotM3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="table-note">
                Acre-feet, as measured. A dash marks a value the 2013 export did not publish
                {surveys.every((s) => s.capM3 == null) ? ", so the chart shows the modeled line only." : "."}
              </p>
            </>
          ) : (
            <p className="card-note">
              The 2013 RESSED export published no measured values for these surveys, so the chart shows the modeled
              line only.
            </p>
          )}
          <details className="survey-details">
            <summary>Survey methods and notes</summary>
            <ul>
              {surveys.map((s, i) => {
                const month = surveyMonthLabel(s.date);
                const parts = [
                  surveyMethodText(s),
                  s.pool ? (SURVEY_POOL_LABELS[s.pool] ?? `pool ${s.pool}`) : "",
                  anyValues && s.capM3 == null && s.sedTotM3 == null
                    ? "survey date on record; no measured values in the 2013 export"
                    : "",
                ].filter(Boolean);
                return (
                  <li key={`${s.year}-${i}`}>
                    <b>{s.year}</b>
                    {month && ` (${month})`}
                    {parts.length > 0 && `: ${parts.join(" · ")}`}
                    {s.note && <span className="survey-note">{s.note}</span>}
                  </li>
                );
              })}
            </ul>
          </details>
          <AgencyLine row={row} />
          <RecordLinks row={row} />
        </>
      )}
      <SourceLine text="USGS RESSED, 2013 public export · methods and datums vary" group={PROVENANCE.ressed} />
    </>
  );
}
