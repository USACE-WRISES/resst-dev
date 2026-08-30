// A details-panel section whose header is a disclosure button. Open state
// lives in the store (state.panelSections) rather than local state so it
// survives paging through a multi-site selection — exactly when users compare
// the same section across sites. The badge stays visible while collapsed
// (a collapsed Evidence section still shows "Modeled only").

import type { ReactNode } from "react";
import { actions, useAppState } from "../../state/store";

export function CollapsibleSection({
  id,
  title,
  badge,
  defaultOpen = true,
  children,
}: {
  /** Stable section id — the panelSections key and the aria-controls target. */
  id: string;
  title: string;
  badge?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const state = useAppState();
  const open = state.panelSections[id] ?? defaultOpen;
  const bodyId = `detail-sec-${id}`;
  return (
    <section className="detail-section">
      <h3 className="sec-h">
        <button
          type="button"
          className="detail-sec-head"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => actions.setPanelSection(id, !open)}
        >
          <span className="sec-caret" aria-hidden="true">
            {open ? "▾" : "▸"}
          </span>
          <span className="sec-title">{title}</span>
          {badge}
        </button>
      </h3>
      <div id={bodyId} className="sec-body" hidden={!open}>
        {children}
      </div>
    </section>
  );
}
