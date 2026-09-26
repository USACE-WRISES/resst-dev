// A card in the Selected Data accordion. The header is a disclosure button
// showing the title, an optional one-line peek ("74% lost"), the provenance
// badge, and a chevron; all of it stays visible while collapsed.
//
// Open state is the store's `openSection`: one card at a time (owner
// decision 2026-09-25), surviving the pager and selection changes, which is
// exactly when users compare the same card across sites. Bodies stay mounted
// while closed (`hidden`) because the network highlight and the trajectory
// prefetch run from inside them. A `lazy` card keeps its body container (the
// aria-controls target) but mounts its children only while open.

import { useEffect, useRef, type ReactNode } from "react";
import { actions, useAppState } from "../../state/store";
import { ChevronDown } from "../icons";

export function CollapsibleSection({
  id,
  title,
  badge,
  peek,
  lazy = false,
  children,
}: {
  /** Stable card id: the openSection value and the aria-controls target. */
  id: string;
  title: string;
  badge?: ReactNode;
  /** Muted one-line summary shown in the header. */
  peek?: ReactNode;
  lazy?: boolean;
  children: ReactNode;
}) {
  const state = useAppState();
  const open = state.openSection === id;
  const bodyId = `detail-sec-${id}`;
  const sectionRef = useRef<HTMLElement>(null);
  // Scroll only after a user click opened this card; a card the store
  // re-opens on a selection change keeps the panel where it is.
  const scrollAfterOpen = useRef(false);
  useEffect(() => {
    if (!open || !scrollAfterOpen.current) return;
    scrollAfterOpen.current = false;
    sectionRef.current?.scrollIntoView({ block: "nearest" });
  }, [open]);
  return (
    <section className={open ? "detail-section is-open" : "detail-section"} ref={sectionRef}>
      <h3 className="sec-h">
        <button
          type="button"
          className="detail-sec-head"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => {
            scrollAfterOpen.current = !open;
            actions.setOpenSection(open ? null : id);
          }}
        >
          <span className="sec-title">{title}</span>
          {peek != null && peek !== "" && <span className="sec-peek">{peek}</span>}
          {badge}
          <ChevronDown className="sec-chevron" />
        </button>
      </h3>
      <div id={bodyId} className="sec-body" hidden={!open}>
        {(!lazy || open) && children}
      </div>
    </section>
  );
}
