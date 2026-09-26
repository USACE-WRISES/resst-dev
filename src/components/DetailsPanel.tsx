// The Selected Data panel (right side): pages through the selected sites —
// one at a time with Previous/Next, mirroring the Experience Builder
// feature-info pager. A header card names the site; below it one accordion
// holds the cards, team-collected data first (Sediment Management → Site
// Literature), then the modeled national context for crosswalked sites
// (Reservoir Sustainability → Evidence → Network → Comparables), then the
// NID reference record. Every card starts collapsed and one is open at a
// time (owner decisions, round 3 and 2026-09-25); the header badges still
// classify the contents, and the open card sticks for the session.
// Counters total across the whole selection.

import { useEffect, useState } from "react";
import type { AppData, NidRecord, LiteratureEntry, Site } from "../lib/types";
import type { Derived, SelectedSite } from "../state/derive";
import { NID_PANEL_GROUPS, SITE_FIELD_LABELS, SITE_MGMT_FIELDS } from "../config/fields";
import { actions, type AppState } from "../state/store";
import { PROVENANCE } from "../sediment/types";
import { formatNidValue, literatureLink, splitKeywords, tidyList } from "../lib/display";
import { CollapsibleSection } from "./details/CollapsibleSection";
import { PanelResizer } from "./PanelResizer";
import { ReportModal } from "../report/ReportModal";
import type { ReportTarget } from "../report/reportModel";
import { ProvBadge } from "./details/Provenance";
import { SustainabilitySection, sustainabilityPeek } from "./details/SustainabilitySection";
import { EvidenceSection, evidenceBadgeFor } from "./details/EvidenceSection";
import { NetworkSection, networkPeek } from "./details/NetworkSection";
import { ReservoirDetails } from "./details/ReservoirDetails";
import { ComparablesSection } from "./details/ComparablesSection";
import { Chips, KeyValues, SourceLine } from "./details/ui";
import { ChevronLeft, ChevronRight, DocumentIcon, ExternalLink } from "./icons";

/** The site's header card: name, place and agency, site-type chips, NID ID. */
function SiteCard({ site }: { site: Site }) {
  const meta = [site.city || site.address, tidyList(site.responsible_districtagency)].filter(Boolean).join(" · ");
  const types = splitKeywords(site.site_type);
  return (
    <section className="site-card">
      <h3 className="site-name">{site.site_name}</h3>
      {meta && <p className="site-meta">{meta}</p>}
      {site.city && site.address && <p className="site-address">{site.address}</p>}
      {(types.length > 0 || site.nid_id) && (
        <div className="site-tags">
          <Chips values={types} label="Site type" />
          {site.nid_id && <span className="id-tag">NID {site.nid_id}</span>}
        </div>
      )}
    </section>
  );
}

