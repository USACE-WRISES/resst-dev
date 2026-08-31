// Keyboard focus containment for modal dialogs: focuses the container on
// mount, keeps Tab/Shift+Tab cycling inside it, recovers focus if it escapes,
// and restores focus to the previously focused element on unmount.

import { useEffect, useRef } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const focusableIn = (container: HTMLElement) =>
  [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);

export function useFocusTrap<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    const previous = document.activeElement as HTMLElement | null;
    // React implements `autoFocus` by calling focus() during commit and never
    // renders the attribute, so the [autofocus] query this used to do matched
    // nothing and silently fell through. A data-* attribute does reach the
    // DOM, so a dialog can name its own target. Without one the container
    // takes focus, which is what content-heavy dialogs want: a screen reader
    // announces the title and body rather than jumping to a button.
    const initial = container.querySelector<HTMLElement>("[data-autofocus]") ?? container;
    if (initial === container) container.tabIndex = -1;
    initial.focus();

    // Listen on the document, not the container. A container-scoped listener
    // only ever fires while focus is already inside, so the first stray focus
    // elsewhere — during boot the dialog mounts alongside the whole app shell
    // and MapLibre — left the trap permanently inert with nothing to recover
    // it. Capture phase so the modal claims Tab before anything below it.
    // Assumes one modal at a time, which holds today: Welcome, Help, Download
    // and Report never co-exist. Two mounted traps would both claim Tab.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = focusableIn(container);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!active || !container.contains(active)) {
        e.preventDefault(); // focus escaped — pull it back rather than giving up
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && (active === first || active === container)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      previous?.focus?.();
    };
  }, []);
  return ref;
}
