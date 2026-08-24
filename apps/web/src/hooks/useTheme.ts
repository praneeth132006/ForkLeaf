"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  ACCENT_PROPERTIES,
  DEFAULT_PALETTE,
  PALETTES,
  accentFor,
  applyAccent,
  customAccentFrom,
  type CustomAccent,
  type PaletteId,
} from "@/lib/palette";

export type Theme = "light" | "dark";

const STORAGE_KEY = "forkleaf-theme";
const PALETTE_KEY = "forkleaf-palette";
const CUSTOM_KEY = "forkleaf-custom-accent";

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

/**
 * Applies a theme choice made in another tab.
 *
 * A `storage` event tells this tab the value changed, but the snapshot reads
 * the DOM — which no other tab can write to — so notifying alone re-rendered
 * with the old theme still on `<html>`. The attribute has to be re-applied
 * here. That matters now that a diagram can be edited in a window of its own:
 * a diagram is drawn in the theme's palette, and having it drawn in the other
 * one because the toggle was pressed in the note tab is exactly the mismatch
 * the palette work exists to avoid.
 */
function adoptStoredTheme(event: StorageEvent): void {
  if (
    event.key !== null &&
    event.key !== STORAGE_KEY &&
    event.key !== PALETTE_KEY &&
    event.key !== CUSTOM_KEY
  ) {
    return;
  }

  const root = document.documentElement;

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const theme: Theme = stored === "dark" || stored === "light" ? stored : getSnapshot();
    root.dataset.theme = theme;

    // The accent is chosen separately and stored separately, so it is adopted
    // separately — a tab that only learns about the mode ends up in the right
    // mode wearing the other tab's accent.
    const storedPalette = window.localStorage.getItem(PALETTE_KEY);
    if (
      storedPalette &&
      (PALETTES.some((palette) => palette.id === storedPalette) || storedPalette === "custom")
    ) {
      root.dataset.palette = storedPalette;
    }

    applyAccent(root, accentFor(paletteSnapshot(), theme, readCustom()));
  } catch {
    // Storage went away mid-session; this tab simply keeps its own theme.
  }
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);

  // Keep other tabs in step.
  const onStorage = (event: StorageEvent) => {
    adoptStoredTheme(event);
    onChange();
  };

  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

/** The server has no DOM; the inline script corrects this before paint. */
function getServerSnapshot(): Theme {
  return "light";
}

function readCustom(): CustomAccent | null {
  try {
    const raw = window.localStorage.getItem(CUSTOM_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CustomAccent;
    // Re-derived rather than trusted: the stored shape is from an older
    // version the moment the derivation changes, and a half-written object
    // would leave the accent variables set to `undefined`.
    return typeof parsed?.hex === "string" ? customAccentFrom(parsed.hex) : null;
  } catch {
    return null;
  }
}

function paletteSnapshot(): PaletteId {
  const id = document.documentElement.dataset.palette;
  return PALETTES.some((palette) => palette.id === id) || id === "custom"
    ? (id as PaletteId)
    : DEFAULT_PALETTE;
}

function paletteServerSnapshot(): PaletteId {
  return DEFAULT_PALETTE;
}

export interface PaletteControls {
  palette: PaletteId;
  /** The colour behind a custom palette, for the picker to show. */
  customHex: string | null;
  choose: (id: PaletteId) => void;
  /** Sets — and switches to — a custom accent. Ignores an unparseable colour. */
  setCustom: (hex: string) => void;
}

/**
 * The accent palette, alongside the light/dark mode.
 *
 * Separate hook from `useTheme` because they are separate choices: the mode is
 * about the room you are in, the palette is about taste, and nothing should
 * reset one when the other changes.
 */
export function usePalette(): PaletteControls {
  const palette = useSyncExternalStore(subscribe, paletteSnapshot, paletteServerSnapshot);
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const apply = useCallback((id: PaletteId, custom: CustomAccent | null) => {
    const root = document.documentElement;
    root.dataset.palette = id;
    applyAccent(root, accentFor(id, getSnapshot(), custom));

    try {
      window.localStorage.setItem(PALETTE_KEY, id);
      if (custom) window.localStorage.setItem(CUSTOM_KEY, JSON.stringify(custom));
    } catch {
      // Applies for this session, just not remembered.
    }

    for (const listener of listeners) listener();
  }, []);

  const choose = useCallback((id: PaletteId) => apply(id, readCustom()), [apply]);

  const setCustom = useCallback(
    (hex: string) => {
      const custom = customAccentFrom(hex);
      // A colour that will not parse is a typo mid-edit, not a command.
      if (custom) apply("custom", custom);
    },
    [apply],
  );

  return {
    palette,
    // `theme` is a dependency in spirit: the picker re-reads the swatch when
    // the mode flips, because the same palette is a different colour in each.
    customHex: theme ? (readCustom()?.hex ?? null) : null,
    choose,
    setCustom,
  };
}

export function useTheme(): [Theme, (next: Theme) => void, () => void] {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setTheme = useCallback((next: Theme) => {
    const root = document.documentElement;
    root.dataset.theme = next;

    // Every palette is a different colour in each mode, so flipping the mode
    // has to re-resolve the accent. Without this, switching to light left the
    // dark accent in place as an inline style — which outranks the stylesheet,
    // so the light theme kept the dark theme's accent forever.
    applyAccent(root, accentFor(paletteSnapshot(), next, readCustom()));

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
 * theme is applied without a flash.
 *
 * It carries the palette table with it. That is deliberate: the accent is an
 * inline style on `<html>`, so nothing in the stylesheet can supply it, and a
 * palette applied one frame after paint is a visible flash of the wrong colour
 * on every single load. The table is inlined from `PALETTES` rather than
 * retyped, so the script cannot drift from what the picker offers.
 *
 * A custom accent is read from storage already resolved — the derivation lives
 * in `palette.ts` and runs when the colour is chosen, not here. This script
 * stays four `setProperty` calls and no arithmetic, which is what keeps it
 * small enough to justify blocking paint on.
 */
export const THEME_INIT_SCRIPT = `
(function () {
  var accents = ${JSON.stringify(
    Object.fromEntries(
      PALETTES.map((palette) => [palette.id, { light: palette.light, dark: palette.dark }]),
    ),
  )};
  var properties = ${JSON.stringify(ACCENT_PROPERTIES)};
  var root = document.documentElement;

  try {
    var stored = localStorage.getItem(${JSON.stringify(STORAGE_KEY)});
    var theme = stored === "dark" || stored === "light"
      ? stored
      : (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    root.dataset.theme = theme;

    var palette = localStorage.getItem(${JSON.stringify(PALETTE_KEY)}) || ${JSON.stringify(DEFAULT_PALETTE)};
    var vars = accents[palette] && accents[palette][theme];

    if (!vars && palette === "custom") {
      var raw = localStorage.getItem(${JSON.stringify(CUSTOM_KEY)});
      if (raw) vars = JSON.parse(raw)[theme];
    }
    if (!vars) {
      palette = ${JSON.stringify(DEFAULT_PALETTE)};
      vars = accents[palette][theme];
    }

    root.dataset.palette = palette;
    for (var key in properties) {
      if (vars[key]) root.style.setProperty(properties[key], vars[key]);
    }
  } catch (e) {
    root.dataset.theme = "light";
    root.dataset.palette = ${JSON.stringify(DEFAULT_PALETTE)};
  }
})();
`.trim();
