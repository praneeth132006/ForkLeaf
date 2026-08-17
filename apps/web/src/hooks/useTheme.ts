"use client";

import { useCallback, useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "mdnotion-theme";

/**
 * Theme state, read from the DOM rather than from React state.
 *
 * The `data-theme` attribute is set by a blocking inline script in the document
 * head (see `layout.tsx`), before React ever runs. That is what prevents the
 * flash of the wrong theme on load — and it means the DOM, not a `useState`,
 * is the source of truth.
 *
 * `useSyncExternalStore` is the correct way to read that: it gives a stable
 * server snapshot for SSR and re-renders when the value actually changes,
 * without an effect that sets state during mount.
 */

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

function getSnapshot(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

/** The server has no DOM; the inline script corrects this before paint. */
function getServerSnapshot(): Theme {
  return "light";
}

export function useTheme(): [Theme, (next: Theme) => void, () => void] {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setTheme = useCallback((next: Theme) => {
    document.documentElement.dataset.theme = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private browsing or a blocked storage partition — the theme still
      // applies for this session, it just will not be remembered.
    }
    for (const listener of listeners) listener();
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(getSnapshot() === "dark" ? "light" : "dark");
  }, [setTheme]);

  return [theme, setTheme, toggleTheme];
}

/**
 * The script injected into the head. Runs before first paint, so the correct
 * palette is applied without a flash.
 */
export const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem(${JSON.stringify(STORAGE_KEY)});
    var theme = stored === "dark" || stored === "light"
      ? stored
      : (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.dataset.theme = theme;
  } catch (e) {
    document.documentElement.dataset.theme = "light";
  }
})();
`.trim();
