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
 */
const DB_VERSION = 2;

export class IndexedDbDatabase implements LocalDatabase {
  private dbPromise: Promise<IDBPDatabase<ForkLeafSchema>> | null = null;

  private get db(): Promise<IDBPDatabase<ForkLeafSchema>> {
    // Opened lazily so importing this module during SSR does not touch
    // `indexedDB`, which only exists in the browser.
    this.dbPromise ??= openDB<ForkLeafSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("notes")) {
          const notes = db.createObjectStore("notes", { keyPath: "id" });
          notes.createIndex("by-workspace", "workspaceId");
        }
        if (!db.objectStoreNames.contains("workspaces")) {
          db.createObjectStore("workspaces", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("queue")) {
          const queue = db.createObjectStore("queue", { keyPath: "id" });
          queue.createIndex("by-workspace", "workspaceId");
        }
        if (!db.objectStoreNames.contains("trees")) {
          db.createObjectStore("trees", { keyPath: "workspaceId" });
        }
        if (!db.objectStoreNames.contains("assets")) {
          const assets = db.createObjectStore("assets", { keyPath: "id" });
          assets.createIndex("by-workspace", "workspaceId");
        }
        if (!db.objectStoreNames.contains("meta")) {
          db.createObjectStore("meta", { keyPath: "key" });
        }
      },
    });
    return this.dbPromise;
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

/** True when this runtime can actually persist to IndexedDB. */
export function indexedDbAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

/** Picks IndexedDB in the browser and an in-memory store everywhere else. */
export async function createLocalDatabase(): Promise<LocalDatabase> {
  if (indexedDbAvailable()) return new IndexedDbDatabase();
  const { MemoryDatabase } = await import("./memory-db");
  return new MemoryDatabase();
}
