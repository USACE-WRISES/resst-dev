// Shared popover dismissal: closes on Escape or a mousedown outside the
// popover root. The callback is held in a ref so the listeners attach and
// detach on the open/close edge only, never on every render.

import { useEffect, useRef, type RefObject } from "react";

export type DismissReason = "escape" | "outside";

export function useDismissPopover<T extends HTMLElement>(
  open: boolean,
  ref: RefObject<T | null>,
  onDismiss: (reason: DismissReason) => void,
): void {
  const handler = useRef(onDismiss);
  handler.current = onDismiss;
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) handler.current("outside");
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && handler.current("escape");
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, ref]);
}
