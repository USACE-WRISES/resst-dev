// The Library view: every publication in one searchable place. Three
// columns like the Map view: the filters rail, the publication table, and
// the reading pane. Its state lives in the store (src/state/store.ts
// library), so the Dashboard can open it on a keyword and leaving and
// returning keeps the search.
//
// The page stays mounted (parked) while another view shows; it is memoized
// on its two props, so nothing on the Map view re-renders it.
//
// Rendering follows what changed: the criteria and the results are memoized
// on the search state only (never on the open publication), the rail and
// the table are memoized on them, and each row reads its own open state
// from the store, so choosing a publication re-renders two rows and the
// reading pane.

import { memo, useDeferredValue, useMemo, useSyncExternalStore } from "react";
import type { AppData } from "../lib/types";
import type { LibraryState } from "../state/store";
import { publicationsFor, scopeCounts, searchPublications, sortPublications, type LibraryQuery } from "./index";
import { Rail } from "./Rail";
import { PublicationTable } from "./PublicationTable";
import { PublicationDetail } from "./PublicationDetail";

/** Three columns: the stacked layout in styles.css starts at 1100px. */
const WIDE = "(min-width: 1101px)";
const subscribeWide = (onChange: () => void) => {
  const mq = window.matchMedia(WIDE);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
};
const isWide = () => window.matchMedia(WIDE).matches;

function Library({ data, lib }: { data: AppData; lib: LibraryState }) {
  const pubs = useMemo(() => publicationsFor(data), [data]);
  const byId = useMemo(() => new Map(pubs.map((p) => [p.id, p])), [pubs]);
  // Like the facet counts, the scope counts follow every other criterion.
  const scopes = useMemo(
    () => scopeCounts(searchPublications(pubs, { query: lib.query, scope: "all", facets: lib.facets, siteId: lib.siteId })),
    [pubs, lib.query, lib.facets, lib.siteId],
  );
  const criteria: LibraryQuery = useMemo(
    () => ({ query: lib.query, scope: lib.scope, facets: lib.facets, siteId: lib.siteId }),
    [lib.query, lib.scope, lib.facets, lib.siteId],
  );
  const results = useMemo(() => sortPublications(searchPublications(pubs, criteria), lib.sort), [pubs, criteria, lib.sort]);
  const wide = useSyncExternalStore(subscribeWide, isWide, () => true);
  // The chosen publication; on a wide screen, until one is chosen, the first
  // result, so the reading pane is never an empty column.
  const chosen = lib.openLitId ? (byId.get(lib.openLitId) ?? null) : null;
  const shown = chosen ?? (wide ? (results[0] ?? null) : null);
  const siteName = lib.siteId ? (data.siteById.get(lib.siteId)?.site_name ?? lib.siteId) : null;
  // The pane follows a frame behind the list and the filters (a background
  // render), so a click paints the list first; its content never lags visibly.
  const pane = useDeferredValue(useMemo(() => ({ pub: shown, facets: lib.facets, wide }), [shown, lib.facets, wide]));
  return (
    <div className="lib-page">
      <Rail pubs={pubs} criteria={criteria} openGroup={lib.openGroup} />
      <PublicationTable results={results} criteria={criteria} sort={lib.sort} scopes={scopes} siteName={siteName} autoFirst={wide} />
      <PublicationDetail pub={pane.pub} facets={pane.facets} wide={pane.wide} />
    </div>
  );
}

export default memo(Library);
