import type {
  Conflict,
  ConflictResolution,
  Note,
  PendingChange,
  SyncState,
  SyncStatus,
} from "@forkleaf/types";
import type { LocalDatabase, RemoteGateway } from "./ports";
import { coalesce, describeChanges, changeId } from "./queue";

export interface SyncEngineOptions {
  db: LocalDatabase;
  gateway: RemoteGateway;
  /** Quiet period after the last keystroke before a push is attempted. */
  debounceMs?: number;
  /** How long a commit stays eligible to absorb further edits. */
  squashWindowMs?: number;
  /** Injectable clock and timers, so tests do not have to wait in real time. */
  now?: () => Date;
  setTimeout?: (fn: () => void, ms: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
  /** Reports whether the device currently has a network connection. */
  isOnline?: () => boolean;
}

type Listener = (state: SyncState) => void;

const DEFAULT_DEBOUNCE_MS = 4000;
const DEFAULT_SQUASH_WINDOW_MS = 5 * 60_000;
const MAX_ATTEMPTS = 5;

/**
 * Local-first sync.
 *
 * Every edit is written to IndexedDB immediately and acknowledged instantly, so
 * the editor never waits on the network. A separate loop drains the change
 * queue to GitHub: debounced, coalesced, batched into one commit, and squashed
 * into the previous commit when that commit is recent and ours.
 *
 * Offline is not a special case — it is just a push that fails and gets retried,
 * which is why closing the laptop mid-sentence loses nothing.
 */
export class SyncEngine {
  private readonly db: LocalDatabase;
  private readonly gateway: RemoteGateway;
  private readonly debounceMs: number;
  private readonly squashWindowMs: number;
  private readonly now: () => Date;
  private readonly schedule: (fn: () => void, ms: number) => unknown;
  private readonly cancel: (handle: unknown) => void;
  private readonly isOnline: () => boolean;

  private queue: PendingChange[] = [];
  private conflicts: Conflict[] = [];
  private timer: unknown = null;
  private flushing = false;
  /** Set when an edit lands mid-flush, so we push again straight after. */
  private dirtyDuringFlush = false;
  private status: SyncStatus = "idle";
  private lastSyncedAt: string | null = null;
  private lastError: string | null = null;
  private readonly listeners = new Set<Listener>();

