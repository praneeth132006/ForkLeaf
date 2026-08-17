import type { Note, PendingChange, TreeNode, Workspace } from "@mdnotion/types";
import type { LocalDatabase } from "./ports";

/**
 * In-memory LocalDatabase.
 *
 * Used by the test suite, and as the server-side fallback during SSR where
 * IndexedDB does not exist. Values are cloned on the way in and out so callers
 * cannot mutate stored state by holding on to a reference — matching how a real
 * IndexedDB behaves.
 */
export class MemoryDatabase implements LocalDatabase {
  private notes = new Map<string, Note>();
  private workspaces = new Map<string, Workspace>();
  private queue = new Map<string, PendingChange>();
  private trees = new Map<string, TreeNode[]>();
  private meta = new Map<string, unknown>();

  async getNote(id: string): Promise<Note | undefined> {
    return clone(this.notes.get(id));
  }

  async putNote(note: Note): Promise<void> {
    this.notes.set(note.id, clone(note)!);
  }

  async deleteNote(id: string): Promise<void> {
    this.notes.delete(id);
  }

  async listNotes(workspaceId: string): Promise<Note[]> {
    return [...this.notes.values()]
      .filter((n) => n.workspaceId === workspaceId)
      .map((n) => clone(n)!);
  }

  async getWorkspace(id: string): Promise<Workspace | undefined> {
    return clone(this.workspaces.get(id));
  }

  async putWorkspace(workspace: Workspace): Promise<void> {
    this.workspaces.set(workspace.id, clone(workspace)!);
  }

  async deleteWorkspace(id: string): Promise<void> {
    this.workspaces.delete(id);
    for (const [key, note] of this.notes) {
      if (note.workspaceId === id) this.notes.delete(key);
    }
    for (const [key, change] of this.queue) {
      if (change.workspaceId === id) this.queue.delete(key);
    }
    this.trees.delete(id);
  }

  async listWorkspaces(): Promise<Workspace[]> {
    return [...this.workspaces.values()].map((w) => clone(w)!);
  }

  async listQueue(workspaceId?: string): Promise<PendingChange[]> {
    const all = [...this.queue.values()].map((c) => clone(c)!);
    return workspaceId ? all.filter((c) => c.workspaceId === workspaceId) : all;
  }

  async putQueueItem(item: PendingChange): Promise<void> {
    this.queue.set(item.id, clone(item)!);
  }

  async deleteQueueItem(id: string): Promise<void> {
    this.queue.delete(id);
  }

  async getTreeCache(workspaceId: string): Promise<TreeNode[] | undefined> {
    return clone(this.trees.get(workspaceId));
  }

  async putTreeCache(workspaceId: string, tree: TreeNode[]): Promise<void> {
    this.trees.set(workspaceId, clone(tree)!);
  }

  async getMeta<T>(key: string): Promise<T | undefined> {
    return clone(this.meta.get(key)) as T | undefined;
  }

  async putMeta<T>(key: string, value: T): Promise<void> {
    this.meta.set(key, clone(value));
  }
}

function clone<T>(value: T): T | undefined {
  if (value === undefined) return undefined;
  return structuredClone(value);
}
