// The Selected Data panel (right side): the selected site's attributes, its
// linked literature entries, and its National Inventory of Dams record
// (curated fields from the repo snapshot — decision D6/D8). Mirrors the
// current app's three feature-info sections and selection counters.

import type { Derived } from "../state/derive";
import { NID_DETAIL_FIELDS, SITE_DETAIL_FIELDS, SITE_FIELD_LABELS } from "../config/fields";

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
  const { site, entries, nid } = derived.selection;
  return (
    <aside className="details-panel" aria-label="Selected data">
      <div className="panel-title-row">
        <h2>Selected Data</h2>
      </div>
      {!site ? (
        <p className="muted empty-note">
          Select a site on the map or in the Sites table to see its details, literature, and National Inventory of Dams
          record here.
        </p>
      ) : (
        <>
          <section className="detail-section">
            <h3>{site.site_name}</h3>
            <FieldList
              rows={SITE_DETAIL_FIELDS.filter((f) => f !== "site_name").map((f) => ({
                label: SITE_FIELD_LABELS[f] ?? f,
                value: String(site[f] ?? ""),
              }))}
            />
          </section>
          <section className="detail-section">
            <h3>Site Literature ({entries.length})</h3>
            {entries.length === 0 ? (
              <p className="muted">No literature entries are linked to this site.</p>
            ) : (
              <ul className="lit-list">
                {entries.map((e) => (
                  <li key={e.entry_id}>
                    <span className="lit-title">{e.title || "(untitled)"}</span>
                    <span className="lit-meta">
                      {[e.author, e.year, e.document_type].filter(Boolean).join(" · ")}
                    </span>
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
            {!site.nid_id ? (
              <p className="muted">This site has no NID ID recorded.</p>
            ) : !nid ? (
              <p className="muted">No NID record found for ID “{site.nid_id}”.</p>
            ) : (
              <FieldList rows={NID_DETAIL_FIELDS.map((f) => ({ label: f.label, value: nid[f.field as keyof typeof nid] ?? "" }))} />
            )}
          </section>
        </>
      )}
      <div className="selected-counts" aria-live="polite">
        <div>Selected Sites: <b>{site ? 1 : 0}</b></div>
        <div>Selected Site Literature: <b>{entries.length}</b></div>
      </div>
    </aside>
  );
}
