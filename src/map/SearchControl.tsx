// Attribute search over site names (decision D4 replaced the Esri geocoder).
// Typing shows up to 8 matching sites; choosing one selects it and the map
// flies there via the normal selection flow.

import { useEffect, useMemo, useRef, useState } from "react";
import type { Site } from "../lib/types";
import { actions } from "../state/store";

export function SearchControl({ sites }: { sites: Site[] }) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    const q = text.trim().toLowerCase();
    if (q.length < 2) return [];
    return sites.filter((s) => s.site_name.toLowerCase().includes(q)).slice(0, 8);
  }, [text, sites]);

  useEffect(() => {
    setOpen(matches.length > 0);
    setHighlight(0);
  }, [matches]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const choose = (site: Site) => {
    actions.selectSite(site.site_id);
    setText(site.site_name);
    setOpen(false);
  };

  return (
    <div className="map-search" ref={ref}>
      <input
        type="search"
        placeholder="Find a site…"
        aria-label="Find a site by name"
        role="combobox"
        aria-expanded={open}
        aria-controls="map-search-results"
        aria-activedescendant={open ? `map-search-opt-${highlight}` : undefined}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlight((h) => Math.min(matches.length - 1, h + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => Math.max(0, h - 1));
          } else if (e.key === "Enter" && matches[highlight]) {
            e.preventDefault();
            choose(matches[highlight]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open && (
        <ul id="map-search-results" role="listbox" className="map-search-results" aria-label="Matching sites">
          {matches.map((s, i) => (
            <li
              key={s.site_id}
              id={`map-search-opt-${i}`}
              role="option"
              aria-selected={i === highlight}
              className={i === highlight ? "hl" : undefined}
              onMouseEnter={() => setHighlight(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(s);
              }}
            >
              <span>{s.site_name}</span>
              {s.city && <span className="muted"> — {s.city}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
