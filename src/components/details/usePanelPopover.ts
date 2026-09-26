// Placement for the small popovers inside the Selected Data panel (and the
// Screening dock): the ⓘ citations, the ⓘ explanations, the survey-code
// glossary. Those panels are scroll containers, so anything past their edges
// is clipped: an upward, right-anchored popover on a short source line used
// to run off the panel's left edge and vanish under the results table.

import { useLayoutEffect, type RefObject } from "react";

/** Popover width cap and the gap kept from the host panel's edges. */
const POP_MAX_WIDTH = 260;
const POP_INSET = 10;

/**
 * Place an open popover inside the panel that holds its trigger: under the
 * trigger, centred on it but clamped to the panel's content box (never under
 * its scrollbar), then scrolled into view. `fullWidth` popovers keep their
 * own horizontal layout and only scroll in. The popover is absolutely
 * positioned against `wrapRef` (position: relative).
 */
export function usePanelPopover(
  open: boolean,
  wrapRef: RefObject<HTMLElement | null>,
  popRef: RefObject<HTMLElement | null>,
  fullWidth = false,
): void {
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const pop = popRef.current;
    if (!open || !wrap || !pop) return;
    if (!fullWidth) {
      const host = wrap.closest<HTMLElement>(".details-panel, .screening-dock, .dash-card, .lib-detail");
      const hostLeft = host ? host.getBoundingClientRect().left + host.clientLeft : 0;
      // The open popover can lengthen the panel enough to bring its scrollbar
      // in, narrowing the content box: keep that strip free up front.
      const scrollbarRoom = host && host.scrollHeight <= host.clientHeight ? 16 : 0;
      const hostRight = host ? hostLeft + host.clientWidth - scrollbarRoom : window.innerWidth;
      const width = Math.min(POP_MAX_WIDTH, hostRight - hostLeft - 2 * POP_INSET);
      const a = wrap.getBoundingClientRect();
      const left = Math.min(Math.max(a.left + a.width / 2 - width / 2, hostLeft + POP_INSET), hostRight - POP_INSET - width);
      pop.style.width = `${Math.round(width)}px`;
      pop.style.left = `${Math.round(left - a.left)}px`;
    }
    pop.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}
