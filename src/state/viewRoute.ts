// The three top-level views and their URL hashes. The app has no router: the
// Map view is the plain URL, the Dashboard and Library views are `#dashboard`
// and `#library`, so they can be linked and reloaded (the site is served from
// a fixed base path with no 404 fallback, so only a hash can carry state).
// Any other hash, such as the skip link's `#results-table`, means nothing here
// and is left alone. Pure: unit-tested in Node.

export type View = "map" | "dashboard" | "library";

export const VIEWS: readonly View[] = ["map", "dashboard", "library"];

/** The view a URL hash names, or null when the hash is not a view. */
export function parseViewHash(hash: string): View | null {
  const h = hash.replace(/^#\/?/, "").trim().toLowerCase();
  return h === "map" || h === "dashboard" || h === "library" ? h : null;
}

/** The hash that names a view; the Map view is the bare URL. */
export const viewHash = (view: View): string => (view === "map" ? "" : `#${view}`);