  constructor(options: SyncEngineOptions) {
    this.db = options.db;
    this.gateway = options.gateway;
    this.debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.squashWindowMs = options.squashWindowMs ?? DEFAULT_SQUASH_WINDOW_MS;
    this.now = options.now ?? (() => new Date());
    this.schedule = options.setTimeout ?? ((fn, ms) => setTimeout(fn, ms));
    this.cancel = options.clearTimeout ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
    this.isOnline = options.isOnline ?? defaultIsOnline;
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  /** Reloads the queue left over from a previous session. */
  async start(): Promise<void> {
    this.queue = await this.db.listQueue();
    if (this.queue.length > 0) this.scheduleFlush();
    this.emit();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  get state(): SyncState {
    return {
      status: this.status,
      pendingCount: this.queue.length,
      lastSyncedAt: this.lastSyncedAt,
      lastError: this.lastError,
      conflicts: this.conflicts,
    };
  }

  // ─── Recording changes ────────────────────────────────────────────────────

  /**
   * Records a note edit: persisted locally now, pushed later.
   * Returns as soon as the local write completes.
   */
  async recordUpsert(note: Note, fileContent: string): Promise<void> {
    await this.db.putNote({ ...note, dirty: true, updatedAt: this.now().toISOString() });

    this.queue = coalesce(this.queue, {
      workspaceId: note.workspaceId,
      path: note.path,
      op: "upsert",
      content: fileContent,
      baseSha: note.baseSha,
      now: this.now().toISOString(),
    });

    await this.persistQueue();
    this.scheduleFlush();
  }

  async recordDelete(note: Note): Promise<void> {
    await this.db.deleteNote(note.id);

    this.queue = coalesce(this.queue, {
      workspaceId: note.workspaceId,
      path: note.path,
      op: "delete",
      baseSha: note.baseSha,
      now: this.now().toISOString(),
    });

    await this.persistQueue();
    this.scheduleFlush();
  }

  async recordRename(note: Note, toPath: string, fileContent: string): Promise<void> {
    await this.db.deleteNote(note.id);
    await this.db.putNote({
      ...note,
      id: `${note.workspaceId}::${toPath}`,
      path: toPath,
      dirty: true,
      updatedAt: this.now().toISOString(),
    });

    this.queue = coalesce(this.queue, {
      workspaceId: note.workspaceId,
      path: note.path,
      op: "rename",
      toPath,
      content: fileContent,
      baseSha: note.baseSha,
      now: this.now().toISOString(),
    });

    await this.persistQueue();
    this.scheduleFlush();
  }

  // ─── Flushing ─────────────────────────────────────────────────────────────

  private scheduleFlush(): void {
    if (this.timer !== null) this.cancel(this.timer);

    this.setStatus(this.queue.length > 0 ? "pending" : "idle");
    this.timer = this.schedule(() => {
      this.timer = null;
      void this.flush();
    }, this.debounceMs);
  }

  /** Pushes everything pending right now, bypassing the debounce. */
  async flushNow(): Promise<void> {
    if (this.timer !== null) {
      this.cancel(this.timer);
      this.timer = null;
    }
    await this.flush();
  }

  private async flush(): Promise<void> {
    // A single in-flight push at a time: concurrent commits to one branch would
    // race on the ref and defeat squashing.
    if (this.flushing) {
      this.dirtyDuringFlush = true;
      return;
    }
    if (this.queue.length === 0) {
      this.setStatus("idle");
      return;
    }
    if (!this.isOnline()) {
      this.setStatus("offline");
      return;
    }

    this.flushing = true;
    this.dirtyDuringFlush = false;
    this.setStatus("syncing");

    try {
      // One commit per workspace: a batch cannot span two repositories.
      for (const [workspaceId, changes] of groupByWorkspace(this.queue)) {
        await this.flushWorkspace(workspaceId, changes);
      }

      this.lastSyncedAt = this.now().toISOString();
      this.lastError = null;
      this.setStatus(
        this.conflicts.length > 0 ? "conflict" : this.queue.length > 0 ? "pending" : "idle",
      );
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      this.setStatus(this.isOnline() ? "error" : "offline");
    } finally {
      this.flushing = false;
      // Edits that arrived mid-push still need their own commit.
      if (this.dirtyDuringFlush && this.queue.length > 0) this.scheduleFlush();
    }
  }

  private async flushWorkspace(workspaceId: string, changes: PendingChange[]): Promise<void> {
    const safe = await this.filterConflicts(workspaceId, changes);
    if (safe.length === 0) return;

    let result;
    try {
      result = await this.gateway.commit({
        workspaceId,
        message: describeChanges(safe),
        squashWindowMs: this.squashWindowMs,
        changes: safe.map((c) => ({
          op: c.op,
          path: c.path,
          ...(c.toPath !== undefined ? { toPath: c.toPath } : {}),
          ...(c.content !== undefined ? { content: c.content } : {}),
        })),
      });
    } catch (err) {
      // Count the attempt so a change that can never succeed (a deleted repo,
      // a revoked token) eventually stops blocking everything behind it.
      for (const change of safe) {
        change.attempts += 1;
        if (change.attempts >= MAX_ATTEMPTS) {
          this.queue = this.queue.filter((c) => c.id !== change.id);
          await this.db.deleteQueueItem(change.id);
        } else {
          await this.db.putQueueItem(change);
        }
      }
      throw err;
    }

    // Committed successfully: clear these from the queue and record the new
    // blob SHAs so the next edit knows what it is based on.
    for (const change of safe) {
      this.queue = this.queue.filter((c) => c.id !== change.id);
      await this.db.deleteQueueItem(change.id);

      const path = change.op === "rename" ? (change.toPath ?? change.path) : change.path;
      const newSha = result.blobShas[path];
      if (change.op === "delete" || !newSha) continue;

      const note = await this.db.getNote(`${workspaceId}::${path}`);
      if (note) await this.db.putNote({ ...note, baseSha: newSha, dirty: false });
    }
  }

  /**
   * Drops changes whose remote file moved on since we last read it, recording a
   * conflict for the user instead of overwriting somebody's work.
   */
  private async filterConflicts(
    workspaceId: string,
    changes: PendingChange[],
  ): Promise<PendingChange[]> {
    const safe: PendingChange[] = [];

    for (const change of changes) {
      // A brand-new note has nothing to conflict with.
      if (change.baseSha === null) {
        safe.push(change);
        continue;
      }

      const remote = await this.gateway.readFile(workspaceId, change.path);

      // Remote deleted while we edited: pushing recreates it, which is the
      // friendlier outcome and is trivially undoable in git.
      if (!remote) {
        safe.push(change);
        continue;
      }

      if (remote.sha === change.baseSha) {
        safe.push(change);
        continue;
      }

      this.recordConflict({
        workspaceId,
        path: change.path,
        localContent: change.content ?? "",
        remoteContent: remote.content,
        remoteSha: remote.sha,
        detectedAt: this.now().toISOString(),
      });

      // Hold the change in the queue; resolving the conflict releases it.
      await this.db.putQueueItem(change);
    }

    return safe;
  }

  private recordConflict(conflict: Conflict): void {
    this.conflicts = [
      ...this.conflicts.filter(
        (c) => !(c.workspaceId === conflict.workspaceId && c.path === conflict.path),
      ),
      conflict,
    ];
    this.setStatus("conflict");
  }

  // ─── Conflict resolution ──────────────────────────────────────────────────

  /**
   * Applies the user's choice for a conflicted note.
   * - keep-local  rebases our edit onto the remote SHA and pushes it
   * - keep-remote discards our edit and adopts the remote copy
   * - keep-both   keeps the remote file and saves ours alongside it
   */
  async resolveConflict(
    workspaceId: string,
    path: string,
    resolution: ConflictResolution,
  ): Promise<void> {
    const conflict = this.conflicts.find((c) => c.workspaceId === workspaceId && c.path === path);
    if (!conflict) return;

    const id = changeId(workspaceId, path);
    const queued = this.queue.find((c) => c.id === id);

    switch (resolution) {
      case "keep-local":
        // Re-base onto the remote SHA so the next push is no longer a conflict.
        if (queued) {
          queued.baseSha = conflict.remoteSha;
          queued.attempts = 0;
          await this.db.putQueueItem(queued);
        }
        break;

      case "keep-remote": {
        this.queue = this.queue.filter((c) => c.id !== id);
        await this.db.deleteQueueItem(id);
        const note = await this.db.getNote(`${workspaceId}::${path}`);
        if (note) {
          await this.db.putNote({
            ...note,
            content: conflict.remoteContent,
            baseSha: conflict.remoteSha,
            dirty: false,
            updatedAt: this.now().toISOString(),
          });
        }
        break;
      }

      case "keep-both": {
        const forked = forkPath(path);
        if (queued) {
          this.queue = this.queue.filter((c) => c.id !== id);
          await this.db.deleteQueueItem(id);
          const copy: PendingChange = {
            ...queued,
            id: changeId(workspaceId, forked),
            path: forked,
            // A new file, so it can never conflict.
            baseSha: null,
            attempts: 0,
          };
          this.queue.push(copy);
          await this.db.putQueueItem(copy);
        }
        break;
      }
    }

    this.conflicts = this.conflicts.filter(
      (c) => !(c.workspaceId === workspaceId && c.path === path),
    );
    this.scheduleFlush();
  }

  // ─── Pulling ──────────────────────────────────────────────────────────────

  /**
   * Refreshes one note from GitHub. Local edits win: an unpushed change is
   * never silently overwritten by a pull.
   */
  async pullNote(workspaceId: string, path: string): Promise<Note | undefined> {
    const id = `${workspaceId}::${path}`;
    const local = await this.db.getNote(id);

    if (local?.dirty) return local;

    const remote = await this.gateway.readFile(workspaceId, path);
    if (!remote) return local;

    return { ...local, content: remote.content, baseSha: remote.sha } as Note;
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  private async persistQueue(): Promise<void> {
    const live = new Set(this.queue.map((c) => c.id));
    for (const stale of await this.db.listQueue()) {
      if (!live.has(stale.id)) await this.db.deleteQueueItem(stale.id);
    }
    for (const change of this.queue) {
      await this.db.putQueueItem(change);
    }
  }

  private setStatus(status: SyncStatus): void {
    if (this.status === status) {
      // Still emit: pendingCount may have moved even when the label did not.
      this.emit();
      return;
    }
    this.status = status;
    this.emit();
  }

  private emit(): void {
    const snapshot = this.state;
    for (const listener of this.listeners) listener(snapshot);
  }
}

/**
 * Node 21+ defines a global `navigator` that has no `onLine` property, so a
 * bare `navigator.onLine` check reads as `undefined` and would leave the engine
 * permanently "offline" outside a browser. Only trust the flag when it is
 * actually a boolean; assume connectivity otherwise and let a failed request be
 * the thing that tells us we are offline.
 */
function defaultIsOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return typeof navigator.onLine === "boolean" ? navigator.onLine : true;
}

function groupByWorkspace(queue: PendingChange[]): Map<string, PendingChange[]> {
  const groups = new Map<string, PendingChange[]>();
  for (const change of queue) {
    const bucket = groups.get(change.workspaceId);
    if (bucket) bucket.push(change);
    else groups.set(change.workspaceId, [change]);
  }
  return groups;
}

/** `notes/a.md` → `notes/a (local copy).md` */
function forkPath(path: string): string {
  const dot = path.lastIndexOf(".");
  if (dot <= path.lastIndexOf("/")) return `${path} (local copy)`;
  return `${path.slice(0, dot)} (local copy)${path.slice(dot)}`;
}
