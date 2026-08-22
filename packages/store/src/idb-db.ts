import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { LocalAsset, Note, PendingChange, TreeNode, Workspace } from "@forkleaf/types";
import type { LocalDatabase } from "./ports";

/**
 * IndexedDB-backed storage — the reason ForkLeaf works on a plane.
 *
 * Notes are written here first and pushed to GitHub afterwards, so a dropped
 * connection, a closed tab, or a dead battery costs nothing.
 */

interface ForkLeafSchema extends DBSchema {
  notes: {
    key: string;
    value: Note;
    indexes: { "by-workspace": string };
  };
  workspaces: {
    key: string;
    value: Workspace;
  };
  queue: {
    key: string;
    value: PendingChange;
    indexes: { "by-workspace": string };
  };
  trees: {
    key: string;
    value: { workspaceId: string; tree: TreeNode[] };
  };
  assets: {
    key: string;
    value: LocalAsset;
    indexes: { "by-workspace": string };
  };
  meta: {
    key: string;
    value: { key: string; value: unknown };
  };
}

const DB_NAME = "forkleaf";
/**
 * Bumped to 2 for the `assets` store, and to 3 so `upgrade` runs once more and
 * repairs any database whose stores and indexes have come apart.
 *
 * Every store is created behind a `contains` check rather than in a
 * version-numbered branch, so an existing database gains the new store and
 * keeps everything already in it.
 */
const DB_VERSION = 3;

/**
 * How long to wait for the database to open before giving up on it.
 *
 * An `open` that is blocked by another tab never rejects on its own, so
 * without a ceiling the loading screen is permanent.
 */
const OPEN_TIMEOUT_MS = 8_000;

export class IndexedDbDatabase implements LocalDatabase {
  readonly persistent = true;

  private dbPromise: Promise<IDBPDatabase<ForkLeafSchema>> | null = null;
  private handle: IDBPDatabase<ForkLeafSchema> | null = null;

  private get db(): Promise<IDBPDatabase<ForkLeafSchema>> {
    // Opened lazily so importing this module during SSR does not touch
    // `indexedDB`, which only exists in the browser.
    this.dbPromise ??= this.open();
    return this.dbPromise;
  }

  /**
   * Opens the database, or fails in a bounded amount of time.
   *
   * Every one of these callbacks exists because the browser can leave an open
   * request pending forever, and a pending request here is a ForkLeaf that
   * never finishes starting.
   */
  private async open(): Promise<IDBPDatabase<ForkLeafSchema>> {
    try {
      const db = await withTimeout(
        openDB<ForkLeafSchema>(DB_NAME, DB_VERSION, {
          /**
           * Brings the database up to the shape above, whatever shape it is in
           * now.
           *
           * Stores *and* their indexes are both checked, because the two can
           * come apart: an upgrade transaction that aborts halfway leaves a
           * store with no index behind, and every later read of it fails with
           * "the specified index was not found" — permanently, since the
           * store-only guard sees the store and skips it.
           */
          upgrade(db, _oldVersion, _newVersion, tx) {
            const store = <
              Name extends "notes" | "queue" | "assets" | "workspaces" | "trees" | "meta",
            >(
              name: Name,
              keyPath: string,
            ) =>
              db.objectStoreNames.contains(name)
                ? tx.objectStore(name)
                : db.createObjectStore(name, { keyPath });

            for (const name of ["notes", "queue", "assets"] as const) {
              const created = store(name, "id");
              if (!created.indexNames.contains("by-workspace")) {
                created.createIndex("by-workspace", "workspaceId");
              }
            }
            store("workspaces", "id");
            store("trees", "workspaceId");
            store("meta", "key");
          },
          /**
           * Another tab has this database open at an older version and is in
           * the way of our upgrade. It will get `blocking` and close, so this
           * is only worth reporting — the timeout below is what stops us
           * waiting on a tab that never answers.
           */
          blocked: (currentVersion, blockedVersion) => {
            console.warn(
              `[forkleaf] waiting on another ForkLeaf tab holding the database at v${currentVersion} (wanted v${blockedVersion}).`,
            );
          },
          /**
           * We are the older connection standing in the way of another tab's
           * upgrade. Close, so that tab can proceed; the next read reopens at
           * the new version instead of deadlocking both tabs.
           *
           * Without this, an old tab left open across a `DB_VERSION` bump —
           * or a "clear site data" — hangs every other tab on the loading
           * screen indefinitely.
           */
          blocking: () => this.release(),
          /** The browser dropped the connection; reopen on the next read. */
          terminated: () => this.release(),
        }),
        OPEN_TIMEOUT_MS,
        "Local storage did not open. Another ForkLeaf tab may be holding it — close the other tabs and reload.",
      );

      this.handle = db;
      return db;
    } catch (error) {
      // Not cached as a rejection: closing the other tab should be enough to
      // make the next attempt work.
      this.dbPromise = null;
      throw error;
    }
  }

