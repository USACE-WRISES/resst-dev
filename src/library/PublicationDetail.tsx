// The Library's reading pane: the open publication's type and year, title
// and authors, its source link, then one list of every recorded field with
// a value: its sites (each a way to the map), its keywords (each a toggle
// that filters the list by it) and its free-text geography. No cards: one
// labelled column, hairline rows.

import { memo, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { formatCount, literatureLink } from "../lib/display";
import { actions } from "../state/store";
import { showSiteOnMap, showSitesOnMap } from "../state/navigate";
import { ChevronLeft, ExternalLink, MapIcon } from "../components/icons";
import { LIT_FIELDS, TOPIC_FLAGS, type LitTextField, type Publication } from "./index";

const SITES_SHOWN = 6;

/** Keyword fields in reading order; Geography and the topic flags follow. */
const LEAD_FIELDS: readonly LitTextField[] = [
  "purpose",
  "sustainable_sediment_management",
  "adaptive_management",
  "data_collection",
  "modeling",
  "sediment_characteristic",
  "sediment_source",
  "channel_type",
  "land_use",
];
const TAIL_FIELDS: readonly LitTextField[] = ["risk_and_uncertainty", "special_cases"];
const labelOf = (field: string): string => LIT_FIELDS.find((f) => f.field === field)?.label ?? field;

function Prop({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="lib-prop">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** Comma-separated keyword toggles: pressed while that keyword filters the list. */
function Keywords({ values, facets }: { values: ReadonlyArray<{ field: string; value: string; label: string }>; facets: Record<string, string[]> }) {
  return (
    <>
      {values.map((k, i) => {
        const on = (facets[k.field] ?? []).some((s) => s.toLowerCase() === k.value.toLowerCase());
        return (
          <span key={`${k.field}:${k.value}`}>
            {i > 0 && ", "}
            <button type="button" className="lib-kw" aria-pressed={on} onClick={() => actions.toggleLibraryFacet(k.field, k.value)}>
              {k.label}
            </button>
          </span>
        );
      })}
    </>
  );
}

function Sites({ pub }: { pub: Publication }) {
  const [all, setAll] = useState(false);
  const total = pub.sites.length + pub.legacyNames.length;
  if (total === 0) return <span className="lib-muted">None, general literature</span>;
  const sites = all ? pub.sites : pub.sites.slice(0, SITES_SHOWN);
  const legacy = all ? pub.legacyNames : pub.legacyNames.slice(0, Math.max(0, SITES_SHOWN - sites.length));
  return (
    <ul className="lib-sites">
      {sites.map((s) => (
        <li key={s.site_id}>
          <button type="button" className="lib-site" aria-label={`Show ${s.site_name} on map`} onClick={() => showSiteOnMap(s.site_id)}>
            <MapIcon size={12} />
            {s.site_name}
          </button>
        </li>
      ))}
      {legacy.map((n) => (
        <li key={n} className="lib-site-legacy">
          {n}
        </li>
      ))}
      {total > SITES_SHOWN && (
        <li>
          <button type="button" className="linklike lib-sites-more" onClick={() => setAll((a) => !a)}>
            {all ? "Show fewer" : `Show all (${formatCount(total)})`}
          </button>
        </li>
      )}
    </ul>
  );
}

export const PublicationDetail = memo(function PublicationDetail({
  pub,
  facets,
  wide,
}: {
  pub: Publication | null;
  facets: Record<string, string[]>;
  wide: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  // A new publication starts at its top: the pane scrolls itself on a wide
  // screen; on the stacked layout the pane sits above the list and comes
  // into view.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !pub) return;
    if (wide) el.scrollTop = 0;
    else el.scrollIntoView({ block: "start" });
  }, [pub?.id]);

  if (!pub) {
    return (
      <aside ref={ref} className="lib-detail" aria-label="Publication details">
        <div className="empty-note lib-detail-empty">
          <p>Select a publication to read its details.</p>
        </div>
      </aside>
    );
  }

  // Back on the stacked layout returns to the row the publication came from.
  const back = () => {
    const id = pub.id;
    actions.setLibrary({ openLitId: null });
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`.lib-row[data-lit-id="${CSS.escape(id)}"] .lib-row-btn`)?.focus());
  };
  const src = literatureLink(pub.lit.doi);
  const eyebrow = [pub.lit.document_type.trim(), pub.lit.year.trim()].filter(Boolean).join(" · ");
  const author = pub.lit.author.trim();
  const geography = pub.lit.geography.trim();
  const keywordRows = (fields: readonly LitTextField[]) =>
    fields.map((f) => {
      const values = pub.tokens[f] ?? [];
      if (values.length === 0) return null;
      return (
        <Prop key={f} label={labelOf(f)}>
          <Keywords values={values.map((v) => ({ field: f, value: v, label: v }))} facets={facets} />
        </Prop>
      );
    });
  const topics = TOPIC_FLAGS.filter((f) => (pub.tokens[f.field] ?? []).length > 0).map((f) => ({ field: f.field, value: "Yes", label: f.label }));

  return (
    <aside ref={ref} className="lib-detail is-open" aria-label="Publication details">
      <button type="button" className="back-link lib-back" onClick={back}>
        <ChevronLeft size={13} /> Back to list
      </button>
      {eyebrow && <p className="lib-eyebrow">{eyebrow}</p>}
      <h2 className="lib-detail-title">{pub.title}</h2>
      {author && <p className="lib-detail-authors">{author}</p>}
      {(src.href || pub.sites.length > 1) && (
        <div className="lib-detail-actions">
          {src.href && (
            <a className="btn-sm lib-source" href={src.href} target="_blank" rel="noopener noreferrer">
              Open source <ExternalLink />
            </a>
          )}
          {pub.sites.length > 1 && (
            <button type="button" className="text-btn" onClick={() => showSitesOnMap(pub.sites)}>
              Show all sites on map
            </button>
          )}
        </div>
      )}
      <dl className="lib-props">
        <Prop label="Sites">
          <Sites key={pub.id} pub={pub} />
        </Prop>
        {keywordRows(LEAD_FIELDS)}
        {geography && <Prop label="Geography">{geography}</Prop>}
        {topics.length > 0 && (
          <Prop label="Topics covered">
            <Keywords values={topics} facets={facets} />
          </Prop>
        )}
        {keywordRows(TAIL_FIELDS)}
        {!src.href && src.id && <Prop label="Reference">{src.id}</Prop>}
      </dl>
    </aside>
  );
});
