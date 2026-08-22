"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * How the dashboard's note index is drawn.
 *
 * Three genuinely different questions, not three skins: "what did I touch
 * last" (list), "how is this repository organised" (tree), and "which of these
 * near-identical titles is the one I want" (cards).
 */
export type IndexView = "list" | "tree" | "grid";

const STORAGE_KEY = "forkleaf-dashboard-view";

const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  // Keep other tabs in step.
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function getSnapshot(): IndexView {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === "tree" || stored === "grid" ? stored : "list";
  } catch {
    // Private browsing or a blocked storage partition.
    return "list";
  }
}

/** The server cannot know the preference; the client corrects it on mount. */
function getServerSnapshot(): IndexView {
  return "list";
}

/**
 * The remembered view preference.
 *
 * `useSyncExternalStore` rather than an effect that calls `setState`: the
 * value lives in localStorage, which is an external store, and reading it in
 * an effect means an extra render pass on every visit to the dashboard.
 */
export function useIndexView(): [IndexView, (next: IndexView) => void] {
  const view = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setView = useCallback((next: IndexView) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // The choice still applies for this session, it just is not remembered.
    }
    for (const listener of listeners) listener();
  }, []);

  return [view, setView];
}
