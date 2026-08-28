// Keyboard focus containment for modal dialogs: focuses the container on
// mount, keeps Tab/Shift+Tab cycling inside it, and restores focus to the
// previously focused element on unmount.

import { useEffect, useRef } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useFocusTrap<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    const previous = document.activeElement as HTMLElement | null;
    const initial = container.querySelector<HTMLElement>("[autofocus]") ?? container;
    if (initial === container) container.tabIndex = -1;
    initial.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null,
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === container)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    container.addEventListener("keydown", onKey);
    return () => {
      container.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, []);
  return ref;
}
