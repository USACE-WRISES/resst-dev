// Provenance UI — the cardinal display rule made into components so it can't
// drift: badges classify every value group (measured / modeled / network /
// reported), notes state source + scenario inline, and the ⓘ popover carries
// the citation (source, version, DOI, caveat). Wording tests assert on these.

import { useRef, useState } from "react";
import { useDismissPopover } from "../../map/useDismissPopover";
import type { ProvenanceGroup } from "../../sediment/types";

export type BadgeKind = "modeled" | "measured" | "network" | "reported";

const BADGE_LABEL: Record<BadgeKind, string> = {
  modeled: "Modeled",
  measured: "Measured",
  network: "Network-derived",
  reported: "Reported",
};

export function ProvBadge({ kind, label }: { kind: BadgeKind; label?: string }) {
  return (
    <span className="prov-badge" data-type={kind}>
      {label ?? BADGE_LABEL[kind]}
    </span>
  );
}

/** One-line source note under a section, with the citation popover. */
export function ProvNote({ text, group }: { text: string; group?: ProvenanceGroup }) {
  return (
    <p className="prov-note">
      {text}
      {group && <ProvInfo group={group} />}
    </p>
  );
}

export function ProvInfo({ group }: { group: ProvenanceGroup }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useDismissPopover(open, ref, () => setOpen(false));
  return (
    <span className="prov-info" ref={ref}>
      <button
        type="button"
        className="prov-info-btn"
        aria-expanded={open}
        aria-label={`About this data source: ${group.source}`}
        onClick={() => setOpen((o) => !o)}
      >
        ⓘ
      </button>
      {open && (
        <span className="prov-pop" role="group" aria-label="Data source details">
          <b>{group.source}</b>
          <span>{group.version}</span>
          {group.doi && (
            <a href={`https://doi.org/${group.doi}`} target="_blank" rel="noopener noreferrer">
              doi:{group.doi}
            </a>
          )}
          {group.url && (
            <a href={group.url} target="_blank" rel="noopener noreferrer">
              {group.url}
            </a>
          )}
          <span className="muted">{group.note}</span>
        </span>
      )}
    </span>
  );
}
