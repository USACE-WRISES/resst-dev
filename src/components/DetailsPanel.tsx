// The Selected Data panel (right side): pages through the selected sites —
// one at a time with Previous/Next, mirroring the Experience Builder
// feature-info pager. Section order puts the team-collected data first
// (attributes → Sediment Management → Site Literature), then the modeled
// national context for crosswalked sites (Reservoir Sustainability →
// Evidence), then the NID reference record. Every collapsible section starts
// collapsed (owner decision, round 3); the header badges still classify the
// contents, and a user's open/close choices stick for the session.
// Counters total across the whole selection.

import { useEffect, useState } from "react";
import type { AppData } from "../lib/types";
import type { Derived, SelectedSite } from "../state/derive";
import { NID_DETAIL_FIELDS, SITE_FIELD_LABELS, SITE_ID_FIELDS, SITE_MGMT_FIELDS } from "../config/fields";
import { actions, type AppState } from "../state/store";
import { PROVENANCE } from "../sediment/types";
import { CollapsibleSection } from "./details/CollapsibleSection";
import { PanelResizer } from "./PanelResizer";
import { ReportModal } from "../report/ReportModal";
import type { ReportTarget } from "../report/reportModel";
import { ProvBadge, ProvNote } from "./details/Provenance";
import { SustainabilitySection } from "./details/SustainabilitySection";
import { EvidenceSection, evidenceBadgeFor } from "./details/EvidenceSection";
import { NetworkSection } from "./details/NetworkSection";
import { ReservoirDetails } from "./details/ReservoirDetails";
import { ComparablesSection } from "./details/ComparablesSection";

function FieldList({ rows }: { rows: Array<{ label: string; value: string }> }) {
  return (
    <dl className="field-list">
      {rows
        .filter((r) => r.value !== "")
        .map((r) => (
          <div key={r.label} className="field-row">
            <dt>{r.label}</dt>
            <dd>
              {/^https?:\/\//i.test(r.value) ? (
                <a href={r.value} target="_blank" rel="noopener noreferrer">{r.value}</a>
              ) : (
                r.value
              )}
            </dd>
          </div>
        ))}
    </dl>
  );
}

