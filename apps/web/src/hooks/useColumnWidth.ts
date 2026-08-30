"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * A panel width the reader has chosen, remembered on this device.
 *
 * Not written into the repository: how wide somebody likes their file tree on
 * the laptop they are sitting at is not a fact about their notebook, and
 * committing it would make every window resize a change to be synced.
 *
 * Read through `useSyncExternalStore`, the same way the editor reads its other
 * device preferences. `localStorage` is a store React does not own, and going
 * through the hook gets two things that copying the value into state with an
 * effect does not: the server render and the first client render agree, so
 * there is no flash at the default width, and a second ForkLeaf tab moves its
 * seams to match rather than drifting apart from this one.
 */
export function useColumnWidth(
  key: string,
  fallback: number,
  min: number,
  max: number,
): [number, (width: number) => void, () => void] {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const handle = (event: StorageEvent) => {
        if (event.key === null || event.key === key) onChange();
      };
      window.addEventListener("storage", handle);
      return () => window.removeEventListener("storage", handle);
    },
    [key],
  );

  const width = useSyncExternalStore(
    subscribe,
    () => clamp(read(key) ?? fallback, min, max),
    () => fallback,
  );

  const change = useCallback((next: number) => write(key, clamp(next, min, max)), [key, min, max]);

  const reset = useCallback(() => write(key, null), [key]);

  return [width, change, reset];
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Where the widths live when `localStorage` will not have them.
 *
 * A browser with site data switched off still has to let somebody drag a seam.
 * Without this the width read back after every move is the stored one, which
 * is always the default — so the panel snaps back from under the pointer.
 */
const memory = new Map<string, number>();

function read(key: string): number | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw !== null) {
      const value = Number.parseInt(raw, 10);
      if (Number.isFinite(value)) return value;
    }
  } catch {
    // Storage can be switched off entirely; this session's memory answers.
  }
  return memory.get(key) ?? null;
}

function write(key: string, value: number | null): void {
  if (value === null) memory.delete(key);
  else memory.set(key, value);

  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, String(value));
  } catch {
    // Nothing to do and nothing worth saying: the width still works for this
    // session, it just will not be there tomorrow.
  }
  // `storage` only fires in *other* tabs, so this one is told by hand — and it
  // has to be told even when the write failed, because the drag has to keep up
  // with the pointer whether or not anything was saved.
  window.dispatchEvent(new StorageEvent("storage", { key }));
}
