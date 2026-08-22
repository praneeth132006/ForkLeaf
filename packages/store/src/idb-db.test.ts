import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// `/auto` rather than the bare import: `idb` reaches for `IDBRequest` and the
// other IDB constructors as globals, not just `indexedDB`.
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { openLocalDatabase, indexedDbAvailable } from "./idb-db";

/**
 * The boot path, not the storage itself.
 *
 * ForkLeaf used to hand back an `IndexedDbDatabase` without ever checking that
 * the database opened, and `openDB` never rejects while another tab holds an
 * older version — it fires no event at all. So a tab left open across a
 * `DB_VERSION` bump hung every other tab on "Starting ForkLeaf…" forever.
 *
 * These tests use a real IndexedDB implementation rather than a hand-written
 * stub, because the thing being pinned down is precisely the browser's own
 * locking behaviour: a stub would only assert what the stub does.
 */

const DB_NAME = "forkleaf";
/** Well under the real ceiling, so a blocked open does not stall the suite. */
const TIMEOUT = 50;

const original = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");

/** Replaces the global, or removes it when given nothing. */
function stubIndexedDb(value?: unknown) {
  if (value === undefined) {
    delete (globalThis as { indexedDB?: unknown }).indexedDB;
    return;
  }
  Object.defineProperty(globalThis, "indexedDB", { value, configurable: true, writable: true });
}

/** Opens a raw connection and holds it, ignoring `versionchange` — a stale tab. */
function holdStaleConnection(version: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, version);
    request.onupgradeneeded = () => request.result.createObjectStore("notes", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

beforeEach(() => {
  // A fresh factory per test: these share one database name on purpose.
  stubIndexedDb(new IDBFactory());
});

afterEach(() => {
  if (original) Object.defineProperty(globalThis, "indexedDB", original);
  else delete (globalThis as { indexedDB?: unknown }).indexedDB;
  vi.restoreAllMocks();
});

describe("indexedDbAvailable", () => {
  it("is false when reading the global throws, as in a sandboxed frame", () => {
    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      get() {
        throw new Error("The operation is insecure.");
      },
    });

    expect(indexedDbAvailable()).toBe(false);
  });
});

describe("openLocalDatabase", () => {
  it("opens a usable, durable database", async () => {
    const { db, status } = await openLocalDatabase({ timeoutMs: TIMEOUT });

    expect(status).toBe("ready");
    expect(db.persistent).toBe(true);

    // Exercises a store and its index, which is what the upgrade has to get
    // right for every later read to work.
    await db.putNote({
      id: "w::a.md",
      workspaceId: "w",
      path: "a.md",
      content: "# hello",
      frontmatter: {},
      baseSha: null,
      updatedAt: null,
      dirty: false,
    });
    expect(await db.listNotes("w")).toHaveLength(1);
  });

  it("reports `unavailable` and a usable store when there is no IndexedDB", async () => {
    stubIndexedDb();

    const { db, status } = await openLocalDatabase({ timeoutMs: TIMEOUT });

    expect(status).toBe("unavailable");
    expect(db.persistent).toBe(false);
    // Still usable, so nothing downstream has to special-case a null database.
    await db.putMeta("hello", "world");
    expect(await db.getMeta("hello")).toBe("world");
  });

  /**
   * The bug, reproduced: a tab from before the `assets` store went in is
   * holding v1, and this tab wants v2. Before the fix that wait never ended.
   */
  it("reports `blocked` rather than hanging when another tab holds an older version", async () => {
    const stale = await holdStaleConnection(1);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const { db, status } = await openLocalDatabase({ timeoutMs: TIMEOUT });

    expect(status).toBe("blocked");
    // Distinguishable from `unavailable`, because the two want opposite
    // handling: this one clears when the other tab goes away.
    expect(db.persistent).toBe(false);

    stale.close();
  });

  /**
   * A database written by a newer build than this one.
   *
   * IndexedDB refuses to open at a lower version, full stop, so without a
   * second attempt one newer deploy — or one rollback — strands every note in
   * that browser behind a `VersionError` forever.
   */
  it("opens a database left behind by a newer version of ForkLeaf", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});

    // Same shape, higher number: what a later release would leave behind.
    const ahead = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 99);
      request.onupgradeneeded = () => {
        const db = request.result;
        for (const name of ["notes", "queue", "assets"]) {
          db.createObjectStore(name, { keyPath: "id" }).createIndex("by-workspace", "workspaceId");
        }
        db.createObjectStore("workspaces", { keyPath: "id" });
        db.createObjectStore("trees", { keyPath: "workspaceId" });
        db.createObjectStore("meta", { keyPath: "key" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    ahead.close();

    const { db, status } = await openLocalDatabase({ timeoutMs: TIMEOUT });

    expect(status).toBe("ready");
    await db.putMeta("hello", "world");
    expect(await db.getMeta("hello")).toBe("world");
  });

  /**
   * The other half: we must not be the tab doing the blocking. Our connection
   * closes on `versionchange` so another tab's upgrade goes through.
   */
  it("gives up its connection so another tab can upgrade", async () => {
    const { status } = await openLocalDatabase({ timeoutMs: TIMEOUT });
    expect(status).toBe("ready");

    const upgraded = await new Promise<string>((resolve) => {
      const request = indexedDB.open(DB_NAME, 99);
      request.onsuccess = () => {
        request.result.close();
        resolve("upgraded");
      };
      request.onblocked = () => resolve("blocked");
      request.onerror = () => resolve("error");
      setTimeout(() => resolve("hung"), 2_000);
    });

    expect(upgraded).toBe("upgraded");
  });
});