/** The team-documented management keywords as labelled chip groups. */
function ManagementCard({ site }: { site: Site }) {
  const groups = SITE_MGMT_FIELDS.map((f) => {
    const raw = String(site[f] ?? "").trim();
    return { f, label: SITE_FIELD_LABELS[f] ?? f, raw, values: splitKeywords(raw) };
  });
  if (groups.every((g) => g.raw === "")) {
    return <p className="muted">No sediment management keywords are recorded for this site.</p>;
  }
  return (
    <>
      <dl className="kw-list">
        {groups.map((g) => (
          <div key={g.f} className="kw-row">
            <dt>{g.label}</dt>
            <dd>
              {g.values.length > 0 ? (
                <Chips values={g.values} />
              ) : (
                <span className="kw-none">{g.raw ? "Not applicable" : "Not recorded"}</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
      <SourceLine text="RESST team, from project records and literature" group={PROVENANCE.resst} />
    </>
  );
}

/** Literature entries: the title links to the source; one quiet meta line. */
function LiteratureCard({ entries }: { entries: LiteratureEntry[] }) {
  if (entries.length === 0) return <p className="muted">No literature entries are linked to this site.</p>;
  const showInTable = () => {
    actions.setActiveTab("siteLit");
    actions.setShowSelectionOnly(true);
    actions.setTableCollapsed(false);
    actions.setMobilePanel(null);
  };
  return (
    <>
      <ul className="lit-cards">
        {entries.map((e) => {
          const src = literatureLink(e.doi);
          const title = e.title || "(untitled)";
          const meta = [e.author, e.year, e.document_type, src.id].filter(Boolean).join(" · ");
          return (
            <li key={e.entry_id}>
              {src.href ? (
                <a className="lit-card-title" href={src.href} target="_blank" rel="noopener noreferrer">
                  {title} <ExternalLink />
                </a>
              ) : (
                <span className="lit-card-title">{title}</span>
              )}
              {meta && <span className="lit-card-meta">{meta}</span>}
            </li>
          );
        })}
      </ul>
      <div className="card-actions">
        <button type="button" className="text-btn" onClick={showInTable}>
          Show in table
        </button>
      </div>
    </>
  );
}

/** The NID record: a two-line header, grouped values with units, ID + website. */
function NidCard({ site, nid }: { site: Site; nid: NidRecord | null | undefined }) {
  if (!site.nid_id) return <p className="muted">This site has no NID ID recorded.</p>;
  if (!nid) return <p className="muted">No NID record found for ID “{site.nid_id}”.</p>;
  const sub = [nid.river_or_stream, [nid.city, nid.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
  const samePurposes = nid.purposes.trim().toLowerCase() === nid.primary_purpose.trim().toLowerCase();
  const website = /^https?:\/\//i.test(nid.website_url) ? nid.website_url : "";
  return (
    <>
      <p className="nid-head">
        <span className="nid-name">{nid.name}</span>
        {sub && <span className="nid-sub">{sub}</span>}
      </p>
      {NID_PANEL_GROUPS.map((g) => (
        <div key={g.title} className="kv-group">
          <h4 className="card-label">{g.title}</h4>
          <KeyValues
            numeric={g.title === "Dimensions"}
            rows={g.fields.map((f) => ({
              label: f.label,
              value:
                f.field === "purposes" && samePurposes
                  ? ""
                  : formatNidValue(f.field, nid[f.field as keyof NidRecord]),
            }))}
          />
        </div>
      ))}
      <p className="nid-foot">
        <span className="id-tag">NID {nid.nidid}</span>
        {website && (
          <a href={website} target="_blank" rel="noopener noreferrer">
            Website <ExternalLink />
          </a>
        )}
      </p>
    </>
  );
}

function SiteDetails({ current, data, state }: { current: SelectedSite; data: AppData; state: AppState }) {
  const site = current.site;
  const link = current.sedimentLink;
  return (
    <>
      <SiteCard site={site} />
      <div className="detail-accordion">
        <CollapsibleSection id="mgmt" title="Sediment Management" badge={<ProvBadge kind="reported" />}>
          <ManagementCard site={site} />
        </CollapsibleSection>
        <CollapsibleSection id="lit" title={`Site Literature (${current.entries.length})`}>
          <LiteratureCard entries={current.entries} />
        </CollapsibleSection>
        {link ? (
          <>
            <CollapsibleSection
              id="sust"
              title="Reservoir Sustainability"
              badge={<ProvBadge kind="modeled" />}
              peek={sustainabilityPeek(link.sed2025_m3, link.cap_orig_m3)}
            >
              <SustainabilitySection
                name={site.site_name}
                row={current.reservoirRow}
                link={link}
                hasSurveys={link.has_surveys}
              />
            </CollapsibleSection>
            <CollapsibleSection id="evid" title="Evidence" badge={evidenceBadgeFor(link.has_surveys, link.latest_survey_year)}>
              <EvidenceSection
                row={current.reservoirRow}
                hasSurveys={link.has_surveys}
                latestYear={link.latest_survey_year}
              />
            </CollapsibleSection>
            <CollapsibleSection
              id="net"
              title="Reservoir Network"
              badge={<ProvBadge kind="network" />}
              peek={networkPeek(current.reservoirRow, state.networkView)}
            >
              <NetworkSection row={current.reservoirRow} />
            </CollapsibleSection>
            <CollapsibleSection id="sim" title="Comparable Reservoirs" lazy>
              <ComparablesSection
                row={current.reservoirRow}
                data={data}
                from={{ siteId: site.site_id, reservoirId: null, label: site.site_name, openSection: "sim" }}
              />
            </CollapsibleSection>
          </>
        ) : (
          <p className="accordion-note">
            This site is not linked to a modeled reservoir, so no sedimentation estimates are shown (RATTES and ResNet
            cover large U.S. dams).
          </p>
        )}
        <CollapsibleSection id="nid" title="National Inventory of Dams">
          <NidCard site={site} nid={current.nid} />
        </CollapsibleSection>
      </div>
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
            <button type="button" className="panel-btn" onClick={openReport} aria-label="Open the dam report">
              <DocumentIcon /> Report
            </button>
          )}
          {(selected.length > 0 || selectedReservoir) && (
            <button type="button" className="panel-btn panel-btn-quiet" onClick={() => actions.clearSelection()}>
              Clear
            </button>
          )}
        </span>
      </div>
      {reportTarget && <ReportModal target={reportTarget} data={data} onClose={() => setReportTarget(null)} />}
      {state.returnTo && (
        <button type="button" className="back-link" onClick={() => actions.goBack()}>
          <ChevronLeft size={13} /> Back to {state.returnTo.label}
        </button>
      )}
      {selected.length === 0 && selectedReservoir ? (
        <ReservoirDetails shortId={selectedReservoir} data={data} />
      ) : selected.length === 0 ? (
        <div className="empty-note">
          <p>Select a site on the map or in the table to see its details.</p>
          <p className="muted">Tip: the map's Select menu picks several sites at once by box, polygon, watershed, or river.</p>
        </div>
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
                <ChevronLeft />
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
                <ChevronRight />
              </button>
            </div>
          )}
          {current && <SiteDetails current={current} data={data} state={state} />}
        </>
      )}
      <div className="selected-counts" aria-live="polite">
        <div>
          Selected Sites: <b>{selected.length}</b>
        </div>
        <div>
          Selected Site Literature: <b>{derived.selection.entries.length}</b>
        </div>
      </div>
    </aside>
  );
}
