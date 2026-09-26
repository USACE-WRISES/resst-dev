// A media query as React state (useSyncExternalStore on matchMedia), for the
// few behaviours that must follow the stylesheet's breakpoints in script.

import { useSyncExternalStore } from "react";

/** At or below this width the side panels are drawers (styles.css). */
export const NARROW = "(max-width: 1100px)";

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** The same test outside React (event handlers). */
export const isNarrow = (): boolean => typeof window !== "undefined" && window.matchMedia(NARROW).matches;

/** The window's width as React state (re-renders on resize). */
export function useWindowWidth(): number {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener("resize", onChange);
      return () => window.removeEventListener("resize", onChange);
    },
    () => window.innerWidth,
    () => 1440,
  );
}
