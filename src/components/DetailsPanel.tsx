// The Selected Data panel (right side): pages through the selected sites —
// one at a time with Previous/Next, mirroring the Experience Builder
// feature-info pager — showing each site's attributes, linked literature
// entries, and its National Inventory of Dams record from the repo snapshot
// (decisions D6/D8). Counters total across the whole selection.

import { useEffect, useState } from "react";
import type { Derived } from "../state/derive";
import { NID_DETAIL_FIELDS, SITE_DETAIL_FIELDS, SITE_FIELD_LABELS } from "../config/fields";
import { actions } from "../state/store";

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

export function DetailsPanel({ derived }: { derived: Derived }) {
  const selected = derived.selection.sites;
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [selected.length && selected[0]?.site.site_id]);
  const current = selected[Math.min(page, selected.length - 1)];

  return (
    <aside className="details-panel" id="details-panel" aria-label="Selected data">
      <div className="panel-title-row">
        <h2>Selected Data</h2>
        <span className="panel-title-tools">
          {selected.length > 0 && (
            <button type="button" className="linklike" onClick={() => actions.clearSelection()}>
              Clear
            </button>
          )}
          <button
            type="button"
            className="panel-collapse-btn"
            aria-expanded={true}
            aria-controls="details-panel"
            aria-label="Collapse Selected Data panel"
            onClick={() => actions.setPanelCollapsed("details", true)}
          >
            <span aria-hidden="true">»</span>
          </button>
        </span>
      </div>
      {selected.length === 0 ? (
        <p className="muted empty-note">
          Select a site on the map or in the Sites table — or drag a box with the map's Select tool — to see site
          details, literature, and National Inventory of Dams records here.
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
          {current && (
            <>
              <section className="detail-section">
                <h3>{current.site.site_name}</h3>
                <FieldList
                  rows={SITE_DETAIL_FIELDS.filter((f) => f !== "site_name").map((f) => ({
                    label: SITE_FIELD_LABELS[f] ?? f,
                    value: String(current.site[f] ?? ""),
                  }))}
                />
              </section>
              <section className="detail-section">
                <h3>Site Literature ({current.entries.length})</h3>
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
              </section>
              <section className="detail-section">
                <h3>National Inventory of Dams</h3>
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
              </section>
            </>
          )}
        </>
      )}
      <div className="selected-counts" aria-live="polite">
        <div>Selected Sites: <b>{selected.length}</b></div>
        <div>Selected Site Literature: <b>{derived.selection.entries.length}</b></div>
      </div>
    </aside>
  );
}
