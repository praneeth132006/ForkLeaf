"use client";

import { useEffect, useMemo, useState } from "react";
import type { SpellBridge } from "@forkleaf/editor";

/**
 * Spelling suggestions: the dictionary, a person's own words, and the switch.
 *
 * The dictionary lives in a worker (`spell.worker.ts`) and answers slowly by
 * the standards of a keystroke, so the editors never wait on it: they ask
 * whether a word is known, are told "not yet", and are handed a new bridge
 * with the answer a moment later. Everything happens on the device; nothing
 * typed is sent anywhere to be checked.
 *
 * Words a person adds ("Add to dictionary") are kept in this browser. Words
 * they ignore are forgotten when the page is reloaded.
 */

/** What the dictionary worker is, as far as this module needs to know. */
export interface SpellTransport {
  postMessage: (message: unknown) => void;
  onmessage: ((event: MessageEvent) => void) | null;
}

export interface SpellStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

const WORDS_KEY = "forkleaf:spelling:words";
const ENABLED_KEY = "forkleaf:spelling";

/** How long to gather words before sending them to be checked, in ms. */
const BATCH_MS = 40;

export class SpellService {
  private readonly known = new Map<string, boolean>();
  private readonly asking = new Set<string>();
  private readonly ignored = new Set<string>();
  private readonly personal: Set<string>;
  private readonly waiting = new Map<number, (suggestions: string[]) => void>();
  private queue: string[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private nextId = 1;
  private transport: SpellTransport | null = null;
  private readonly listeners = new Set<() => void>();
  /** Set when the dictionary could not be loaded; nothing more is asked. */
  failure: string | null = null;

  constructor(
    private readonly connect: () => SpellTransport | null,
    private readonly storage: SpellStorage | null,
  ) {
    this.personal = new Set(readWords(storage));
  }

  /** Called whenever answers arrive or the word lists change. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  check(word: string): boolean | undefined {
    if (this.ignored.has(word) || this.personal.has(word.toLowerCase())) return true;
    return this.known.get(word);
  }

  request(words: readonly string[]): void {
    if (this.failure) return;
    for (const word of words) {
      if (this.known.has(word) || this.asking.has(word)) continue;
      if (this.check(word) !== undefined) continue;
      this.asking.add(word);
      this.queue.push(word);
    }
    if (this.queue.length > 0 && !this.timer) {
      this.timer = setTimeout(() => this.flush(), BATCH_MS);
    }
  }

  suggest(word: string): Promise<string[]> {
    const transport = this.ensure();
    if (!transport) return Promise.resolve([]);
    const id = this.nextId++;
    return new Promise((resolve) => {
      this.waiting.set(id, resolve);
      transport.postMessage({ id, type: "suggest", word });
    });
  }

  learn(word: string): void {
    const lower = word.toLowerCase();
    if (!this.personal.has(lower)) {
      this.personal.add(lower);
      try {
        this.storage?.setItem(WORDS_KEY, JSON.stringify([...this.personal].sort()));
      } catch {
        // Storage full or blocked: the word still counts until reload.
      }
      this.transport?.postMessage({ type: "add", words: [lower] });
    }
    this.emit();
  }

  ignore(word: string): void {
    this.ignored.add(word);
    this.emit();
  }

  /** The words this person has added, for showing and removing them. */
  get words(): string[] {
    return [...this.personal].sort();
  }

  forget(word: string): void {
    if (!this.personal.delete(word.toLowerCase())) return;
    try {
      this.storage?.setItem(WORDS_KEY, JSON.stringify([...this.personal].sort()));
    } catch {
      // As above.
    }
    // The worker cannot unlearn a word; a fresh one, and checking afresh, is
    // what undoes it.
    (this.transport as { terminate?: () => void } | null)?.terminate?.();
    this.transport = null;
    this.known.clear();
    this.asking.clear();
    this.emit();
  }

  private flush(): void {
    this.timer = null;
    const words = this.queue;
    this.queue = [];
    const transport = this.ensure();
    if (!transport) {
      for (const word of words) this.asking.delete(word);
      return;
    }
    transport.postMessage({ id: this.nextId++, type: "check", words });
  }

  private ensure(): SpellTransport | null {
    if (this.transport) return this.transport;
    const transport = this.connect();
    if (!transport) return null;
    transport.onmessage = (event) => this.receive(event.data);
    if (this.personal.size > 0) transport.postMessage({ type: "add", words: [...this.personal] });
    this.transport = transport;
    return transport;
  }

  private receive(message: unknown): void {
    const data = message as
      | { id: number; type: "checked"; results: [string, boolean][] }
      | { id: number; type: "suggested"; suggestions: string[] }
      | { id: number; type: "failed"; message: string };

    if (data.type === "checked") {
      for (const [word, ok] of data.results) {
        this.known.set(word, ok);
        this.asking.delete(word);
      }
      this.emit();
    } else if (data.type === "suggested") {
      this.waiting.get(data.id)?.(data.suggestions);
      this.waiting.delete(data.id);
    } else if (data.type === "failed") {
      this.failure = data.message;
      this.asking.clear();
      for (const resolve of this.waiting.values()) resolve([]);
      this.waiting.clear();
      this.emit();
    }
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

function readWords(storage: SpellStorage | null): string[] {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(WORDS_KEY) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter((word): word is string => typeof word === "string")
      : [];
  } catch {
    return [];
  }
}

function browserStorage(): SpellStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function startWorker(): SpellTransport | null {
  if (typeof Worker === "undefined") return null;
  try {
    return new Worker(new URL("./spell.worker.ts", import.meta.url), { type: "module" });
  } catch {
    return null;
  }
}

let shared: SpellService | null = null;

/** One dictionary per page, however many editors are open. */
export function spellService(): SpellService {
  shared ??= new SpellService(startWorker, browserStorage());
  return shared;
}

/** Whether spelling suggestions are on. On unless switched off. */
export function spellingEnabled(): boolean {
  try {
    return browserStorage()?.getItem(ENABLED_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSpellingEnabled(enabled: boolean): void {
  try {
    browserStorage()?.setItem(ENABLED_KEY, enabled ? "on" : "off");
  } catch {
    // Blocked storage: the switch holds until reload.
  }
}

/**
 * The bridge the editors draw underlines from.
 *
 * A new object each time the dictionary answers, which is how the editors
 * know to repaint.
 */
export function useSpelling(enabled: boolean): SpellBridge | undefined {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    return spellService().subscribe(() => setVersion((value) => value + 1));
  }, [enabled]);

  return useMemo<SpellBridge | undefined>(() => {
    if (!enabled || typeof window === "undefined") return undefined;
    const service = spellService();
    return {
      enabled: true,
      version,
      check: (word) => service.check(word),
      request: (words) => service.request(words),
      suggest: (word) => service.suggest(word),
      learn: (word) => service.learn(word),
      ignore: (word) => service.ignore(word),
    };
  }, [enabled, version]);
}