function SiteDetails({ current, data }: { current: SelectedSite; data: AppData }) {
  const mgmtRows = SITE_MGMT_FIELDS.map((f) => ({
    label: SITE_FIELD_LABELS[f] ?? f,
    value: String(current.site[f] ?? ""),
  }));
  return (
    <>
      <section className="detail-section">
        <h3>{current.site.site_name}</h3>
        <FieldList
          rows={SITE_ID_FIELDS.map((f) => ({
            label: SITE_FIELD_LABELS[f] ?? f,
            value: String(current.site[f] ?? ""),
          }))}
        />
      </section>
      <CollapsibleSection id="mgmt" title="Sediment Management" defaultOpen={false} badge={<ProvBadge kind="reported" />}>
        {mgmtRows.every((r) => r.value === "") ? (
          <p className="muted">No sediment management keywords are recorded for this site.</p>
        ) : (
          <FieldList rows={mgmtRows} />
        )}
        <ProvNote text="Documented by the RESST team from project records and literature" group={PROVENANCE.resst} />
      </CollapsibleSection>
      <CollapsibleSection id="lit" title={`Site Literature (${current.entries.length})`} defaultOpen={false}>
        {current.entries.length === 0 ? (
          <p className="muted">No literature entries are linked to this site.</p>
        ) : (
          <ul className="lit-list">
            {current.entries.map((e) => (
              <li key={e.entry_id}>
                <span className="lit-title">{e.title || "(untitled)"}</span>
                <span className="lit-meta">{[e.author, e.year, e.document_type].filter(Boolean).join(" · ")}</span>
                {e.doi && /^https?:\/\//i.test(e.doi) && (
                  <a className="lit-doi" href={e.doi} target="_blank" rel="noopener noreferrer">
                    {e.doi}
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </CollapsibleSection>
      {current.sedimentLink ? (
        <>
          <CollapsibleSection id="sust" title="Reservoir Sustainability" defaultOpen={false} badge={<ProvBadge kind="modeled" />}>
            <SustainabilitySection
              name={current.site.site_name}
              row={current.reservoirRow}
              link={current.sedimentLink}
              hasSurveys={current.sedimentLink.has_surveys}
            />
          </CollapsibleSection>
          <CollapsibleSection
            id="evid"
            title="Evidence"
            defaultOpen={false}
            badge={evidenceBadgeFor(current.sedimentLink.has_surveys, current.sedimentLink.latest_survey_year)}
          >
            <EvidenceSection
              row={current.reservoirRow}
              hasSurveys={current.sedimentLink.has_surveys}
              latestYear={current.sedimentLink.latest_survey_year}
            />
          </CollapsibleSection>
          <CollapsibleSection id="net" title="Reservoir Network" defaultOpen={false} badge={<ProvBadge kind="network" />}>
            <NetworkSection row={current.reservoirRow} />
          </CollapsibleSection>
          <CollapsibleSection id="sim" title="Comparable Reservoirs" defaultOpen={false}>
            <ComparablesSection row={current.reservoirRow} data={data} />
          </CollapsibleSection>
        </>
      ) : (
        <p className="muted sediment-note">
          National sedimentation modeling (RATTES/ResNet) covers large CONUS dams; this site is not linked to a
          modeled reservoir.
        </p>
      )}
      <CollapsibleSection id="nid" title="National Inventory of Dams" defaultOpen={false}>
        {!current.site.nid_id ? (
          <p className="muted">This site has no NID ID recorded.</p>
        ) : !current.nid ? (
          <p className="muted">No NID record found for ID “{current.site.nid_id}”.</p>
        ) : (
          <FieldList
            rows={NID_DETAIL_FIELDS.map((f) => ({
              label: f.label,
              value: current.nid![f.field as keyof typeof current.nid] ?? "",
            }))}
          />
        )}
      </CollapsibleSection>
    </>
  );
}

export function DetailsPanel({ derived, state, data }: { derived: Derived; state: AppState; data: AppData }) {
  const selected = derived.selection.sites;
  const selectedReservoir = state.selectedReservoirId;
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [selected.length && selected[0]?.site.site_id]);
  const current = selected[Math.min(page, selected.length - 1)];
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  // The report targets exactly what the panel displays: the pager's current
  // site, or the selected national reservoir.
  const openReport = () =>
    setReportTarget(
      current
        ? { kind: "site", site: current.site, entries: current.entries, nid: current.nid ?? null, link: current.sedimentLink ?? null }
        : selectedReservoir
          ? { kind: "reservoir", shortId: Number(selectedReservoir) }
          : null,
    );

  return (
    <aside className="details-panel" id="details-panel" aria-label="Selected data">
      <PanelResizer widthPx={state.detailsWidthPx} />
      <div className="panel-title-row">
        <h2>Selected Data</h2>
        <span className="panel-title-tools">
          {(current || selectedReservoir) && (
            <button type="button" className="linklike" onClick={openReport} aria-label="Open the dam report">
              Report
            </button>
          )}
          {(selected.length > 0 || selectedReservoir) && (
            <button type="button" className="linklike" onClick={() => actions.clearSelection()}>
              Clear
            </button>
          )}
        </span>
      </div>
      {reportTarget && <ReportModal target={reportTarget} data={data} onClose={() => setReportTarget(null)} />}
      {selected.length === 0 && selectedReservoir ? (
        <ReservoirDetails shortId={selectedReservoir} data={data} />
      ) : selected.length === 0 ? (
        <p className="muted empty-note">
          Select a site on the map or in the Sites table to see site details, literature, and National Inventory of
          Dams records here. The map's Select menu picks sites by box, drawn polygon, watershed (HUC), or distance
          from a river.
        </p>
      ) : (
        <>
          {selected.length > 1 && (
            <div className="pager" role="group" aria-label="Selected site pager">
              <button
                type="button"
                className="pager-btn"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                aria-label="Previous site"
              >
                ◀
              </button>
              <span aria-live="polite">
                {page + 1} of {selected.length}
              </span>
              <button
                type="button"
                className="pager-btn"
                disabled={page >= selected.length - 1}
                onClick={() => setPage((p) => Math.min(selected.length - 1, p + 1))}
                aria-label="Next site"
              >
                ▶
              </button>
            </div>
          )}
          {current && <SiteDetails current={current} data={data} />}
        </>
      )}
      <div className="selected-counts" aria-live="polite">
        <div>Selected Sites: <b>{selected.length}</b></div>
        <div>Selected Site Literature: <b>{derived.selection.entries.length}</b></div>
      </div>
    </aside>
  );
}
