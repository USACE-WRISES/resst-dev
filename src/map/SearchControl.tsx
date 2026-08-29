// Site-name search plus USGS GNIS place search (streams, lakes, cities…) —
// partially restores the original app's geocoder keylessly (decision D4
// replaced the Esri geocoder; docs/PARITY.md row 3). Sites match locally;
// places query carto.nationalmap.gov debounced, each keystroke superseding
// the last (the overlay runtime's controller discipline). Choosing a site
// selects it and the map flies via the normal selection flow; choosing a
// place flies the map and drops a labeled pin.

import { useEffect, useMemo, useRef, useState } from "react";
import type { Site } from "../lib/types";
import { actions } from "../state/store";
import { mapCommands } from "./mapBus";
import { searchPlaces, type GazetteerPlace } from "./gazetteer";
import { useDismissPopover } from "./useDismissPopover";

const MIN_PLACE_CHARS = 3;
const PLACE_DEBOUNCE_MS = 300;
const CACHE_CAP = 20;

type PlaceStatus = "idle" | "loading" | "done" | "error";

/** Debounced, superseding GNIS lookup. Successes are cached (small LRU);
    failures never are, so a retry stays possible — the basemaps rule. */
function usePlaceSearch(query: string): { places: GazetteerPlace[]; status: PlaceStatus } {
  const [places, setPlaces] = useState<GazetteerPlace[]>([]);
  const [status, setStatus] = useState<PlaceStatus>("idle");
  const controllerRef = useRef<AbortController | null>(null);
  const cacheRef = useRef(new Map<string, GazetteerPlace[]>());

  useEffect(() => {
    const key = query.trim().toLowerCase();
    if (key.length < MIN_PLACE_CHARS) {
      controllerRef.current?.abort();
      controllerRef.current = null;
      setPlaces([]);
      setStatus("idle");
      return;
    }
    const cached = cacheRef.current.get(key);
    if (cached) {
      setPlaces(cached);
      setStatus("done");
      return;
    }
    const timer = setTimeout(() => {
      controllerRef.current?.abort(); // supersede any in-flight request
      const controller = new AbortController();
      controllerRef.current = controller;
      setStatus("loading");
      searchPlaces(key, controller.signal)
        .then((found) => {
          if (controller.signal.aborted) return;
          const cache = cacheRef.current;
          cache.set(key, found);
          if (cache.size > CACHE_CAP) cache.delete(cache.keys().next().value!); // oldest entry out
          setPlaces(found);
          setStatus("done");
        })
        .catch((err: unknown) => {
          if ((err as Error).name === "AbortError") return; // superseded — not an error
          setPlaces([]);
          setStatus("error");
        })
        .finally(() => {
          if (controllerRef.current === controller) controllerRef.current = null;
        });
    }, PLACE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  // Abort any in-flight request on unmount.
  useEffect(() => () => controllerRef.current?.abort(), []);

  return { places, status };
}

type SearchItem = { kind: "site"; site: Site } | { kind: "place"; place: GazetteerPlace };

export function SearchControl({ sites }: { sites: Site[] }) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  // A just-picked name fills the box; without this flag the dropdown would
  // instantly reopen over it (the name matches itself) and a pointless GNIS
  // lookup would fire for it.
  const [chosen, setChosen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const siteItems = useMemo<SearchItem[]>(() => {
    const q = chosen ? "" : text.trim().toLowerCase();
    if (q.length < 2) return [];
    return sites
      .filter((s) => s.site_name.toLowerCase().includes(q))
      .slice(0, 6)
      .map((site) => ({ kind: "site" as const, site }));
  }, [text, sites, chosen]);

  const trimmedLen = chosen ? 0 : text.trim().length;
  const { places, status: placeStatus } = usePlaceSearch(chosen ? "" : text);
  const placeItems = useMemo<SearchItem[]>(
    () => places.map((place) => ({ kind: "place" as const, place })),
    [places],
  );
  const items = useMemo(() => [...siteItems, ...placeItems], [siteItems, placeItems]);

  // Reset the highlight on typing only — places arriving asynchronously must
  // not yank an in-progress arrow position back to the top.
  useEffect(() => {
    setHighlight(0);
  }, [text]);

  useEffect(() => {
    setOpen(items.length > 0 || (trimmedLen >= MIN_PLACE_CHARS && placeStatus === "loading"));
  }, [items.length, placeStatus, trimmedLen]);

  useDismissPopover(open, ref, () => setOpen(false)); // focus never left the input

  const choose = (item: SearchItem) => {
    if (item.kind === "site") {
      actions.selectSite(item.site.site_id); // camera/popup are MapPanel side effects
      mapCommands()?.clearPlaceMarker();
      setText(item.site.site_name);
    } else {
      const p = item.place;
      mapCommands()?.flyTo(p.lon, p.lat, p.zoom);
      mapCommands()?.showPlaceMarker(p.lon, p.lat, p.name);
      setText(p.name);
    }
    setChosen(true);
    setOpen(false);
  };

  // Async place arrivals/removals can shrink the list under the highlight.
  const clampedHighlight = Math.min(highlight, Math.max(0, items.length - 1));
  const listboxShown = open && items.length > 0;

  const optionRow = (item: SearchItem, i: number) => (
    <div
      key={item.kind === "site" ? `s-${item.site.site_id}` : `p-${item.place.id}`}
      id={`map-search-opt-${i}`}
      role="option"
      aria-selected={i === clampedHighlight}
      className={i === clampedHighlight ? "hl" : undefined}
      onMouseEnter={() => setHighlight(i)}
      onMouseDown={(e) => {
        e.preventDefault();
        choose(item);
      }}
    >
      {item.kind === "site" ? (
        <>
          <span>{item.site.site_name}</span>
          {item.site.city && <span className="muted"> — {item.site.city}</span>}
        </>
      ) : (
        <>
          <span>{item.place.name}</span>
          <span className="muted">
            {" "}
            — {item.place.classLabel} · {item.place.state}
            {item.place.county ? `, ${item.place.county}` : ""}
          </span>
        </>
      )}
    </div>
  );

  // Announced on settle only — per-keystroke chatter would drown a screen reader.
  const placeAnnouncement =
    trimmedLen < MIN_PLACE_CHARS
      ? ""
      : placeStatus === "done"
        ? places.length > 0
          ? `${places.length} places found`
          : "No places found"
        : placeStatus === "error"
          ? "Place search unavailable"
          : "";

  return (
    <div className="map-search" ref={ref}>
      <input
        type="search"
        placeholder="Find a site or place…"
        aria-label="Find a site or place by name"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxShown ? "map-search-results" : undefined}
        aria-activedescendant={listboxShown ? `map-search-opt-${clampedHighlight}` : undefined}
        value={text}
        onChange={(e) => {
          setChosen(false);
          setText(e.target.value);
          // Clearing the box (typed or the native search ✕) retires the pin.
          if (e.target.value.trim() === "") mapCommands()?.clearPlaceMarker();
        }}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlight((h) => Math.min(items.length - 1, h + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => Math.max(0, h - 1));
          } else if (e.key === "Enter" && items[clampedHighlight]) {
            e.preventDefault();
            choose(items[clampedHighlight]);
          }
        }}
      />
      {open && (
        <div className="map-search-pop">
          {/* The listbox renders only when it has options — an empty listbox
              and dangling aria-controls/activedescendant idrefs are axe
              violations. The loading note lives outside it. */}
          {items.length > 0 && (
            <ul
              id="map-search-results"
              role="listbox"
              className="map-search-results"
              aria-label="Matching sites and places"
            >
              {siteItems.length > 0 && (
                <li role="group" aria-labelledby="map-search-grp-sites" className="map-search-group">
                  <span className="map-search-group-label" id="map-search-grp-sites">
                    Sites
                  </span>
                  {siteItems.map((item, i) => optionRow(item, i))}
                </li>
              )}
              {placeItems.length > 0 && (
                <li role="group" aria-labelledby="map-search-grp-places" className="map-search-group">
                  <span className="map-search-group-label" id="map-search-grp-places">
                    Places (USGS GNIS)
                  </span>
                  {placeItems.map((item, i) => optionRow(item, siteItems.length + i))}
                </li>
              )}
            </ul>
          )}
          {placeStatus === "loading" && trimmedLen >= MIN_PLACE_CHARS && (
            <p className="map-search-note muted">Searching places…</p>
          )}
        </div>
      )}
      <span className="sr-only" role="status">
        {placeAnnouncement}
      </span>
    </div>
  );
}
