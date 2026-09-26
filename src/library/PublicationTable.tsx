// The Library's middle column: the search box and the scope, a status line
// (the count, the active criteria as removable chips, Clear all), then the
// publications as a table: the title over its authors and document type,
// the year, and the first site. Column headers sort (a second click
// reverses); a row opens its publication in the reading pane; the arrow keys
// walk the rows and open each in turn.
//
// Choosing a publication must not rebuild 465 rows. The table is memoized
// on the search and never receives the open publication; each row reads
// whether it is the open one straight from the store, so a click
// re-renders exactly two rows. A new search keeps the rows it already built
// and builds at most NEW_ROWS_AT_ONCE new ones before the paint; the rest
// follow in interruptible background steps, so widening a search (a filter
// off, All after General) never blocks.

import { memo, startTransition, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { formatCount } from "../lib/display";
import { actions, getState, subscribe, type LibrarySort, type LibrarySortKey, type LitScope } from "../state/store";
import { CloseIcon } from "../components/icons";
import { Seg } from "../dashboard/ui";
import { FACET_BY_FIELD, facetValueLabel, nextSort, siteNames, syncRowCount, type LibraryQuery, type Publication } from "./index";

const openPublication = (id: string) => actions.setLibrary({ openLitId: id });

/** New rows built in the render that answers a click (the table shows about 12). */
const NEW_ROWS_AT_ONCE = 30;
/** Rows added per background step after that. */
const ROWS_PER_STEP = 120;

/** How many of `results` to render now. A new list keeps every row already
    in the DOM and adds up to NEW_ROWS_AT_ONCE new ones (syncRowCount, worked
    out once per list); an effect then grows it in transitions, which React
    renders in slices and abandons if the list changes again. No state is set
    during render, so a new list renders once. */
function useProgressiveCount(results: readonly Publication[]): number {
  // The rows the last commit put in the DOM.
  const committed = useRef<{ list: readonly Publication[]; count: number }>({ list: [], count: 0 });
  const [grown, setGrown] = useState<{ list: readonly Publication[]; count: number } | null>(null);
  const initial = useMemo(() => {
    const { list, count } = committed.current;
    const built = new Set<string>();
    for (let i = 0; i < count && i < list.length; i++) built.add(list[i].id);
    return syncRowCount(results, built, NEW_ROWS_AT_ONCE);
  }, [results]);
  const count = grown && grown.list === results ? grown.count : initial;
  useLayoutEffect(() => {
    committed.current = { list: results, count };
  });
  useEffect(() => {
    if (count >= results.length) return;
    startTransition(() => setGrown({ list: results, count: Math.min(results.length, count + ROWS_PER_STEP) }));
  }, [results, count]);
  return count;
}

/** Whether this row is the one in the reading pane: the chosen publication,
    or (`auto`, the first row on a wide screen) the first result while none
    is chosen. A boolean snapshot, so only the rows that flip re-render. */
const useIsOpen = (id: string, auto: boolean): boolean =>
  useSyncExternalStore(subscribe, () => {
    const open = getState().library.openLitId;
    return open === id || (open == null && auto);
  });

const Row = memo(function Row({ p, auto }: { p: Publication; auto: boolean }) {
  const isOpen = useIsOpen(p.id, auto);
  const names = siteNames(p);
  const site = names[0] ?? null;
  const more = names.length - 1;
  const author = p.lit.author.trim();
  const type = p.lit.document_type.trim();
  const siteText = site ? `${site}${more > 0 ? ` +${formatCount(more)}` : ""}` : null;
  return (
    <tr className={isOpen ? "lib-row is-open" : "lib-row"} data-lit-id={p.id} onClick={() => openPublication(p.id)}>
      <td className="lib-cell-title">
        <button type="button" className="lib-row-btn" aria-current={isOpen ? "true" : undefined}>
          {p.title}
        </button>
        {(author || type) && (
          <span className="lib-row-meta">
            {author && <span className="lib-row-author">{author}</span>}
            {type && <span className="lib-row-type">{type}</span>}
          </span>
        )}
        {/* Phones hide the Site column; the site takes a line here instead. */}
        {siteText && <span className="lib-row-site">{siteText}</span>}
      </td>
      <td className="lib-cell-year">{p.year ?? "–"}</td>
      <td className="lib-cell-site">
        {site ? (
          <>
            {site}
            {more > 0 && <span className="lib-more"> +{formatCount(more)}</span>}
          </>
        ) : (
          <span className="lib-general">General</span>
        )}
      </td>
    </tr>
  );
});

const COLUMNS: ReadonlyArray<{ key: LibrarySortKey; label: string }> = [
  { key: "title", label: "Title" },
  { key: "year", label: "Year" },
  { key: "site", label: "Site" },
];

const Toolbar = memo(function Toolbar({ query, scope, scopes }: { query: string; scope: LitScope; scopes: Record<LitScope, number> }) {
  const option = (value: LitScope, label: string) => ({
    value,
    label: (
      <>
        {label} <span className="lib-seg-count">{formatCount(scopes[value])}</span>
      </>
    ),
  });
  return (
    <div className="lib-toolbar">
      <div className="lib-search">
        <input
          type="search"
          value={query}
          placeholder="Search titles, authors, sites…"
          aria-label="Search publications"
          onChange={(e) => actions.setLibrary({ query: e.target.value })}
        />
        {query && (
          <button type="button" className="lib-search-clear" aria-label="Clear search" onClick={() => actions.setLibrary({ query: "" })}>
            <CloseIcon />
          </button>
        )}
      </div>
      <Seg<LitScope>
        label="Publications"
        options={[option("all", "All"), option("site", "Site literature"), option("general", "General")]}
        value={scope}
        onChange={(s) => actions.setLibrary({ scope: s })}
      />
    </div>
  );
});

function Status({ count, criteria, siteName }: { count: number; criteria: LibraryQuery; siteName: string | null }) {
  const chips: Array<{ key: string; label: string; remove: () => void }> = [];
  const q = criteria.query.trim();
  if (q) chips.push({ key: "query", label: `“${q}”`, remove: () => actions.setLibrary({ query: "" }) });
  if (criteria.siteId) chips.push({ key: "site", label: `Site: ${siteName ?? criteria.siteId}`, remove: () => actions.setLibrary({ siteId: null }) });
  for (const [field, values] of Object.entries(criteria.facets)) {
    const facet = FACET_BY_FIELD.get(field);
    for (const v of values) {
      chips.push({
        key: `${field}:${v}`,
        label: facet ? `${facet.label}: ${facetValueLabel(facet, v)}` : v,
        remove: () => actions.toggleLibraryFacet(field, v),
      });
    }
  }
  const any = chips.length > 0 || criteria.scope !== "all";
  return (
    <div className="lib-status">
      <h2 className="lib-count" aria-live="polite">
        <b>{formatCount(count)}</b> {count === 1 ? "publication" : "publications"}
      </h2>
      {chips.length > 0 && (
        <ul className="lib-chips" aria-label="Active criteria">
          {chips.map((c) => (
            <li key={c.key}>
              <button type="button" className="lib-chip" aria-label={`Remove ${c.label}`} onClick={c.remove}>
                {c.label} <CloseIcon size={10} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {any && (
        <button type="button" className="linklike lib-clear" onClick={() => actions.clearLibrary()}>
          Clear all
        </button>
      )}
    </div>
  );
}

export const PublicationTable = memo(function PublicationTable({
  results,
  criteria,
  sort,
  scopes,
  siteName,
  autoFirst,
}: {
  results: readonly Publication[];
  criteria: LibraryQuery;
  sort: LibrarySort;
  scopes: Record<LitScope, number>;
  siteName: string | null;
  /** The first row stands in for the open publication while none is chosen (wide screens). */
  autoFirst: boolean;
}) {
  const bodyRef = useRef<HTMLTableSectionElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const count = useProgressiveCount(results);
  const rows = count >= results.length ? results : results.slice(0, count);

  // A new search or order starts at the top of the table (wide layout; on
  // the stacked layout the page scrolls and the table does not). Only a
  // scrolled table is reset: writing scrollTop forces a layout.
  const scrolled = useRef(false);
  useLayoutEffect(() => {
    if (!scrolled.current || !wrapRef.current) return;
    scrolled.current = false;
    wrapRef.current.scrollTop = 0;
  }, [results]);

  // Reading-pane keys on a row's title button: up and down (Home, End) move
  // to that row and open it.
  const onKeyDown = (e: KeyboardEvent<HTMLTableSectionElement>) => {
    const btn = e.target as HTMLElement;
    const rows = bodyRef.current?.rows;
    if (!rows || !btn.classList.contains("lib-row-btn")) return;
    const i = (btn.closest("tr") as HTMLTableRowElement | null)?.sectionRowIndex ?? -1;
    if (i < 0) return;
    const last = rows.length - 1;
    const j = e.key === "ArrowDown" ? Math.min(last, i + 1) : e.key === "ArrowUp" ? Math.max(0, i - 1) : e.key === "Home" ? 0 : e.key === "End" ? last : -1;
    if (j < 0) return;
    e.preventDefault();
    if (j === i || !results[j]) return;
    rows[j].querySelector<HTMLButtonElement>(".lib-row-btn")?.focus();
    openPublication(results[j].id);
  };

  return (
    <section className="lib-main" aria-label="Publications">
      <Toolbar query={criteria.query} scope={criteria.scope} scopes={scopes} />
      <Status count={results.length} criteria={criteria} siteName={siteName} />
      {results.length === 0 ? (
        <div className="empty-note lib-empty">
          <p>No publications match.</p>
          <p className="muted">
            <button type="button" className="linklike" onClick={() => actions.clearLibrary()}>
              Clear the filters
            </button>{" "}
            to start again.
          </p>
        </div>
      ) : (
        <div className="lib-table-wrap" ref={wrapRef} onScroll={(e) => (scrolled.current = e.currentTarget.scrollTop > 0)}>
          {/* Fixed layout: the header cells set the column widths. */}
          <table className="lib-table">
            <thead>
              <tr>
                {COLUMNS.map((c) => {
                  const active = sort.key === c.key;
                  return (
                    <th
                      key={c.key}
                      scope="col"
                      className={`lib-th-${c.key}`}
                      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
                    >
                      <button type="button" className="lib-th" onClick={() => actions.setLibrary({ sort: nextSort(sort, c.key) })}>
                        {c.label}
                        <span className={active ? "lib-sort-ind is-active" : "lib-sort-ind"} aria-hidden="true">
                          {active && sort.dir === "asc" ? "▲" : "▼"}
                        </span>
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody ref={bodyRef} onKeyDown={onKeyDown}>
              {rows.map((p, i) => (
                <Row key={p.id} p={p} auto={autoFirst && i === 0} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
});
