import type {
  Conflict,
  ConflictResolution,
  Note,
  PendingChange,
  SyncMode,
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
  /** How eagerly to push. Defaults to `auto`, the original behaviour. */
  mode?: SyncMode;
  /** Minutes between pushes in `interval` mode. */
  intervalMinutes?: number;
}

type Listener = (state: SyncState) => void;

const DEFAULT_DEBOUNCE_MS = 4000;
const DEFAULT_SQUASH_WINDOW_MS = 5 * 60_000;
const MAX_ATTEMPTS = 5;
/** Backoff between retries after a failed push: 5s, 10s, 20s … capped. */
const RETRY_BASE_MS = 5_000;
const RETRY_MAX_MS = 5 * 60_000;

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
  private mode: SyncMode;
  private intervalMinutes: number;
  /** Current backoff delay; zero when the last push succeeded. */
  private retryDelay = 0;
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
    this.mode = options.mode ?? "auto";
    this.intervalMinutes = options.intervalMinutes ?? 15;
  }

  /**
   * Changes how eagerly the engine pushes.
   *
   * Switching *to* auto or interval flushes what is already queued, so turning
   * automatic syncing back on does not leave yesterday's edits sitting there
   * waiting for the next keystroke to notice them.
   */
  setMode(mode: SyncMode, intervalMinutes?: number): void {
    this.mode = mode;
    if (intervalMinutes !== undefined) this.intervalMinutes = intervalMinutes;

    if (mode === "manual") {
      // Stop the pending timer: in manual mode nothing pushes unbidden.
      if (this.timer !== null) {
        this.cancel(this.timer);
        this.timer = null;
      }
      this.setStatus(this.queue.length > 0 ? "pending" : "idle");
      this.emit();
      return;
    }

    this.retryDelay = 0;
    if (this.queue.length > 0) this.scheduleFlush();
    this.emit();
  }

  get syncMode(): SyncMode {
    return this.mode;
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  /** Reloads the queue left over from a previous session. */
  async start(): Promise<void> {
    this.queue = await this.db.listQueue();
    this.emit();
  }

  /**
   * Re-queues local edits that have no queue entry to push them.
   *
   * This repairs damage rather than preventing it. An earlier version of this
   * engine deleted a change from the queue once it had failed five times, which
   * left the note marked dirty with nothing anywhere that would ever push it —
   * and the empty queue then reported "All changes saved". Fixing the discard
   * stops it happening again; it does nothing for the notes already stranded on
   * somebody's device, and those are the ones with writing in them.
   *
   * So every dirty note without a queue entry is queued again. Safe to run on
   * every load: a note that is genuinely in sync is not dirty, and one that is
   * already queued is skipped. Called per workspace, because the note store is
   * addressed that way.
   */
  async recoverStrandedEdits(
    workspaceId: string,
    serialize: (note: Note) => string,
  ): Promise<number> {
    const queued = new Set(
      this.queue
        .filter((change) => change.workspaceId === workspaceId)
        .map((change) => (change.op === "rename" ? (change.toPath ?? change.path) : change.path)),
    );

    let recovered = 0;

    for (const note of await this.db.listNotes(workspaceId)) {
      if (!note.dirty || queued.has(note.path)) continue;

      this.queue = coalesce(this.queue, {
        workspaceId,
        path: note.path,
        op: "upsert",
        content: serialize(note),
        baseSha: note.baseSha,
        now: this.now().toISOString(),
      });
      recovered += 1;
    }

    if (recovered > 0) {
      await this.persistQueue();
      this.scheduleFlush();
    }
    return recovered;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  get state(): SyncState {
    return {
      status: this.status,
      mode: this.mode,
      pendingCount: this.queue.length,
      blockedCount: this.blocked().length,
      lastSyncedAt: this.lastSyncedAt,
      lastError: this.lastError,
      conflicts: this.conflicts,
    };
  }

  /**
   * The unpushed changes for one workspace, or for all of them.
   *
   * A copy, not the live array: a caller that mutated what it was handed would
   * change what the engine is about to push, which is the last place a
   * surprise belongs.
   */
  pendingFor(workspaceId?: string): PendingChange[] {
    const changes = workspaceId
      ? this.queue.filter((change) => change.workspaceId === workspaceId)
      : this.queue;
    return changes.map((change) => ({ ...change }));
  }

  /**
   * Drops a workspace's queued changes because they have already been written
   * somewhere else.
   *
   * The propose-changes flow commits the queue straight onto a new branch —
   * it has to, since the branch is created from the base and would otherwise
   * hold nothing to open a pull request against. Leaving those changes queued
   * afterwards would push the same work a second time, to whichever branch the
   * workspace lands on next.
   *
   * Notes keep their `dirty` flag and their base SHA, so nothing about the
   * local copy is claimed to be in sync that is not. This drops the *intent to
   * push*, not the work.
   */
  async discardPending(workspaceId: string): Promise<void> {
    const dropped = this.queue.filter((change) => change.workspaceId === workspaceId);
    if (dropped.length === 0) return;

    this.queue = this.queue.filter((change) => change.workspaceId !== workspaceId);
    for (const change of dropped) await this.db.deleteQueueItem(change.id);

    this.setStatus(this.restingStatus());
    this.emit();
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
    // User activity: try promptly rather than inheriting a long backoff.
    this.retryDelay = 0;

    this.setStatus(this.restingStatus());

    // Manual mode queues and waits. The local write has already happened, so
    // nothing is at risk — the change simply does not leave the device until
    // the user says so.
    if (this.mode === "manual") return;

    const delay = this.mode === "interval" ? this.intervalMinutes * 60_000 : this.debounceMs;

    this.timer = this.schedule(() => {
      this.timer = null;
      void this.flush();
    }, delay);
  }

  /**
   * Pushes everything pending right now, bypassing the debounce.
   *
   * Un-parks first. This is somebody pressing "sync now", which is a direct
   * request to try the things that are not being tried — and a Sync Now that
   * pointedly skipped the changes that had failed would be the least useful
   * possible reading of the button.
   */
  async flushNow(): Promise<void> {
    if (this.timer !== null) {
      this.cancel(this.timer);
      this.timer = null;
    }
    await this.unpark();
    await this.flush();
  }

  private async flush(): Promise<void> {
    // A single in-flight push at a time: concurrent commits to one branch would
    // race on the ref and defeat squashing.
    if (this.flushing) {
      this.dirtyDuringFlush = true;
      return;
    }
    if (this.pushable().length === 0) {
      this.setStatus(this.restingStatus());
      return;
    }
    if (!this.isOnline()) {
      this.setStatus("offline");
      // Nothing else would wake us: keep asking until the connection is back.
      this.scheduleRetry();
      return;
    }

    this.flushing = true;
    this.dirtyDuringFlush = false;
    this.setStatus("syncing");

    try {
      // One commit per workspace: a batch cannot span two repositories.
      // Parked changes are skipped — they have already had their attempts and
      // retrying them on every flush would hold up everything behind them.
      for (const [workspaceId, changes] of groupByWorkspace(this.pushable())) {
        await this.flushWorkspace(workspaceId, changes);
      }

      this.lastSyncedAt = this.now().toISOString();
      this.lastError = null;
      this.retryDelay = 0;
      this.setStatus(this.restingStatus());
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      // "error" means a push failed and will be tried again by itself. Once
      // nothing is left that *will* be tried again, that reading is wrong and
      // the honest word is "blocked" — it has stopped, and it needs asking.
      const stalled = this.pushable().length === 0 && this.blocked().length > 0;
      this.setStatus(this.isOnline() ? (stalled ? "blocked" : "error") : "offline");
      // A failed push used to sit there until the user happened to type again,
      // which is why notes could stay unsynced indefinitely after one blip.
      this.scheduleRetry();
    } finally {
      this.flushing = false;
      // Edits that arrived mid-push still need their own commit.
      if (this.dirtyDuringFlush && this.queue.length > 0) this.scheduleFlush();
    }
  }

  /**
   * Queues another attempt after a failed or skipped push.
   *
   * Backs off so a repo that is gone, or a token that has been revoked, does not
   * hammer the API — but never gives up, because the alternative is a queue that
   * silently stops draining. `scheduleFlush` resets the delay, so any new edit
   * gets a prompt attempt rather than inheriting a long backoff.
   */
  private scheduleRetry(): void {
    if (this.pushable().length === 0) return;

    this.retryDelay = this.retryDelay ? Math.min(this.retryDelay * 2, RETRY_MAX_MS) : RETRY_BASE_MS;

    if (this.timer !== null) this.cancel(this.timer);
    this.timer = this.schedule(() => {
      this.timer = null;
      void this.flush();
    }, this.retryDelay);
  }

  /**
   * Pushes now, discarding any backoff.
   *
   * The app calls this when the browser reports the network is back, so
   * reconnecting syncs immediately instead of waiting out the current delay.
   */
  retryNow(): void {
    this.retryDelay = 0;
    // Asking again is exactly what a parked change is waiting for, so this
    // clears the parking. Without it "click to retry" would do nothing at all
    // for the changes that most need retrying.
    void this.unpark();
    if (this.queue.length > 0) this.scheduleFlush();
  }

  /** Puts every parked change back in line and gives it its attempts back. */
  private async unpark(): Promise<void> {
    const parked = this.blocked();
    if (parked.length === 0) return;

    for (const change of parked) {
      change.blocked = false;
      change.attempts = 0;
      delete change.lastError;
      await this.db.putQueueItem(change);
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
      // Count the attempt so a change that can never succeed — a deleted repo,
      // a revoked token — stops blocking everything queued behind it.
      //
      // Parked, never discarded. This used to delete the change from the queue
      // and from storage once it ran out of attempts, with nothing recorded and
      // nothing shown. The queue then went empty, the status went to "idle",
      // and the status bar said "All changes saved" about a note that had never
      // reached GitHub and now never would, because the only thing that knew
      // about it had been thrown away. Keeping it costs a row in IndexedDB;
      // dropping it costs somebody their writing.
      const message = err instanceof Error ? err.message : String(err);

      for (const change of safe) {
        change.attempts += 1;
        change.lastError = message;
        if (change.attempts >= MAX_ATTEMPTS) change.blocked = true;
        await this.db.putQueueItem(change);
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

  /**
   * What the status should be when nothing is in flight.
   *
   * An unresolved conflict outranks a pending queue. `scheduleFlush` used to
   * report "pending" unconditionally, so resolving one of two conflicts moved
   * the status off "conflict" while the second was still open — and since the
   * status bar is the only way back into the conflict dialog once it has been
   * dismissed, that left the remaining conflict with no route back to it.
   */
  private restingStatus(): SyncStatus {
    if (this.conflicts.length > 0) return "conflict";
    // Outranks "pending": a parked change is not waiting its turn, it has
    // stopped, and the one thing the status must never do is imply otherwise.
    if (this.blocked().length > 0) return "blocked";
    return this.queue.length > 0 ? "pending" : "idle";
  }

  /** Queued changes still eligible for an automatic push. */
  private pushable(): PendingChange[] {
    return this.queue.filter((change) => change.blocked !== true);
  }

  /** Queued changes that have run out of retries and are waiting to be asked. */
  private blocked(): PendingChange[] {
    return this.queue.filter((change) => change.blocked === true);
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
