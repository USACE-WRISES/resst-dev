// Drag/keyboard resizer for the Selected Data panel's left edge — the
// TableResizer pattern rotated 90°: rAF-coalesced imperative writes of the
// --details-col custom property on .app-main during the drag, a store commit
// only on pointerup. The panel's right edge is pinned to the app edge, so
// width = cached rect.right − pointerX (never content measurements — the
// ResizeObserver-runaway rule, commit 2cb90e7). Desktop only: the stylesheet
// hides the grip at drawer widths, where the drawer owns its own sizing.

import { useRef } from "react";
import { actions, DETAILS_COL_MAX, DETAILS_COL_MIN } from "../state/store";

/** Keyboard/aria seed while the stylesheet default applies (the 400px track:
    --details-col on :root in styles.css, which this value mirrors). */
const DEFAULT_WIDTH = 400;

const clamp = (w: number) => Math.min(DETAILS_COL_MAX, Math.max(DETAILS_COL_MIN, Math.round(w)));

export function PanelResizer({ widthPx }: { widthPx: number | null }) {
  const gripRef = useRef<HTMLDivElement>(null);
  // Drag session state in refs — no React state, nothing re-renders per move.
  const dragRef = useRef<{ right: number; width: number; frame: number } | null>(null);

  const mainEl = () => gripRef.current?.closest<HTMLElement>(".app-main") ?? null;

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const panel = gripRef.current?.parentElement; // .details-panel
    if (!panel) return;
    dragRef.current = { right: panel.getBoundingClientRect().right, width: widthPx ?? DEFAULT_WIDTH, frame: 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.setAttribute("data-dragging", "");
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    d.width = clamp(d.right - e.clientX);
    if (!d.frame) {
      d.frame = requestAnimationFrame(() => {
        d.frame = 0;
        mainEl()?.style.setProperty("--details-col", `${d.width}px`);
      });
    }
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>, commit: boolean) => {
    const d = dragRef.current;
    if (!d) return;
    if (d.frame) cancelAnimationFrame(d.frame);
    dragRef.current = null;
    e.currentTarget.removeAttribute("data-dragging");
    if (commit) {
      actions.setDetailsWidth(d.width); // React re-renders the same inline value — no flicker
    } else {
      // pointercancel: undo the imperative write back to the store's value.
      const main = mainEl();
      if (main) {
        if (widthPx != null) main.style.setProperty("--details-col", `${widthPx}px`);
        else main.style.removeProperty("--details-col");
      }
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const cur = widthPx ?? DEFAULT_WIDTH;
    let next: number;
    if (e.key === "ArrowLeft") next = clamp(cur + 16); // separator moves left = panel widens
    else if (e.key === "ArrowRight") next = clamp(cur - 16);
    else if (e.key === "PageUp") next = clamp(cur + 64);
    else if (e.key === "PageDown") next = clamp(cur - 64);
    else if (e.key === "Home") next = DETAILS_COL_MIN;
    else if (e.key === "End") next = DETAILS_COL_MAX;
    else return;
    e.preventDefault();
    actions.setDetailsWidth(next);
  };

  return (
    <div
      ref={gripRef}
      role="separator"
      tabIndex={0}
      aria-orientation="vertical"
      aria-controls="details-panel"
      aria-label="Resize selected data panel"
      aria-valuemin={DETAILS_COL_MIN}
      aria-valuemax={DETAILS_COL_MAX}
      aria-valuenow={widthPx ?? DEFAULT_WIDTH}
      className="panel-resizer-grip"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => endDrag(e, true)}
      onPointerCancel={(e) => endDrag(e, false)}
      onKeyDown={onKeyDown}
      onDoubleClick={() => actions.setDetailsWidth(null)}
    />
  );
}
