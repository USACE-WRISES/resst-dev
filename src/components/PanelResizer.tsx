// Drag/keyboard resizer for the Selected Data panel's left edge — the
// TableResizer pattern rotated 90°: rAF-coalesced imperative writes of the
// --details-col custom property on .app-main during the drag, a store commit
// only on pointerup. The panel's right edge is pinned to the app edge, so
// width = cached rect.right − pointerX (never content measurements — the
// ResizeObserver-runaway rule, commit 2cb90e7). Desktop only: the stylesheet
// hides the grip at drawer widths, where the drawer owns its own sizing.
// The grip is user-select: none and the drag marks <html> (resizeSession.ts),
// so a press never starts a text selection across the page.

import { useEffect, useRef } from "react";
import { actions, DETAILS_COL_MAX, DETAILS_COL_MIN } from "../state/store";
import { useWindowWidth } from "../lib/useMediaQuery";
import { beginResizeSession, endResizeSession } from "./resizeSession";

/** The default track, mirroring --details-col on :root in styles.css:
    min(800px, 50vw), about double the old 400px and never over half the window. */
export const defaultDetailsWidth = (windowWidth: number): number => Math.round(Math.min(800, windowWidth * 0.5));
/** The widest the panel may be dragged: DETAILS_COL_MAX, and never more than
    70% of the window (MapView's inline min(…, 70vw) mirrors it), so the map
    keeps room. */
export const maxDetailsWidth = (windowWidth: number): number =>
  Math.max(DETAILS_COL_MIN, Math.min(DETAILS_COL_MAX, Math.round(windowWidth * 0.7)));

const clamp = (w: number) => Math.min(maxDetailsWidth(window.innerWidth), Math.max(DETAILS_COL_MIN, Math.round(w)));

export function PanelResizer({ widthPx }: { widthPx: number | null }) {
  const windowWidth = useWindowWidth();
  const gripRef = useRef<HTMLDivElement>(null);
  // Drag session state in refs — no React state, nothing re-renders per move.
  const dragRef = useRef<{ right: number; width: number; frame: number } | null>(null);

  const mainEl = () => gripRef.current?.closest<HTMLElement>(".app-main") ?? null;

  // Unmounting mid-drag must not leave the page marked as resizing.
  useEffect(() => () => endResizeSession("col"), []);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const panel = gripRef.current?.parentElement; // .details-panel
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    dragRef.current = { right: rect.right, width: widthPx ?? Math.round(rect.width), frame: 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.setAttribute("data-dragging", "");
    beginResizeSession("col"); // after capture: a throwing capture leaves no mark behind
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
    endResizeSession("col");
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
    // With no saved width, steps start from the panel's real (default) width.
    const cur = widthPx ?? Math.round(gripRef.current?.parentElement?.getBoundingClientRect().width || defaultDetailsWidth(window.innerWidth));
    let next: number;
    if (e.key === "ArrowLeft") next = clamp(cur + 16); // separator moves left = panel widens
    else if (e.key === "ArrowRight") next = clamp(cur - 16);
    else if (e.key === "PageUp") next = clamp(cur + 64);
    else if (e.key === "PageDown") next = clamp(cur - 64);
    else if (e.key === "Home") next = DETAILS_COL_MIN;
    else if (e.key === "End") next = maxDetailsWidth(window.innerWidth);
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
      aria-valuemax={maxDetailsWidth(windowWidth)}
      aria-valuenow={Math.min(widthPx ?? defaultDetailsWidth(windowWidth), maxDetailsWidth(windowWidth))}
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
