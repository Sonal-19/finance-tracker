import { useSyncExternalStore } from "react";

function useMediaQuery(query: string, serverValue = false) {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}

/** Phones/tablets: taps, and media inside iframes needs a tap on the iframe itself. */
export const useIsTouch = () => useMediaQuery("(pointer: coarse)");

/**
 * Devices that should get the lightweight hero: touch screens, phone-width
 * screens, and users who asked for reduced motion. Continuous
 * blurred/filtered animations make mobile GPUs drop frames and stop painting.
 */
export const useLiteMotion = () =>
  useMediaQuery(
    "(pointer: coarse), (max-width: 767px), (prefers-reduced-motion: reduce)",
    true,
  );

/** Below Tailwind's `md` breakpoint — phones get bottom sheets and the tab bar. */
export const useIsMobile = () => useMediaQuery("(max-width: 767px)");
