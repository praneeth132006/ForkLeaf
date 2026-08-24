// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useTheme } from "./useTheme";

/**
 * The theme has to survive being changed in a different tab.
 *
 * The snapshot is read from `data-theme` on `<html>`, which only the tab that
 * owns the document can write — so a `storage` event has to be turned back
 * into a DOM change here. Notifying without re-applying re-rendered every
 * consumer with the old palette still in place, which is invisible in a single
 * tab and very visible once a diagram is being edited in a second one: the
 * diagram is drawn in the theme's own colours, so it stayed dark in a window
 * whose note had just been switched to light.
 */

function installStorage(): void {
  const entries = new Map<string, string>();

  // Node 25 defines its own experimental `localStorage` global that shadows
  // jsdom's, with every method missing unless the process was started with a
  // backing file. The test needs the API a browser actually has.
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      get length() {
        return entries.size;
      },
      key: (index: number) => [...entries.keys()][index] ?? null,
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => void entries.set(key, String(value)),
      removeItem: (key: string) => void entries.delete(key),
      clear: () => entries.clear(),
    },
  });
}

/** What the browser fires at every *other* tab when storage is written. */
function storageEvent(key: string): void {
  window.dispatchEvent(new StorageEvent("storage", { key }));
}

beforeEach(() => {
  installStorage();
  document.documentElement.dataset.theme = "light";
  document.documentElement.dataset.palette = "slate";
});

afterEach(() => {
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.palette;
});

describe("useTheme", () => {
  it("reads the theme off the document", () => {
    const view = renderHook(() => useTheme());
    expect(view.result.current[0]).toBe("light");

    document.documentElement.dataset.theme = "dark";
    // Nothing has told React yet — the attribute alone is not an event.
    expect(view.result.current[0]).toBe("light");
  });

  it("applies the theme and remembers it", () => {
    const view = renderHook(() => useTheme());

    act(() => view.result.current[1]("dark"));

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(window.localStorage.getItem("forkleaf-theme")).toBe("dark");
    // The accent is an inline style, so the mode has to re-resolve it.
    expect(document.documentElement.style.getPropertyValue("--fl-accent")).toMatch(/^#/);
  });

  it("toggles to the other mode", () => {
    const view = renderHook(() => useTheme());

    act(() => view.result.current[2]());
    expect(view.result.current[0]).toBe("dark");

    act(() => view.result.current[2]());
    expect(view.result.current[0]).toBe("light");
  });

  it("adopts a theme chosen in another tab", () => {
    const view = renderHook(() => useTheme());

    // The other tab wrote the value; this tab only gets the event.
    window.localStorage.setItem("forkleaf-theme", "dark");
    act(() => storageEvent("forkleaf-theme"));

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(view.result.current[0]).toBe("dark");
  });

  it("adopts an accent chosen in another tab", () => {
    renderHook(() => useTheme());

    window.localStorage.setItem("forkleaf-palette", "lavender");
    act(() => storageEvent("forkleaf-palette"));

    expect(document.documentElement.dataset.palette).toBe("lavender");
  });

  it("ignores a palette id it does not know", () => {
    renderHook(() => useTheme());

    window.localStorage.setItem("forkleaf-palette", "chartreuse");
    act(() => storageEvent("forkleaf-palette"));

    // A newer build's palette, or a hand-edited value: keep the one that works
    // rather than setting an id nothing has colours for.
    expect(document.documentElement.dataset.palette).toBe("slate");
  });

  it("leaves the theme alone for another product's storage key", () => {
    renderHook(() => useTheme());

    window.localStorage.setItem("forkleaf-theme", "dark");
    act(() => storageEvent("some-other-app"));

    expect(document.documentElement.dataset.theme).toBe("light");
  });
});