  /** Drops this tab's connection so another one can upgrade or delete. */
  private release(): void {
    this.handle?.close();
    this.handle = null;
    this.dbPromise = null;
  }

  /** Resolves once the database is open, rejecting if it cannot be. */
  async ready(): Promise<void> {
    await this.db;
  }

  async getNote(id: string): Promise<Note | undefined> {
    return (await this.db).get("notes", id);
  }

  async putNote(note: Note): Promise<void> {
    await (await this.db).put("notes", note);
  }

  async deleteNote(id: string): Promise<void> {
    await (await this.db).delete("notes", id);
  }

  async listNotes(workspaceId: string): Promise<Note[]> {
    return (await this.db).getAllFromIndex("notes", "by-workspace", workspaceId);
  }

  async getWorkspace(id: string): Promise<Workspace | undefined> {
    return (await this.db).get("workspaces", id);
  }

  async putWorkspace(workspace: Workspace): Promise<void> {
    await (await this.db).put("workspaces", workspace);
  }

  async deleteWorkspace(id: string): Promise<void> {
    const db = await this.db;
    // One transaction across every affected store, so disconnecting a
    // workspace can never leave orphaned notes or queued changes behind.
    const tx = db.transaction(["workspaces", "notes", "queue", "trees"], "readwrite");

    await tx.objectStore("workspaces").delete(id);
    await tx.objectStore("trees").delete(id);

    for (const key of await tx.objectStore("notes").index("by-workspace").getAllKeys(id)) {
      await tx.objectStore("notes").delete(key);
    }
    for (const key of await tx.objectStore("queue").index("by-workspace").getAllKeys(id)) {
      await tx.objectStore("queue").delete(key);
    }

    await tx.done;
  }

  async listWorkspaces(): Promise<Workspace[]> {
    return (await this.db).getAll("workspaces");
  }

  async listQueue(workspaceId?: string): Promise<PendingChange[]> {
    const db = await this.db;
    const items = workspaceId
      ? await db.getAllFromIndex("queue", "by-workspace", workspaceId)
      : await db.getAll("queue");
    // Preserve the order the user actually made the changes in.
    return items.sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
  }

  async putQueueItem(item: PendingChange): Promise<void> {
    await (await this.db).put("queue", item);
  }

  async deleteQueueItem(id: string): Promise<void> {
    await (await this.db).delete("queue", id);
  }

  async getTreeCache(workspaceId: string): Promise<TreeNode[] | undefined> {
    const row = await (await this.db).get("trees", workspaceId);
    return row?.tree;
  }

  async putTreeCache(workspaceId: string, tree: TreeNode[]): Promise<void> {
    await (await this.db).put("trees", { workspaceId, tree });
  }

  async getAsset(id: string): Promise<LocalAsset | undefined> {
    return (await this.db).get("assets", id);
  }

  async putAsset(asset: LocalAsset): Promise<void> {
    await (await this.db).put("assets", asset);
  }

  async deleteAsset(id: string): Promise<void> {
    await (await this.db).delete("assets", id);
  }

  async listAssets(workspaceId: string): Promise<LocalAsset[]> {
    return (await this.db).getAllFromIndex("assets", "by-workspace", workspaceId);
  }

  async getMeta<T>(key: string): Promise<T | undefined> {
    const row = await (await this.db).get("meta", key);
    return row?.value as T | undefined;
  }

  async putMeta<T>(key: string, value: T): Promise<void> {
    await (await this.db).put("meta", { key, value });
  }
}

/** Rejects if `promise` has not settled within `ms`. */
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    }),
  ]).finally(() => clearTimeout(timer)) as Promise<T>;
}

/**
 * True when this runtime can actually persist to IndexedDB.
 *
 * Reading the global is inside a `try` because a sandboxed iframe, and Firefox
 * with cookies fully blocked, throw a `SecurityError` on the property access
 * itself rather than leaving it undefined.
 */
export function indexedDbAvailable(): boolean {
  try {
    return typeof indexedDB !== "undefined" && indexedDB !== null;
  } catch {
    return false;
  }
}

/**
 * Picks IndexedDB in the browser and an in-memory store everywhere else.
 *
 * The database is opened here rather than on first read, so a browser that
 * refuses IndexedDB — private windows, blocked storage, a tab stuck holding an
 * older version — costs a few seconds and a degraded session instead of a
 * loading screen that never resolves. Callers can tell the two apart with
 * `persistent`, and should say so in the UI: nothing written to a
 * `MemoryDatabase` survives a reload.
 */
export async function createLocalDatabase(): Promise<LocalDatabase> {
  if (indexedDbAvailable()) {
    const db = new IndexedDbDatabase();
    try {
      await db.ready();
      return db;
    } catch (error) {
      console.warn("[forkleaf] falling back to in-memory storage:", error);
    }
  }
  const { MemoryDatabase } = await import("./memory-db");
  return new MemoryDatabase();
}
