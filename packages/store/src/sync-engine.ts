import type {
  Conflict,
  ConflictResolution,
  Note,
  PendingChange,
  SyncErrorCode,
  SyncMode,
  SyncState,
  SyncStatus,
} from "@forkleaf/types";
import type { LocalDatabase, RemoteGateway } from "./ports";
import { coalesce, describeChanges, changeId } from "./queue";
import { parseDocument } from "@forkleaf/markdown-engine";

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
 * The most we will put in one commit request.
 *
 * Not a rule of ours — the host in front of the API refuses a request body
 * over its own limit before any of our code sees it, and answers 413 with no
 * message of its own. That is what a pasted screenshot used to turn into: a
 * push that could never succeed, retried forever, explaining nothing, because
 * nothing on this side had checked the size before sending.
 *
 * So the size is checked here, where the queue can do something about it —
 * split the batch, and isolate a single change too big to ever send. Set well
 * under the 4.5 MB the platform allows, because base64 inflates by a third and
 * the JSON around it is not free.
 */
const MAX_REQUEST_BYTES = 3 * 1024 * 1024;

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
  private lastErrorDetail: string | null = null;
  private lastErrorCode: SyncErrorCode | null = null;
  private lastErrorAt: string | null = null;
  private failedAttempts = 0;
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
        .map((change) =>
          change.op === "rename" || change.op === "move"
            ? (change.toPath ?? change.path)
            : change.path,
        ),
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

  /**
   * Queues images that are on this device but never reached GitHub.
   *
   * The counterpart of `recoverStrandedEdits`, and it exists for the same
   * reason: for a long time images were posted straight to GitHub outside the
   * queue, so an upload that failed left the file on this device with nothing
   * anywhere that remembered it still had somewhere to be. The note pointing at
   * it synced regardless, which is how a repository ends up full of notes
   * referring to images it does not have.
   *
   * Runs when a workspace is opened, so those images heal themselves on the
   * next visit rather than needing anybody to know they are missing.
   */
  async recoverStrandedAssets(workspaceId: string): Promise<number> {
    const queued = new Set(
      this.queue
        .filter((change) => change.workspaceId === workspaceId)
        .map((change) => change.path),
    );

    let recovered = 0;

    for (const asset of await this.db.listAssets(workspaceId)) {
      if (asset.pushed || queued.has(asset.path)) continue;

      this.queue = coalesce(this.queue, {
        workspaceId,
        path: asset.path,
        op: "upsert",
        content: asset.data,
        encoding: "base64",
        baseSha: null,
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
      lastErrorDetail: this.lastErrorDetail,
      lastErrorCode: this.lastErrorCode,
      lastErrorAt: this.lastErrorAt,
      failedAttempts: this.failedAttempts,
      blockedChanges: this.blocked().map((change) => ({
        id: change.id,
        path:
          change.op === "rename" || change.op === "move"
            ? (change.toPath ?? change.path)
            : change.path,
        error: change.lastError ?? null,
      })),
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

  /**
   * Drops one stuck change, and the file behind it.
   *
   * The escape hatch for a change that can never be sent — a picture too big
   * for one request being the case that made this necessary. Everything else
   * the app could offer about such a change was advice: find the note it was
   * pasted into, find the image inside it, delete it by hand. That is not a
   * thing somebody can reasonably do when the note is one of hundreds and the
   * file is called `Pasted image 20260828.png`.
   *
   * Only removes what was queued to be pushed. A note keeps its text and stays
   * dirty, so nothing is claimed to be in sync that is not; an image that never
   * reached GitHub is deleted from this device too, because a local copy of a
   * file with nothing left to push it is exactly the orphan this app already
   * goes to some trouble to avoid.
   */
  async discardChange(id: string): Promise<void> {
    const change = this.queue.find((item) => item.id === id);
    if (!change) return;

    this.queue = this.queue.filter((item) => item.id !== id);
    await this.db.deleteQueueItem(id);

    const asset = await this.db.getAsset(`${change.workspaceId}::${change.path}`);
    if (asset && !asset.pushed) await this.db.deleteAsset(asset.id);

    // The failure it was reported under may have been about this change alone.
    if (this.blocked().length === 0 && this.pushable().length === 0) {
      this.lastError = null;
      this.lastErrorDetail = null;
      this.lastErrorCode = null;
    }

    this.setStatus(this.restingStatus());
    this.emit();
    if (this.pushable().length > 0) this.scheduleFlush();
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

  /**
   * Queues an image to be committed, exactly as a note is.
   *
   * Images used to be posted straight to GitHub the moment they were pasted,
   * outside this queue. That looked fine and failed silently: a paste made
   * offline, or in a tab that was closed a second later, or while the token was
   * expiring, never reached the repository — while the note referencing it
   * synced perfectly well. The result was a note on GitHub pointing at a file
   * that had never existed, which is indistinguishable from a broken note.
   *
   * Going through the queue gives an image what a note already had: retries, a
   * record that survives a restart, and a place in the same commit as the text
   * that refers to it, so the two can never arrive apart.
   */
  async recordAssetUpsert(workspaceId: string, path: string, base64: string): Promise<void> {
    this.queue = coalesce(this.queue, {
      workspaceId,
      path,
      op: "upsert",
      content: base64,
      encoding: "base64",
      baseSha: null,
      now: this.now().toISOString(),
    });

    await this.persistQueue();
    this.scheduleFlush();
  }

  async recordAssetDelete(workspaceId: string, path: string): Promise<void> {
    this.queue = coalesce(this.queue, {
      workspaceId,
      path,
      op: "delete",
      // Images are committed directly rather than through this queue, so there
      // is no sha to carry — but the file is on GitHub, and saying so is what
      // keeps the "never synced, never needs deleting" rule from discarding
      // the request.
      baseSha: null,
      existsRemotely: true,
      now: this.now().toISOString(),
    });

    await this.persistQueue();
    this.scheduleFlush();
  }

  /**
   * Queues a file to move without re-uploading it.
   *
   * For images carried along with the folder they live in. `recordRename` is
   * the note version and needs the text, because a note's relative links are
   * rewritten as part of the move; an image has neither.
   */
  async recordAssetMove(workspaceId: string, from: string, to: string): Promise<void> {
    this.queue = coalesce(this.queue, {
      workspaceId,
      path: from,
      op: "move",
      toPath: to,
      // An image has no sha here — it is not committed through this queue —
      // and the commit does not need one: it finds the blob by looking the old
      // path up in the tree it is committing against.
      baseSha: null,
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
      this.lastErrorDetail = null;
      this.lastErrorCode = null;
      this.lastErrorAt = null;
      this.failedAttempts = 0;
      this.retryDelay = 0;
      this.setStatus(this.restingStatus());
    } catch (err) {
      this.lastError = plainly(err);
      this.lastErrorDetail = err instanceof Error ? err.message : String(err);
      this.lastErrorCode = codeOf(err);
      this.lastErrorAt = this.now().toISOString();
      this.failedAttempts += 1;
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

    // Sized before it is sent. A batch over the limit is split; a single
    // change over it on its own is stopped here, because there is no batch
    // left to split and the request would come back 413 however many times it
    // was tried.
    const { batches, oversized } = batchBySize(safe);

    let failure: unknown = null;

    for (const change of oversized) {
      await this.stop(change, tooLarge(change));
      failure ??= tooLarge(change);
    }

    for (const batch of batches) {
      try {
        await this.push(workspaceId, batch);
      } catch (err) {
        failure ??= err;
      }
    }

    if (failure) throw failure;
  }

  /**
   * Parks one change immediately, with the reason on it.
   *
   * Distinct from running out of attempts. A change that cannot be sent at all
   * has nothing to gain from four more tries, and spending them only delays
   * the moment somebody is told which file is stuck.
   */
  private async stop(change: PendingChange, err: Error): Promise<void> {
    change.attempts += 1;
    change.lastError = err.message;
    change.blocked = true;
    await this.db.putQueueItem(change);
  }

  /**
   * Pushes a batch as one commit, isolating a change the server will never
   * accept.
   *
   * A flush is deliberately atomic: everything queued for a workspace lands as
   * a single commit or none of it does. The failure mode that has is that one
   * impossible change — a deletion of a path that is not in the repository, a
   * file the server rejects — fails the commit that carries everybody else's
   * writing too, and keeps failing it on every retry until the whole queue is
   * marked blocked. "Couldn't sync, click to retry", forever, with the notes
   * still on the device and nothing explaining which one is at fault.
   *
   * So a batch that fails for a reason specific to its *content* is split and
   * retried in halves, down to single changes. Everything that can be pushed
   * is pushed, and the one that cannot ends up alone, where its attempt count
   * and its error message describe it rather than the queue it was standing
   * in. Failures that are nothing to do with the content — offline, signed
   * out, rate limited — are not split: they would fail identically in halves
   * and cost a burst of requests to prove it.
   */
  private async push(workspaceId: string, changes: PendingChange[]): Promise<void> {
    try {
      const result = await this.gateway.commit({
        workspaceId,
        message: describeChanges(changes),
        squashWindowMs: this.squashWindowMs,
        changes: changes.map((c) => ({
          op: c.op,
          path: c.path,
          ...(c.toPath !== undefined ? { toPath: c.toPath } : {}),
          ...(c.content !== undefined ? { content: c.content } : {}),
          ...(c.encoding !== undefined ? { encoding: c.encoding } : {}),
        })),
      });

      await this.settle(workspaceId, changes, result);
    } catch (err) {
      if (changes.length > 1 && isContentRejection(err)) {
        const middle = Math.ceil(changes.length / 2);
        const failures: unknown[] = [];

        for (const half of [changes.slice(0, middle), changes.slice(middle)]) {
          try {
            await this.push(workspaceId, half);
          } catch (halfError) {
            failures.push(halfError);
          }
        }

        // The flush still failed — the status bar has to say so — but only for
        // what actually failed.
        if (failures.length > 0) throw failures[0];
        return;
      }

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

      for (const change of changes) {
        change.attempts += 1;
        change.lastError = message;
        if (change.attempts >= MAX_ATTEMPTS) change.blocked = true;
        await this.db.putQueueItem(change);
      }
      throw err;
    }
  }

  /** Clears pushed changes from the queue and records what they were based on. */
  private async settle(
    workspaceId: string,
    changes: PendingChange[],
    result: { blobShas: Record<string, string> },
  ): Promise<void> {
    for (const change of changes) {
      this.queue = this.queue.filter((c) => c.id !== change.id);
      await this.db.deleteQueueItem(change.id);

      const path =
        change.op === "rename" || change.op === "move"
          ? (change.toPath ?? change.path)
          : change.path;
      const newSha = result.blobShas[path];
      if (change.op === "delete" || !newSha) continue;

      const note = await this.db.getNote(`${workspaceId}::${path}`);
      if (note) {
        await this.db.putNote({ ...note, baseSha: newSha, dirty: false });
        continue;
      }

      // Not a note: an image, now genuinely on GitHub. Recording that is what
      // lets a later deletion know there is something there to delete.
      const asset = await this.db.getAsset(`${workspaceId}::${path}`);
      if (asset && !asset.pushed) await this.db.putAsset({ ...asset, pushed: true });
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

      /**
       * The file moved on, but not in any way worth asking about.
       *
       * Every save stamps `updated` and `editedBy`, so two devices that opened
       * the same note produce files that differ while saying exactly the same
       * thing. Putting a "which version do you want to keep?" dialog in front
       * of somebody over a timestamp teaches them to dismiss that dialog
       * without reading it — which is the one habit it cannot afford, because
       * the next one will be about their actual writing.
       *
       * So a difference confined to the stamps resolves itself: the newer
       * stamp wins, based on what is on GitHub now, and nobody is asked.
       */
      if (onlyProvenanceDiffers(change.content ?? "", remote.content)) {
        change.baseSha = remote.sha;
        await this.db.putQueueItem(change);
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

/**
 * Roughly what one change costs on the wire.
 *
 * The content dominates and base64 is already text, so the encoded length is
 * the answer; the path and the JSON scaffolding around it are a rounding error
 * that the generous headroom below the platform's limit covers.
 */
function weigh(change: PendingChange): number {
  return (change.content?.length ?? 0) + change.path.length + (change.toPath?.length ?? 0) + 64;
}

/** A change that will not fit in a request however it is batched. */
function tooLarge(change: PendingChange): Error {
  const path =
    change.op === "rename" || change.op === "move" ? (change.toPath ?? change.path) : change.path;
  const mb = (weigh(change) / (1024 * 1024)).toFixed(1);
  const err = new Error(
    `${path} is ${mb} MB, which is too big to send to GitHub in one request (the limit is 3 MB).`,
  ) as Error & { code: string; status: number };
  err.code = "too-large";
  err.status = 413;
  return err;
}

/**
 * Packs the queue into requests that fit, and names what never will.
 *
 * Greedy and order-preserving: changes go into the current batch until the
 * next one would push it over, then a new batch starts. Anything that exceeds
 * the budget by itself comes back separately, because no amount of batching
 * makes it sendable and the reader needs to be told which file it is.
 */
export function batchBySize(changes: PendingChange[]): {
  batches: PendingChange[][];
  oversized: PendingChange[];
} {
  const batches: PendingChange[][] = [];
  const oversized: PendingChange[] = [];
  let current: PendingChange[] = [];
  let weight = 0;

  for (const change of changes) {
    const size = weigh(change);

    if (size > MAX_REQUEST_BYTES) {
      oversized.push(change);
      continue;
    }

    if (current.length > 0 && weight + size > MAX_REQUEST_BYTES) {
      batches.push(current);
      current = [];
      weight = 0;
    }

    current.push(change);
    weight += size;
  }

  if (current.length > 0) batches.push(current);
  return { batches, oversized };
}

/**
 * True when the server rejected *what* was sent rather than the fact that we
 * sent it.
 *
 * A 422 is GitHub saying this particular set of paths and contents cannot be
 * committed — a deletion of something that is not there, a path it will not
 * accept. Splitting the batch finds the one at fault. Everything else (signed
 * out, rate limited, offline, a conflict) applies to the whole batch equally.
 */
function isContentRejection(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const { code, status } = err as { code?: unknown; status?: unknown };
  // 413 belongs here too: a body refused for its size is a statement about
  // what was sent, and splitting it is both the way to find the file at fault
  // and, for everything standing behind that file, the way to get pushed.
  return code === "validation" || code === "too-large" || status === 422 || status === 413;
}

/**
 * A push failure, said in a way somebody can act on.
 *
 * GitHub answers a refused commit with its own internal vocabulary —
 * `GitRPC::BadObjectState` is a real thing it says — and the status bar used to
 * print that verbatim. It tells a person writing notes nothing except that
 * something is wrong, and it reads like the app has crashed.
 *
 * Every branch here says the same two things: what happened, and whether their
 * writing is safe. It always is; that is the whole point of saving locally
 * first, and it is the first thing anybody wants to know.
 */
/**
 * The same failure, in a form the UI can branch on.
 *
 * `plainly` says what happened; this says what *kind* of thing happened, which
 * is what decides whether the honest offer is "try again" or "sign in again".
 * Kept beside it so the two can never drift into disagreeing about one error.
 */
export function codeOf(err: unknown): SyncErrorCode {
  const { code, status } = (err ?? {}) as { code?: unknown; status?: unknown };

  switch (code) {
    case "unauthorized":
    case "forbidden":
    case "not-found":
    case "rate-limited":
    case "conflict":
    case "validation":
    case "too-large":
    case "network":
      return code;
  }

  if (typeof status === "number") {
    if (status === 401) return "unauthorized";
    if (status === 403) return "forbidden";
    if (status === 404) return "not-found";
    if (status === 409) return "conflict";
    if (status === 413) return "too-large";
    if (status === 422) return "validation";
    if (status === 429) return "rate-limited";
    if (status >= 500) return "server";
  }

  return "unknown";
}

export function plainly(err: unknown): string {
  const { code, status } = (err ?? {}) as { code?: unknown; status?: unknown };

  switch (code) {
    case "unauthorized":
      return "Your GitHub sign-in has expired. Sign in again to push these changes — they are safe on this device.";
    case "forbidden":
      return "GitHub would not accept this change. Check you still have write access to this repository.";
    case "rate-limited":
      return "GitHub is asking us to slow down. This will push itself shortly.";
    case "not-found":
      return "That repository or branch is no longer there. Your notes are safe on this device.";
    case "conflict":
      return "This note also changed on GitHub. Open it to choose which version to keep.";
    case "validation":
      return "GitHub refused one of these changes. Everything else has been pushed, and this note is safe on this device.";
    case "too-large":
      return "This change is too big to send to GitHub. It is safe on this device, but it will not push until the large file in it is made smaller or removed.";
    case "network":
      return "Could not reach GitHub. Your work is saved on this device and will push when the connection returns.";
  }

  if (typeof status === "number" && status >= 500) {
    return "GitHub is having trouble at the moment. This will retry by itself.";
  }

  return "Could not push to GitHub just now. Your work is saved on this device and will be retried.";
}

/**
 * What is actually wrong, and what a person can do about it.
 *
 * `plainly` is one sentence, because the status bar is one line — and one line
 * is all somebody gets before they have to decide whether to worry. It is not
 * enough to act on. "Could not push, will be retried" beside a retry that
 * keeps failing tells a reader nothing about *why* it keeps failing, so the
 * only move left is to press the button again, which is exactly the loop this
 * exists to end.
 *
 * So every failure also carries the reason underneath it and the steps worth
 * taking, in the order worth taking them — including the ones the app cannot
 * do on the reader's behalf, like giving itself write access to a repository.
 * `retryable` says whether pressing retry unchanged could plausibly work, so
 * the UI can stop offering it as the answer when it is not one.
 */
export interface SyncRemedy {
  /** The cause, said as a fact about the world rather than about the app. */
  reason: string;
  /** What to do, most likely fix first. */
  steps: string[];
  /** True when the same push, unchanged, might succeed on another attempt. */
  retryable: boolean;
}

export function remedyFor(code: SyncErrorCode | null, detail?: string | null): SyncRemedy {
  switch (code) {
    case "unauthorized":
      return {
        reason:
          "GitHub is refusing this app's sign-in. The token it holds has expired, been revoked, or lost the permission it needs.",
        steps: [
          "Sign in to GitHub again — this is the only thing that fixes it.",
          "If signing in does not help, check that ForkLeaf is still authorised at github.com/settings/applications and has not been revoked.",
        ],
        retryable: false,
      };

    case "forbidden":
      return {
        reason:
          "GitHub knows who you are and will not accept this commit. That is a permission on the repository or the branch, not a problem with your notes.",
        steps: [
          "Check you still have write access to this repository on GitHub.",
          "If the branch is protected, switch to another branch from the status bar, or use “Propose changes…” to open a pull request instead.",
          "If the repository has been archived, unarchive it — archived repositories accept nothing.",
        ],
        retryable: false,
      };

    case "not-found":
      return {
        reason:
          "The repository or branch this workspace points at is not there any more. It may have been renamed, deleted, or made private to an account you are no longer signed in as.",
        steps: [
          "Open the repository on GitHub and confirm it still exists under that name.",
          "If the branch was deleted, pick another one from the branch menu in the status bar.",
          "Otherwise connect the workspace again — your notes stay on this device throughout.",
        ],
        retryable: false,
      };

    case "conflict":
      return {
        reason: "This note changed on GitHub as well, so there are two versions of it.",
        steps: [
          "Open the conflict and choose which version to keep.",
          "Nothing is overwritten until you choose; both versions are intact.",
        ],
        retryable: false,
      };

    case "validation":
      return {
        reason:
          "GitHub rejected one particular file in this commit. Everything else in it went through.",
        steps: [
          "Check the note's path for characters GitHub will not take, and its size — the API refuses files over 100 MB.",
          "Renaming the note is usually enough to get it moving.",
        ],
        retryable: false,
      };

    case "too-large":
      return {
        reason:
          "The request was refused for its size before it reached GitHub. Almost always this is one pasted image: a picture is carried as text, which makes it about a third bigger again, and a few megabytes of screenshot is past what a single request may carry.",
        steps: [
          "Find the file named below in the note it was pasted into, and delete it from the note.",
          "If you need the picture, save a smaller copy — an export at a lower resolution, or a JPEG instead of a PNG — and paste that instead.",
          "Everything else you have written pushes on its own once the large file is out of the queue.",
        ],
        retryable: false,
      };

    case "rate-limited":
      return {
        reason: "GitHub is throttling this app for making too many requests too quickly.",
        steps: [
          "Wait a few minutes — this clears by itself and the queue keeps retrying.",
          "If it keeps happening, switch syncing to a timer so a burst of writing becomes one push instead of many.",
        ],
        retryable: true,
      };

    case "network":
      return {
        reason: "The request never reached GitHub.",
        steps: [
          "Check this device is online.",
          "If you are on a VPN, a corporate network, or behind a proxy, check that api.github.com is not blocked — that is the usual cause when everything else works.",
          "The queue retries by itself as soon as the connection is back.",
        ],
        retryable: true,
      };

    case "server":
      return {
        reason: "GitHub answered with an error of its own. Nothing is wrong on this device.",
        steps: [
          "Check githubstatus.com for an ongoing incident.",
          "This retries by itself; there is nothing to do but wait it out.",
        ],
        retryable: true,
      };

    default:
      return {
        reason: detail
          ? `The push failed without GitHub giving a reason we recognise. What came back was: ${detail}`
          : "The push failed without saying why, and no error came back that we recognise.",
        steps: [
          "Try again — an attempt that fails this way sometimes succeeds on the next one.",
          "Check githubstatus.com, and whether a VPN or proxy is intercepting requests to api.github.com.",
          "If it keeps failing, copy the details below and report it. Your notes stay on this device, and you can export them at any time.",
        ],
        retryable: true,
      };
  }
}

/**
 * Fields this app maintains rather than the person writing.
 *
 * A difference in these is a difference in bookkeeping, not in content.
 */
const PROVENANCE = new Set(["updated", "editedBy", "generator"]);

/** True when two versions of a note say the same thing, stamps aside. */
export function onlyProvenanceDiffers(local: string, remote: string): boolean {
  if (local === remote) return true;

  const ours = parseDocument(local);
  const theirs = parseDocument(remote);

  if (ours.content !== theirs.content) return false;

  const significant = (frontmatter: Record<string, unknown>) =>
    Object.entries(frontmatter)
      .filter(([key, value]) => !PROVENANCE.has(key) && value !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));

  const mine = significant(ours.frontmatter);
  const yours = significant(theirs.frontmatter);

  return mine.length === yours.length && JSON.stringify(mine) === JSON.stringify(yours);
}
