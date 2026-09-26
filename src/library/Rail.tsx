// The Library's left rail: the filters, one group open at a time like the
// Selected Data cards. The open group is store state (library.openGroup), so
// it survives leaving the Library. A closed group renders only its header,
// with the number of ticked values, so hidden selections stay visible and
// only the open group counts its options. Option counts follow every other
// criterion. On narrow screens the rail folds under a "Filters" button.

import { memo, useId, useMemo, useState } from "react";
import { formatCount } from "../lib/display";
import { actions } from "../state/store";
import { ChevronDown } from "../components/icons";
import {
  FACET_GROUPS,
  facetCounts,
  facetValueLabel,
  type FacetDef,
  type FacetGroup,
  type LibraryQuery,
  type Publication,
} from "./index";

const SHOW = 8;

function Facet({ pubs, criteria, facet, titled }: { pubs: readonly Publication[]; criteria: LibraryQuery; facet: FacetDef; titled: boolean }) {
  const [all, setAll] = useState(false);
  const selected = criteria.facets[facet.field] ?? [];
  const isSelected = (v: string) => selected.some((s) => s.toLowerCase() === v.toLowerCase());
  const counts = useMemo(() => facetCounts(pubs, criteria, facet), [pubs, criteria, facet]);
  // Options with matches, plus any ticked value even when it has none now.
  const options = counts.filter((t) => t.count > 0 || isSelected(t.label));
  for (const v of selected) if (!options.some((t) => t.label.toLowerCase() === v.toLowerCase())) options.push({ key: v.toLowerCase(), label: v, count: 0, items: [] });
  if (options.length === 0) return null;
  const shown = all ? options : options.slice(0, SHOW);
  return (
    <div className="lib-facet-block">
      {titled && facet.kind !== "flag" && <h4 className="lib-facet-title">{facet.label}</h4>}
      <div className="lib-facets">
        {shown.map((t) => (
          <label key={t.key} className="lib-facet">
            <input type="checkbox" checked={isSelected(t.label)} onChange={() => actions.toggleLibraryFacet(facet.field, t.label)} />
            <span className="lib-facet-label">{facetValueLabel(facet, t.label)}</span>{" "}
            <span className="lib-facet-count">{formatCount(t.count)}</span>
          </label>
        ))}
      </div>
      {options.length > SHOW && (
        <button type="button" className="linklike lib-facet-more" onClick={() => setAll((a) => !a)}>
          {all ? "Show fewer" : `Show all (${formatCount(options.length)})`}
        </button>
      )}
    </div>
  );
}

/** The number of ticked values, as a badge whose accessible text reads "2 selected". */
function Ticked({ n }: { n: number }) {
  if (n === 0) return null;
  return (
    <>
      {" "}
      <span className="lib-acc-badge">
        {formatCount(n)}
        <span className="sr-only"> selected</span>
      </span>
    </>
  );
}

function Group({ pubs, criteria, group, open }: { pubs: readonly Publication[]; criteria: LibraryQuery; group: FacetGroup; open: boolean }) {
  const bodyId = useId();
  const single = group.facets.length === 1 && group.facets[0].label === group.title;
  const ticked = group.facets.reduce((n, f) => n + (criteria.facets[f.field]?.length ?? 0), 0);
  return (
    <section className={open ? "lib-acc-sec is-open" : "lib-acc-sec"}>
      <h3 className="lib-acc-h">
        <button
          type="button"
          className="lib-acc-head"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => actions.setLibrary({ openGroup: open ? null : group.title })}
        >
          <span className="lib-acc-title">{group.title}</span>
          <Ticked n={ticked} />
          <ChevronDown className="lib-acc-chevron" />
        </button>
      </h3>
      <div id={bodyId} className="lib-acc-body" hidden={!open}>
        {open && group.facets.map((f) => <Facet key={f.field} pubs={pubs} criteria={criteria} facet={f} titled={!single} />)}
      </div>
    </section>
  );
}

export const Rail = memo(function Rail({
  pubs,
  criteria,
  openGroup,
}: {
  pubs: readonly Publication[];
  criteria: LibraryQuery;
  openGroup: string | null;
}) {
  const [unfolded, setUnfolded] = useState(false);
  const bodyId = useId();
  const ticked = Object.values(criteria.facets).reduce((n, v) => n + v.length, 0);
  return (
    <aside className="lib-rail" aria-label="Filters">
      <button
        type="button"
        className="lib-rail-toggle"
        aria-expanded={unfolded}
        aria-controls={bodyId}
        onClick={() => setUnfolded((o) => !o)}
      >
        <span>Filters</span>
        <Ticked n={ticked} />
        <ChevronDown className="lib-acc-chevron" />
      </button>
      <div id={bodyId} className={unfolded ? "lib-rail-body is-open" : "lib-rail-body"}>
        <h2 className="lib-rail-title">Filters</h2>
        <div className="lib-acc">
          {FACET_GROUPS.map((g) => (
            <Group key={g.title} pubs={pubs} criteria={criteria} group={g} open={openGroup === g.title} />
          ))}
        </div>
      </div>
    </aside>
  );
});
