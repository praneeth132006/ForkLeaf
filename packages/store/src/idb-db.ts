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
 * Bumped to 2 for the `assets` store.
 *
 * Every store is created behind a `contains` check rather than in a
 * version-numbered branch, so an existing database gains the new store and
 * keeps everything already in it.
 *
 * Worth being reluctant about the next bump: an upgrade needs every other tab
 * to let go of the database first, so bumping this is the one change that can
 * make a second tab briefly unable to open it. Only bump it when a new store
 * actually requires it.
 */
const DB_VERSION = 2;

/**
 * How long to wait for the database to open before giving up on it.
 *
 * An `open` that is blocked by another tab never rejects on its own, so
 * without a ceiling the loading screen is permanent.
 */
const OPEN_TIMEOUT_MS = 8_000;

/** Every store the code below reads from. Checked when no upgrade can run. */
const REQUIRED_STORES = ["notes", "workspaces", "queue", "trees", "assets", "meta"] as const;

export class IndexedDbDatabase implements LocalDatabase {
  readonly persistent = true;

  /** Overridable only so tests do not have to wait out the real ceiling. */
  constructor(private readonly openTimeoutMs = OPEN_TIMEOUT_MS) {}

  private dbPromise: Promise<IDBPDatabase<ForkLeafSchema>> | null = null;
  private handle: IDBPDatabase<ForkLeafSchema> | null = null;
  /** Set when another tab was holding the database during the last open. */
  private blockedByAnotherTab = false;

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
      let db: IDBPDatabase<ForkLeafSchema>;
      try {
        db = await this.openAt(DB_VERSION);
      } catch (error) {
        // A database written by a newer build of ForkLeaf than this one.
        // IndexedDB refuses a downgrade outright, and there is no way to talk
        // it round — so take the database as it stands instead.
        //
        // This is survivable only because the schema is additive: every store
        // this version knows about still exists in a later one. It matters
        // because the alternative is a browser that can never open its own
        // notes again — one tab left on a newer deploy, or a rolled-back
        // release, and the data is stranded behind an error.
        if (!isVersionError(error)) throw error;
        console.warn("[forkleaf] local storage is newer than this build; opening it as it is.");
        db = await this.openExisting();
      }

      this.handle = db;
      return db;
    } catch (error) {
      // Not cached as a rejection: closing the other tab should be enough to
      // make the next attempt work.
      this.dbPromise = null;
      throw error;
    }
  }

  /** Opens — and if need be upgrades — the database at a known version. */
  private openAt(version: number): Promise<IDBPDatabase<ForkLeafSchema>> {
    return withTimeout(
      openDB<ForkLeafSchema>(DB_NAME, version, {
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
          this.blockedByAnotherTab = true;
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
      this.openTimeoutMs,
      "Local storage did not open. Another ForkLeaf tab may be holding it — close the other tabs and reload.",
    );
  }

  /**
   * Opens whatever version already exists, without asking for one.
   *
   * No `upgrade` runs, so this cannot create anything missing — which is why
   * the stores are checked afterwards rather than assumed.
   */
  private async openExisting(): Promise<IDBPDatabase<ForkLeafSchema>> {
    const db = await withTimeout(
      openDB<ForkLeafSchema>(DB_NAME, undefined, {
        blocking: () => this.release(),
        terminated: () => this.release(),
      }),
      this.openTimeoutMs,
      "Local storage did not open.",
    );

    const missing = REQUIRED_STORES.filter((name) => !db.objectStoreNames.contains(name));
    if (missing.length > 0) {
      db.close();
      throw new Error(`Local storage is missing the ${missing.join(", ")} store.`);
    }

    return db;
  }

  /** Drops this tab's connection so another one can upgrade or delete. */
  private release(): void {
    this.handle?.close();
    this.handle = null;
    this.dbPromise = null;
  }

  /** Resolves once the database is open, rejecting if it cannot be. */
  async ready(): Promise<void> {
    this.blockedByAnotherTab = false;
    await this.db;
  }

  /**
   * Whether the last failed open was another tab's fault.
   *
   * The two failures want opposite handling: a browser with no IndexedDB is
   * permanent and the best we can do is say so, while another tab holding the
   * database clears the moment that tab goes away — and is worth waiting for,
   * because the alternative is writing notes into a store that is thrown away.
   */
  get blocked(): boolean {
    return this.blockedByAnotherTab;
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

/**
 * True for the browser's refusal to open a database at a lower version.
 *
 * Matched by name rather than by instance: this is a `DOMException` in the
 * browser and a plain error in the polyfills the tests run against.
 */
function isVersionError(error: unknown): boolean {
  return error instanceof Error && error.name === "VersionError";
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
 * Why the store you were handed is the store you were handed.
 *
 * - `ready` — real, durable IndexedDB.
 * - `blocked` — another tab is holding the database. Temporary: it clears when
 *   that tab closes, so the caller should offer to wait rather than pretend.
 * - `unavailable` — this browser will not give us IndexedDB at all. Permanent
 *   for the session; all the caller can do is say so.
 */
export type LocalDatabaseStatus = "ready" | "blocked" | "unavailable";

export interface OpenedLocalDatabase {
  db: LocalDatabase;
  status: LocalDatabaseStatus;
}

/**
 * Opens local storage, and says what happened.
 *
 * The database is opened here rather than on first read, so a browser that
 * refuses IndexedDB costs a few seconds and a degraded session instead of a
 * loading screen that never resolves. The fallback is a `MemoryDatabase`, so
 * callers always get something usable — but nothing written to it survives the
 * tab, which is why `status` exists and why no caller should ignore it.
 */
export async function openLocalDatabase(options?: {
  /** Overridable only so tests do not have to wait out the real ceiling. */
  timeoutMs?: number;
}): Promise<OpenedLocalDatabase> {
  if (indexedDbAvailable()) {
    const db = new IndexedDbDatabase(options?.timeoutMs);
    try {
      await db.ready();
      return { db, status: "ready" };
    } catch (error) {
      console.warn("[forkleaf] falling back to in-memory storage:", error);
      const { MemoryDatabase } = await import("./memory-db");
      return { db: new MemoryDatabase(), status: db.blocked ? "blocked" : "unavailable" };
    }
  }

  const { MemoryDatabase } = await import("./memory-db");
  return { db: new MemoryDatabase(), status: "unavailable" };
}

/** `openLocalDatabase` for callers that have nothing useful to do with `status`. */
export async function createLocalDatabase(): Promise<LocalDatabase> {
  return (await openLocalDatabase()).db;
}
