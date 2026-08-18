"use client";

import { useEffect, useRef, useState } from "react";

export interface ScrollProgress<T extends HTMLElement> {
  /** Attach to the tall element the story scrolls through. */
  ref: React.RefObject<T | null>;
  /** 0 when the element's top reaches the top of the viewport, 1 at its bottom. */
  progress: number;
  /**
   * Whether to animate at all. False on the server, before the first
   * measurement, and for anyone who has asked for reduced motion — all of
   * which should get the plain stacked layout instead of a pinned one.
   */
  animated: boolean;
}

/**
 * How far the viewport has travelled through one element.
 *
 * Scroll-driven animation needs a single number, and everything else in the
 * story is derived from it. Deliberately not IntersectionObserver: the story
 * assembles continuously rather than switching at thresholds.
 */
export function useScrollProgress<T extends HTMLElement>(): ScrollProgress<T> {
  const ref = useRef<T>(null);
  const [progress, setProgress] = useState(0);
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;

    const measure = () => {
      frame = 0;
      const node = ref.current;
      if (!node) return;

      const rect = node.getBoundingClientRect();
      // The distance there is to travel is the element's height less one
      // viewport: the sticky stage stops moving once the bottom comes up.
      const total = rect.height - window.innerHeight;
      setProgress(total <= 0 ? 0 : clamp(-rect.top / total));
    };

    const onScroll = () => {
      // Coalesced into a frame: scroll fires far more often than the screen
      // repaints, and every one of these does layout work.
      if (frame === 0) frame = window.requestAnimationFrame(measure);
    };

    const sync = () => {
      const wanted = !reduced.matches;
      setAnimated(wanted);

      if (wanted) {
        measure();
        window.addEventListener("scroll", onScroll, { passive: true });
        window.addEventListener("resize", onScroll);
      } else {
        window.removeEventListener("scroll", onScroll);
        window.removeEventListener("resize", onScroll);
      }
    };

    sync();
    reduced.addEventListener("change", sync);

    return () => {
      if (frame !== 0) window.cancelAnimationFrame(frame);
      reduced.removeEventListener("change", sync);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return { ref, progress, animated };
}

function clamp(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
