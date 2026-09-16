"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  DEFAULT_SETTINGS,
  KEY_STORAGE_PREFIX,
  SETTINGS_STORAGE_KEY,
  parseSettings,
  type AssistantSettings,
  type ProviderId,
} from "@/lib/assistant";

/**
 * Which model the assistant is talking to, and with whose key.
 *
 * Read the same way the editor reads every other device preference — through
 * `useSyncExternalStore` rather than copied into state by an effect. Two
 * things fall out of that which matter here. A second ForkLeaf tab picks up a
 * key pasted in the first one, instead of still claiming there is no key. And
 * the panel never renders a setup form for a fraction of a second on the way
 * to knowing there was a key all along, which is what an effect would do.
 *
 * Neither the settings nor the key are written into the repository. A key is
 * the most obviously device-shaped thing in the app, and committing one to a
 * notebook that might be public is not a mistake worth leaving available.
 */
export function useAssistantSettings(): [AssistantSettings, (next: AssistantSettings) => void] {
  const settings = useSyncExternalStore(subscribe, settingsSnapshot, () => DEFAULT_SETTINGS);

  const change = useCallback((next: AssistantSettings) => {
    write(SETTINGS_STORAGE_KEY, JSON.stringify(next));
  }, []);

  return [settings, change];
}

/** The key for one provider, which is empty until there is one. */
export function useAssistantKey(id: ProviderId): [string, (key: string) => void] {
  const storageKey = `${KEY_STORAGE_PREFIX}${id}`;

  const subscribeToKey = useCallback((onChange: () => void) => subscribe(onChange), []);

  const key = useSyncExternalStore(
    subscribeToKey,
    () => read(storageKey) ?? "",
    () => "",
  );

  const change = useCallback((next: string) => write(storageKey, next || null), [storageKey]);

  return [key, change];
}

function subscribe(onChange: () => void): () => void {
  const handle = (event: StorageEvent) => {
    if (
      event.key === null ||
      event.key === SETTINGS_STORAGE_KEY ||
      event.key.startsWith(KEY_STORAGE_PREFIX)
    )
      onChange();
  };
  window.addEventListener("storage", handle);
  return () => window.removeEventListener("storage", handle);
}

/**
 * The settings object, parsed once per change.
 *
 * `getSnapshot` has to return the same object until something actually moves —
 * a fresh `JSON.parse` every render is a new reference every render, which
 * React reads as an endless stream of updates and loops on.
 */
let parsedFrom: string | null = null;
let parsed: AssistantSettings = DEFAULT_SETTINGS;

function settingsSnapshot(): AssistantSettings {
  const raw = read(SETTINGS_STORAGE_KEY);
  if (raw !== parsedFrom) {
    parsedFrom = raw;
    parsed = parseSettings(raw);
  }
  return parsed;
}

/**
 * Where these live when `localStorage` will not have them.
 *
 * A browser with site data switched off still has to let somebody use the
 * assistant for the session they are in; what it cannot do is remember the key
 * tomorrow, which is a smaller loss than a panel that forgets it between
 * keystrokes.
 */
const memory = new Map<string, string>();

function read(key: string): string | null {
  try {
    // A working store's "nothing here" is the answer, not a reason to go
    // looking in the fallback: a key removed is a key gone, and memory that
    // answers over an empty store is a key that cannot be forgotten.
    return window.localStorage.getItem(key);
  } catch {
    return memory.get(key) ?? null;
  }
}

function write(key: string, value: string | null): void {
  if (value === null) memory.delete(key);
  else memory.set(key, value);

  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // As above.
  }
  // `storage` only fires in *other* tabs, so this one is told by hand.
  window.dispatchEvent(new StorageEvent("storage", { key }));
}
