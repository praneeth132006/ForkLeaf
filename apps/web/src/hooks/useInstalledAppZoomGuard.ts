"use client";

import { useEffect } from "react";

/**
 * True when ForkLeaf is running as an installed app — added to the Dock or the
 * Home Screen — rather than in a browser tab.
 */
export function isInstalledApp(): boolean {
  if (typeof window === "undefined") return false;
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches ?? false;
  return standalone || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/**
 * Stops the installed app's whole window being pinch-zoomed.
 *
 * In a browser tab, zooming the page is the browser's business. In the
 * installed app there is no browser chrome to see it happen or undo it from,
 * and Safari keeps the magnification when the app reloads: a stray pinch on
 * the trackpad left the editor blown up past the edge of its own window, with
 * the right-hand panel cut off, every time it was opened again.
 *
 * Only the page's own pinch is stopped. A diagram, the graph or a canvas that
 * zooms itself handles the gesture first (their listeners sit below the
 * window), so they keep working. ⌘+ and ⌘− are left alone: making the text
 * bigger on purpose is a real need, and it is undone with ⌘0.
 */
export function useInstalledAppZoomGuard(): void {
  useEffect(() => {
    if (!isInstalledApp()) return;

    // Safari's trackpad pinch.
    const stopGesture = (event: Event) => event.preventDefault();
    // Chrome and Edge report a trackpad pinch as a wheel with Ctrl held.
    const stopPinchWheel = (event: WheelEvent) => {
      if (event.ctrlKey) event.preventDefault();
    };

    const options = { passive: false } as const;
    window.addEventListener("gesturestart", stopGesture, options);
    window.addEventListener("gesturechange", stopGesture, options);
    window.addEventListener("gestureend", stopGesture, options);
    window.addEventListener("wheel", stopPinchWheel, options);
    return () => {
      window.removeEventListener("gesturestart", stopGesture);
      window.removeEventListener("gesturechange", stopGesture);
      window.removeEventListener("gestureend", stopGesture);
      window.removeEventListener("wheel", stopPinchWheel);
    };
  }, []);
}
