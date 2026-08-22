import { afterEach, describe, expect, it, vi } from "vitest";
import { createLocalDatabase, indexedDbAvailable } from "./idb-db";

/**
 * The boot path, not the storage itself.
 *
 * ForkLeaf used to hand back an `IndexedDbDatabase` without ever checking that
 * the database opened, and `openDB` never rejects when another tab is holding
 * an older version — so a stale tab left open across a `DB_VERSION` bump hung
 * every other tab on "Starting ForkLeaf…" forever. These tests pin down the
 * two things that stop that: a bounded open, and a store that always comes
 * back so the app can boot and say what is wrong.
 */

const original = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");

afterEach(() => {
  if (original) Object.defineProperty(globalThis, "indexedDB", original);
  else delete (globalThis as { indexedDB?: unknown }).indexedDB;
  vi.restoreAllMocks();
});

/** Replaces the global with something `openDB` will use. */
function stubIndexedDb(value: unknown) {
  Object.defineProperty(globalThis, "indexedDB", {
    value,
    configurable: true,
    writable: true,
  });
}

describe("indexedDbAvailable", () => {
  it("is false when reading the global throws, as in a sandboxed frame", () => {
    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      get() {
        throw new DOMException("The operation is insecure.", "SecurityError");
      },
    });

    expect(indexedDbAvailable()).toBe(false);
  });
});

describe("createLocalDatabase", () => {
  it("falls back to a non-persistent store when there is no IndexedDB", async () => {
    delete (globalThis as { indexedDB?: unknown }).indexedDB;

    const db = await createLocalDatabase();

    expect(db.persistent).toBe(false);
    // Usable, so the editor still opens — just not durable.
    await db.putMeta("hello", "world");
    expect(await db.getMeta("hello")).toBe("world");
  });

  it("falls back rather than hanging when the open request never settles", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    // What a blocked upgrade looks like: a request that fires no event at all.
    stubIndexedDb({ open: () => ({ addEventListener() {}, removeEventListener() {} }) });

    const pending = createLocalDatabase();
    await vi.advanceTimersByTimeAsync(10_000);
    const db = await pending;
    vi.useRealTimers();

    expect(db.persistent).toBe(false);
    expect(console.warn).toHaveBeenCalled();
  });
});
