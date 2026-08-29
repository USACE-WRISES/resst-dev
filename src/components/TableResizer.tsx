// Drag/keyboard resizer + collapse pill for the results table — the original
// EXB app's bottom-Sidebar behavior (resizable divider, half-pill toggle
// straddling it; see docs/PARITY.md). The drag writes the --table-row custom
// property imperatively (rAF-coalesced) and commits to the store only on
// pointerup, so nothing re-renders per move and the map's ResizeObserver sees
// at most one resize per frame. Fractions derive from the pointer position
// against the stack rect cached at pointerdown — never from canvas or content
// measurements (the ResizeObserver-runaway rule, commit 2cb90e7).

import { useRef } from "react";
import { actions, TABLE_ROW_MAX, TABLE_ROW_MIN } from "../state/store";

/** Keyboard/aria seed while the stylesheet default applies (46%; the phone
    default is 52%, so aria-valuenow starts one nudge low there — corrected by
    the first interaction). */
const DEFAULT_FRAC = 0.46;

const clamp = (f: number) => Math.min(TABLE_ROW_MAX, Math.max(TABLE_ROW_MIN, f));

export function TableResizer({ collapsed, heightFrac }: { collapsed: boolean; heightFrac: number | null }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const tabRef = useRef<HTMLButtonElement>(null);
  // Drag session state in refs — no React state, so nothing re-renders per
  // move and the table's key={tab.id} subtree is untouched during the drag.
  const dragRef = useRef<{ rect: DOMRect; frac: number; frame: number } | null>(null);

  const stackEl = () => rootRef.current?.parentElement as HTMLElement | null; // .center-stack

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const stack = stackEl();
    if (!stack) return;
    dragRef.current = { rect: stack.getBoundingClientRect(), frac: heightFrac ?? DEFAULT_FRAC, frame: 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.setAttribute("data-dragging", "");
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    d.frac = clamp((d.rect.bottom - e.clientY) / d.rect.height);
    if (!d.frame) {
      d.frame = requestAnimationFrame(() => {
        d.frame = 0;
        stackEl()?.style.setProperty("--table-row", `${(d.frac * 100).toFixed(2)}%`);
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
      actions.setTableHeight(d.frac); // React re-renders the same inline value — no flicker
    } else {
      // pointercancel: undo the imperative write back to the store's value.
      const stack = stackEl();
      if (stack) {
        if (heightFrac != null) stack.style.setProperty("--table-row", `${(heightFrac * 100).toFixed(2)}%`);
        else stack.style.removeProperty("--table-row");
      }
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const cur = heightFrac ?? DEFAULT_FRAC;
    let next: number | null;
    if (e.key === "ArrowUp") next = clamp(cur + 0.02);
    else if (e.key === "ArrowDown") next = clamp(cur - 0.02);
    else if (e.key === "PageUp") next = clamp(cur + 0.1);
    else if (e.key === "PageDown") next = clamp(cur - 0.1);
    else if (e.key === "Home") next = TABLE_ROW_MIN;
    else if (e.key === "End") next = TABLE_ROW_MAX;
    else if (e.key === "Enter") {
      e.preventDefault();
      actions.setTableCollapsed(true);
      // The grip unmounts with the collapse — hand focus to the pill.
      requestAnimationFrame(() => tabRef.current?.focus());
      return;
    } else return;
    e.preventDefault();
    actions.setTableHeight(next);
  };

  return (
    <div className="table-resizer" ref={rootRef}>
      {!collapsed && (
        <div
          role="separator"
          tabIndex={0}
          aria-orientation="horizontal"
          aria-controls="results-table"
          aria-label="Resize results table"
          aria-valuemin={Math.round(TABLE_ROW_MIN * 100)}
          aria-valuemax={Math.round(TABLE_ROW_MAX * 100)}
          aria-valuenow={Math.round((heightFrac ?? DEFAULT_FRAC) * 100)}
          className="table-resizer-grip"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(e) => endDrag(e, true)}
          onPointerCancel={(e) => endDrag(e, false)}
          onKeyDown={onKeyDown}
          onDoubleClick={() => actions.setTableHeight(null)}
        />
      )}
      <button
        type="button"
        ref={tabRef}
        className="table-collapse-tab"
        aria-expanded={!collapsed}
        aria-controls="results-table"
        aria-label={collapsed ? "Expand results table" : "Collapse results table"}
        onClick={() => actions.setTableCollapsed(!collapsed)}
      >
        <svg aria-hidden="true" focusable="false" width="14" height="14" viewBox="0 0 16 16">
          <path d="M3.5 6l4.5 4.5L12.5 6" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      </button>
    </div>
  );
}
