import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Note, PendingChange, SyncMode, TreeNode } from "@forkleaf/types";
import { SyncEngine } from "./sync-engine";
import { MemoryDatabase } from "./memory-db";
import { coalesce, describeChanges } from "./queue";
import { plainly, codeOf, remedyFor, batchBySize } from "./sync-engine";
import type { RemoteCommitInput, RemoteGateway } from "./ports";

// ─── Test doubles ───────────────────────────────────────────────────────────

class FakeGateway implements RemoteGateway {
  commits: RemoteCommitInput[] = [];
  /** Remote file state, keyed by path. */
  files = new Map<string, { content: string; sha: string }>();
  online = true;
  failNext = 0;
  /** Paths the fake server refuses, the way GitHub refuses a bad tree entry. */
  rejects = new Set<string>();
  private counter = 0;

  async listTree(): Promise<TreeNode[]> {
    return [];
  }

  async listAllPaths(): Promise<string[]> {
    return [...this.files.keys()];
  }

  async readFile(_workspaceId: string, path: string) {
    if (!this.online) throw new Error("offline");
    return this.files.get(path) ?? null;
  }

  async commit(input: RemoteCommitInput) {
    if (!this.online) throw new Error("offline");
    if (this.failNext > 0) {
      this.failNext -= 1;
      throw new Error("server error");
    }

    const refused = input.changes.find((change) => this.rejects.has(change.path));
    if (refused) {
      throw Object.assign(new Error(`GitRPC::BadObjectState on ${refused.path}`), {
        code: "validation",
        status: 422,
      });
    }

    this.commits.push(structuredClone(input));
    const blobShas: Record<string, string> = {};

    for (const change of input.changes) {
      const path = change.op === "rename" ? (change.toPath ?? change.path) : change.path;
      if (change.op === "delete") {
        this.files.delete(change.path);
        continue;
      }
      if (change.op === "rename") this.files.delete(change.path);

      this.counter += 1;
      const sha = `sha-${this.counter}`;
      this.files.set(path, { content: change.content ?? "", sha });
      blobShas[path] = sha;
    }

    return { sha: `commit-${this.commits.length}`, blobShas, squashed: false };
  }
}

/** Timer control so debounce behaviour is tested deterministically. */
function fakeTimers() {
  let pending: (() => void) | null = null;
  let lastDelay: number | null = null;
  return {
    setTimeout: (fn: () => void, ms: number) => {
      pending = fn;
      lastDelay = ms;
      return 1;
    },
    clearTimeout: () => {
      pending = null;
    },
    /** Fires the scheduled callback, if any. */
    tick: async () => {
      const fn = pending;
      pending = null;
      fn?.();
      // Let the async flush settle.
      await new Promise((r) => setTimeout(r, 0));
    },
    get scheduled() {
      return pending !== null;
    },
    /** How long the pending callback was scheduled for. */
    get delay() {
      return lastDelay;
    },
  };
}

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: "ws::a.md",
    workspaceId: "ws",
    path: "a.md",
    content: "hello",
    frontmatter: {},
    baseSha: "sha-original",
    updatedAt: "2026-01-01T00:00:00.000Z",
    dirty: false,
    ...overrides,
  };
}

function setup(options: { online?: boolean; mode?: SyncMode; intervalMinutes?: number } = {}) {
  const db = new MemoryDatabase();
  const gateway = new FakeGateway();
  const timers = fakeTimers();
  let online = options.online ?? true;

  const engine = new SyncEngine({
    db,
    gateway,
    debounceMs: 1000,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    isOnline: () => online,
    ...(options.mode ? { mode: options.mode } : {}),
    ...(options.intervalMinutes !== undefined ? { intervalMinutes: options.intervalMinutes } : {}),
  });

  return {
    db,
    gateway,
    timers,
    engine,
    setOnline(value: boolean) {
      online = value;
      gateway.online = value;
    },
  };
}

// ─── Queue coalescing ───────────────────────────────────────────────────────

describe("queue coalescing", () => {
  const base = { workspaceId: "ws", now: "2026-01-01T00:00:00.000Z" };

  it("collapses repeated edits to one note into a single pending change", () => {
    let queue = coalesce([], { ...base, path: "a.md", op: "upsert", content: "v1", baseSha: "s1" });
    queue = coalesce(queue, { ...base, path: "a.md", op: "upsert", content: "v2", baseSha: "s1" });
    queue = coalesce(queue, { ...base, path: "a.md", op: "upsert", content: "v3", baseSha: "s1" });

    expect(queue).toHaveLength(1);
    expect(queue[0]!.content).toBe("v3");
  });

  it("keeps the original baseSha so a remote edit is not silently masked", () => {
    let queue = coalesce([], {
      ...base,
      path: "a.md",
      op: "upsert",
      content: "v1",
      baseSha: "old",
    });
    // A later save reporting a newer sha must not overwrite what we branched from.
    queue = coalesce(queue, {
      ...base,
      path: "a.md",
      op: "upsert",
      content: "v2",
      baseSha: "newer",
    });

    expect(queue[0]!.baseSha).toBe("old");
  });

  /**
   * The duplicate that appears after a rename.
   *
   * "Created offline" was read off the queued change alone, and a note pushed
   * once and edited since carries a queued change with no sha of its own. The
   * rename was then recorded as a fresh file at the new path, with nothing
   * removing the old one — so the repository ended up holding the note twice,
   * and deleting the copy took the pictures both of them pointed at.
   */
  it("moves a note that exists remotely, rather than copying it", () => {
    let queue = coalesce([], {
      ...base,
      path: "a.md",
      op: "upsert",
      content: "v1",
      baseSha: null,
    });
    queue = coalesce(queue, {
      ...base,
      path: "a.md",
      op: "rename",
      toPath: "b.md",
      content: "v1",
      // The note itself knows what it is based on, whatever the queued edit says.
      baseSha: "sha-a",
    });

    expect(queue).toHaveLength(1);
    expect(queue[0]!.op).toBe("rename");
    expect(queue[0]!.path).toBe("a.md");
    expect(queue[0]!.toPath).toBe("b.md");
  });

  it("still writes a note that has never been pushed straight to its new path", () => {
    let queue = coalesce([], {
      ...base,
      path: "draft.md",
      op: "upsert",
      content: "v1",
      baseSha: null,
    });
    queue = coalesce(queue, {
      ...base,
      path: "draft.md",
      op: "rename",
      toPath: "named.md",
      content: "v1",
      baseSha: null,
    });

    expect(queue).toHaveLength(1);
    expect(queue[0]!.op).toBe("upsert");
    expect(queue[0]!.path).toBe("named.md");
  });

  it("keeps edits to different notes separate", () => {
    let queue = coalesce([], { ...base, path: "a.md", op: "upsert", content: "a", baseSha: "s" });
    queue = coalesce(queue, { ...base, path: "b.md", op: "upsert", content: "b", baseSha: "s" });
    expect(queue).toHaveLength(2);
  });

  it("drops a note entirely if it was created and deleted before ever syncing", () => {
    let queue = coalesce([], {
      ...base,
      path: "new.md",
      op: "upsert",
      content: "x",
      baseSha: null,
    });
    queue = coalesce(queue, { ...base, path: "new.md", op: "delete", baseSha: null });
    expect(queue).toHaveLength(0);
  });

  it("replaces a pending edit with a delete for a note that does exist remotely", () => {
    let queue = coalesce([], { ...base, path: "a.md", op: "upsert", content: "x", baseSha: "s1" });
    queue = coalesce(queue, { ...base, path: "a.md", op: "delete", baseSha: "s1" });

    expect(queue).toHaveLength(1);
    expect(queue[0]!.op).toBe("delete");
  });

  it("turns a rename of a never-synced note into a plain create at the new path", () => {
    let queue = coalesce([], {
      ...base,
      path: "new.md",
      op: "upsert",
      content: "x",
      baseSha: null,
    });
    queue = coalesce(queue, {
      ...base,
      path: "new.md",
      op: "rename",
      toPath: "renamed.md",
      content: "x",
      baseSha: null,
    });

    expect(queue).toHaveLength(1);
    expect(queue[0]!.op).toBe("upsert");
    expect(queue[0]!.path).toBe("renamed.md");
  });

  it("collapses a chain of renames into one move", () => {
    let queue = coalesce([], {
      ...base,
      path: "a.md",
      op: "rename",
      toPath: "b.md",
      content: "x",
      baseSha: "s1",
    });
    queue = coalesce(queue, {
      ...base,
      path: "b.md",
      op: "rename",
      toPath: "c.md",
      content: "x",
      baseSha: "s1",
    });

    expect(queue).toHaveLength(1);
    expect(queue[0]!.path).toBe("a.md");
    expect(queue[0]!.toPath).toBe("c.md");
  });

  it("keeps the rename when a note is edited after being renamed", () => {
    let queue = coalesce([], {
      ...base,
      path: "a.md",
      op: "rename",
      toPath: "b.md",
      content: "v1",
      baseSha: "s1",
    });
    queue = coalesce(queue, { ...base, path: "b.md", op: "upsert", content: "v2", baseSha: "s1" });

    expect(queue).toHaveLength(1);
    expect(queue[0]!.op).toBe("rename");
    expect(queue[0]!.content).toBe("v2");
  });
});

/**
 * What the status bar says when a push fails.
 *
 * GitHub's own words for a refused commit are things like
 * `GitRPC::BadObjectState`, which used to be printed verbatim to somebody who
 * was only trying to write notes.
 */
describe("a failure reported to the reader", () => {
  it("says what happened rather than what the server called it", async () => {
    const ctx = setup();
    ctx.gateway.rejects.add("a.md");

    await ctx.engine.recordUpsert(makeNote({ path: "a.md", baseSha: null }), "a");
    await ctx.timers.tick();

    expect(ctx.engine.state.lastError).not.toContain("GitRPC");
    expect(ctx.engine.state.lastError).toContain("safe on this device");
    // The server's own words are kept, for a tooltip and for bug reports.
    expect(ctx.engine.state.lastErrorDetail).toContain("BadObjectState");
  });

  it("names the fix when the sign-in is what expired", () => {
    expect(plainly({ code: "unauthorized", status: 401 })).toContain("Sign in again");
  });

  it("has something useful to say about an error it has never seen", () => {
    expect(plainly(new Error("something nobody predicted"))).toContain("saved on this device");
  });

  /**
   * The message alone left the UI with one offer — retry — which for an
   * expired token retries into the same 401 forever. The code is what lets the
   * status bar offer the sign-in instead.
   */
  it("reports the kind of failure, not only the sentence", async () => {
    const ctx = setup();
    ctx.gateway.rejects.add("a.md");

    await ctx.engine.recordUpsert(makeNote({ path: "a.md", baseSha: null }), "a");
    await ctx.timers.tick();

    expect(ctx.engine.state.lastErrorCode).toBe("validation");
  });

  it("recognises a signed-out failure however GitHub phrases it", () => {
    expect(codeOf({ code: "unauthorized" })).toBe("unauthorized");
    expect(codeOf({ status: 401 })).toBe("unauthorized");
    expect(codeOf({ status: 503 })).toBe("server");
    expect(codeOf(new Error("who knows"))).toBe("unknown");
  });

  /**
   * The number behind "I keep clicking retry and nothing happens". Without it
   * the fifth failure is indistinguishable from the first, and the only thing
   * a reader can conclude is that the button is broken.
   */
  it("counts the attempts that have failed in a row", async () => {
    const ctx = setup();
    ctx.gateway.rejects.add("a.md");

    await ctx.engine.recordUpsert(makeNote({ path: "a.md", baseSha: null }), "a");
    await ctx.timers.tick();
    expect(ctx.engine.state.failedAttempts).toBe(1);
    expect(ctx.engine.state.lastErrorAt).not.toBeNull();

    ctx.engine.retryNow();
    await ctx.timers.tick();
    expect(ctx.engine.state.failedAttempts).toBeGreaterThan(1);
  });

  /**
   * Most of what fixes a failed push is something only the person at the
   * keyboard can do, so the app has to be able to say what that is.
   */
  it("offers steps for the failures it cannot fix by itself", () => {
    expect(remedyFor("forbidden").steps.join(" ")).toContain("write access");
    expect(remedyFor("forbidden").retryable).toBe(false);
    expect(remedyFor("network").retryable).toBe(true);
    // An unrecognised failure has nothing to explain it but GitHub's own words,
    // so those become the reason rather than being hidden.
    expect(remedyFor("unknown", "GitRPC::BadObjectState").reason).toContain("BadObjectState");
  });

  /**
   * The failure that made all of this necessary. A pasted screenshot made a
   * request bigger than the host in front of the API will carry, so the push
   * came back 413 before any of our code ran — unclassified, unexplained, and
   * identical on every retry. Nothing had checked the size before sending.
   */
  it("stops a change too big to send instead of failing on it forever", async () => {
    const ctx = setup();
    const huge = "x".repeat(4 * 1024 * 1024);

    await ctx.engine.recordUpsert(makeNote({ path: "big.md", baseSha: null }), huge);
    await ctx.engine.recordUpsert(makeNote({ path: "small.md", baseSha: null }), "ordinary");
    await ctx.timers.tick();

    // The one that cannot be sent is parked at once, named, and told why.
    expect(ctx.engine.state.lastErrorCode).toBe("too-large");
    const stuck = ctx.engine.state.unpushed.filter((change) => change.tooLarge);
    expect(stuck.map((change) => change.path)).toEqual(["big.md"]);
    expect(stuck[0]?.error).toContain("too big to send");
    expect(stuck[0]?.blocked).toBe(true);

    // And it no longer takes everything else down with it.
    expect(ctx.gateway.commits.length).toBeGreaterThan(0);
    expect(ctx.engine.pendingFor().map((change) => change.path)).toEqual(["big.md"]);
  });

  it("packs the queue into requests that fit rather than one that does not", () => {
    const change = (path: string, bytes: number): PendingChange => ({
      id: path,
      workspaceId: "w",
      path,
      op: "upsert",
      content: "x".repeat(bytes),
      baseSha: null,
      queuedAt: new Date().toISOString(),
      attempts: 0,
    });

    const { batches, oversized } = batchBySize([
      change("a.md", 2 * 1024 * 1024),
      change("b.md", 2 * 1024 * 1024),
      change("c.md", 4 * 1024 * 1024),
    ]);

    expect(batches.map((batch) => batch.map((c) => c.path))).toEqual([["a.md"], ["b.md"]]);
    expect(oversized.map((c) => c.path)).toEqual(["c.md"]);
  });

  /**
   * "Go and find the image and delete it" is not an instruction anybody can
   * follow when the file is called `Pasted image 20260828.png` and the note is
   * one of hundreds. The queue knows exactly which change is stuck.
   */
  it("removes a stuck change, and the unpushed file behind it", async () => {
    const ctx = setup();
    const huge = "x".repeat(4 * 1024 * 1024);

    await ctx.engine.recordUpsert(makeNote({ path: "big.md", baseSha: null }), huge);
    await ctx.timers.tick();

    const [stuck] = ctx.engine.state.unpushed;
    expect(stuck).toBeDefined();

    await ctx.engine.discardChange(stuck!.id);

    expect(ctx.engine.state.unpushed).toEqual([]);
    expect(ctx.engine.pendingFor()).toEqual([]);
    // The queue is clear, so the bar stops reporting a failure that is over.
    expect(ctx.engine.state.lastErrorCode).toBeNull();
  });

  /**
   * The other way out of a file that is too big: make it smaller. Removing it
   * was the only thing on offer, which is a strange demand to make about a
   * screenshot that is perfectly good and merely larger than one request.
   */
  it("takes smaller bytes for a stuck change and sends them", async () => {
    const ctx = setup();
    const huge = "x".repeat(4 * 1024 * 1024);

    await ctx.engine.recordAssetUpsert("w", "assets/shot.png", huge);
    await ctx.timers.tick();

    const [stuck] = ctx.engine.state.unpushed;
    expect(stuck?.tooLarge).toBe(true);

    expect(await ctx.engine.replaceContent(stuck!.id, "small", "base64")).toBe(true);

    // The failure was earned by bytes that no longer exist. Leaving it would
    // park the new ones beside the old error and never send them.
    expect(ctx.engine.state.unpushed[0]?.tooLarge).toBe(false);
    expect(ctx.engine.state.unpushed[0]?.blocked).toBe(false);
    expect(ctx.engine.state.lastErrorCode).toBeNull();

    await ctx.timers.tick();
    expect(ctx.engine.state.unpushed).toEqual([]);
  });

  it("has nothing to replace for a change that has already gone", async () => {
    const ctx = setup();
    expect(await ctx.engine.replaceContent("w::nothing.png", "small", "base64")).toBe(false);
  });

  it("forgets the failure once a push succeeds", async () => {
    const ctx = setup();
    ctx.gateway.failNext = 1;

    await ctx.engine.recordUpsert(makeNote({ path: "a.md", baseSha: null }), "a");
    await ctx.timers.tick();
    expect(ctx.engine.state.lastErrorCode).not.toBeNull();

    ctx.engine.retryNow();
    await ctx.timers.tick();
    expect(ctx.engine.state.lastErrorCode).toBeNull();
  });
});

/**
 * Images, queued the way notes are.
 *
 * A pasted screenshot used to be posted straight to GitHub outside this queue,
 * so an upload that failed — offline, a tab closed a second later — was lost in
 * silence while the note referencing it synced perfectly well. What was left on
 * GitHub was a note pointing at a file that had never been committed.
 */
describe("images waiting to be pushed", () => {
  it("goes up in the same commit as the note that uses it", async () => {
    const ctx = setup();

    await ctx.engine.recordUpsert(makeNote({ path: "a.md", baseSha: null }), "![s](assets/s.png)");
    await ctx.engine.recordAssetUpsert("ws", "assets/s.png", "aGVsbG8=");

    await ctx.timers.tick();

    expect(ctx.gateway.commits).toHaveLength(1);
    const changes = ctx.gateway.commits[0]!.changes;
    expect(changes.map((c) => c.path).sort()).toEqual(["a.md", "assets/s.png"]);
    expect(changes.find((c) => c.path === "assets/s.png")?.encoding).toBe("base64");
  });

  it("picks up an image that was left behind before it ever reached GitHub", async () => {
    const ctx = setup();

    await ctx.db.putAsset({
      id: "ws::assets/old.png",
      workspaceId: "ws",
      path: "assets/old.png",
      mimeType: "image/png",
      data: "aGVsbG8=",
      createdAt: "2026-01-01T00:00:00.000Z",
      pushed: false,
    });

    expect(await ctx.engine.recoverStrandedAssets("ws")).toBe(1);
    await ctx.timers.tick();

    expect(ctx.gateway.commits[0]!.changes[0]!.path).toBe("assets/old.png");
  });

  it("survives being pasted with no connection", async () => {
    const ctx = setup({ online: false });
    ctx.setOnline(false);

    await ctx.engine.recordAssetUpsert("ws", "assets/s.png", "aGVsbG8=");
    await ctx.timers.tick();

    expect(ctx.gateway.commits).toHaveLength(0);
    // Still queued, so it goes up when the connection does.
    expect((await ctx.db.listQueue("ws")).map((item) => item.path)).toEqual(["assets/s.png"]);

    ctx.setOnline(true);
    await ctx.engine.flushNow();

    expect(ctx.gateway.commits).toHaveLength(1);
    expect(ctx.gateway.commits[0]!.changes[0]!.path).toBe("assets/s.png");
  });
});

describe("asset deletions", () => {
  it("keeps the request to remove an image, which has no sha of its own", async () => {
    const ctx = setup();

    await ctx.engine.recordAssetDelete("ws", "notes/assets/shot.png");

    const queued = await ctx.db.listQueue("ws");
    expect(queued.map((item) => `${item.op} ${item.path}`)).toEqual([
      "delete notes/assets/shot.png",
    ]);
  });
});

describe("commit messages", () => {
  const change = (over: Record<string, unknown> = {}) =>
    ({
      id: "1",
      workspaceId: "ws",
      path: "notes/todo.md",
      op: "upsert",
      baseSha: "s",
      queuedAt: "",
      attempts: 0,
      ...over,
    }) as never;

  it("names the file for a single change", () => {
    expect(describeChanges([change()])).toBe("update todo.md");
    expect(describeChanges([change({ baseSha: null })])).toBe("create todo.md");
    expect(describeChanges([change({ op: "delete" })])).toBe("delete todo.md");
  });

  it("summarises a batch", () => {
    expect(
      describeChanges([change(), change({ id: "2" }), change({ id: "3", op: "delete" })]),
    ).toBe("update 2 notes, delete 1");
  });
});

// ─── Engine behaviour ───────────────────────────────────────────────────────

describe("SyncEngine", () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it("persists locally before any network call happens", async () => {
    await ctx.engine.recordUpsert(makeNote(), "hello");

    expect(await ctx.db.getNote("ws::a.md")).toMatchObject({ dirty: true });
    // Nothing pushed yet — the debounce has not elapsed.
    expect(ctx.gateway.commits).toHaveLength(0);
  });

  it("pushes one commit after the debounce window, not one per keystroke", async () => {
    const note = makeNote();
    ctx.gateway.files.set("a.md", { content: "old", sha: "sha-original" });

    await ctx.engine.recordUpsert(note, "v1");
    await ctx.engine.recordUpsert(note, "v2");
    await ctx.engine.recordUpsert(note, "v3");

    await ctx.timers.tick();

    expect(ctx.gateway.commits).toHaveLength(1);
    expect(ctx.gateway.commits[0]!.changes).toHaveLength(1);
    expect(ctx.gateway.commits[0]!.changes[0]!.content).toBe("v3");
  });

  it("batches edits across several notes into one commit", async () => {
    ctx.gateway.files.set("a.md", { content: "", sha: "sha-original" });
    ctx.gateway.files.set("b.md", { content: "", sha: "sha-original" });

    await ctx.engine.recordUpsert(makeNote({ id: "ws::a.md", path: "a.md" }), "a");
    await ctx.engine.recordUpsert(makeNote({ id: "ws::b.md", path: "b.md" }), "b");
    await ctx.timers.tick();

    expect(ctx.gateway.commits).toHaveLength(1);
    expect(ctx.gateway.commits[0]!.changes).toHaveLength(2);
  });

  it("clears the dirty flag and adopts the new sha after a successful push", async () => {
    ctx.gateway.files.set("a.md", { content: "old", sha: "sha-original" });

    await ctx.engine.recordUpsert(makeNote(), "new content");
    await ctx.timers.tick();

    const stored = await ctx.db.getNote("ws::a.md");
    expect(stored!.dirty).toBe(false);
    expect(stored!.baseSha).not.toBe("sha-original");
  });

  it("queues changes while offline and reports offline status", async () => {
    ctx.setOnline(false);
    await ctx.engine.recordUpsert(makeNote(), "written on a plane");
    await ctx.timers.tick();

    expect(ctx.gateway.commits).toHaveLength(0);
    expect(ctx.engine.state.status).toBe("offline");
    expect(ctx.engine.state.pendingCount).toBe(1);
    // The edit itself is safe on disk.
    expect((await ctx.db.getNote("ws::a.md"))!.content).toBe("hello");
  });

  it("pushes everything queued once the connection comes back", async () => {
    ctx.gateway.files.set("a.md", { content: "old", sha: "sha-original" });

    ctx.setOnline(false);
    await ctx.engine.recordUpsert(makeNote(), "offline edit");
    await ctx.timers.tick();
    expect(ctx.gateway.commits).toHaveLength(0);

    ctx.setOnline(true);
    await ctx.engine.flushNow();

    expect(ctx.gateway.commits).toHaveLength(1);
    expect(ctx.engine.state.pendingCount).toBe(0);
  });

  it("survives a restart by reloading the queue from storage", async () => {
    ctx.gateway.files.set("a.md", { content: "old", sha: "sha-original" });

    ctx.setOnline(false);
    await ctx.engine.recordUpsert(makeNote(), "unsent");
    await ctx.timers.tick();

    // Simulate the tab being closed and reopened against the same database.
    const revived = new SyncEngine({ db: ctx.db, gateway: ctx.gateway, debounceMs: 0 });
    await revived.start();
    expect(revived.state.pendingCount).toBe(1);

    ctx.setOnline(true);
    await revived.flushNow();
    expect(ctx.gateway.commits).toHaveLength(1);
  });

  it("detects a conflict instead of overwriting a remote edit", async () => {
    // Remote moved on while we were editing.
    ctx.gateway.files.set("a.md", { content: "their version", sha: "sha-theirs" });

    await ctx.engine.recordUpsert(makeNote({ baseSha: "sha-original" }), "my version");
    await ctx.timers.tick();

    expect(ctx.gateway.commits).toHaveLength(0);
    expect(ctx.engine.state.status).toBe("conflict");
    expect(ctx.engine.state.conflicts[0]).toMatchObject({
      path: "a.md",
      localContent: "my version",
      remoteContent: "their version",
    });
  });

  it("does not flag a conflict for a brand-new note", async () => {
    await ctx.engine.recordUpsert(makeNote({ baseSha: null }), "fresh");
    await ctx.timers.tick();

    expect(ctx.engine.state.conflicts).toHaveLength(0);
    expect(ctx.gateway.commits).toHaveLength(1);
  });

  it("keep-local rebases onto the remote sha and then pushes", async () => {
    ctx.gateway.files.set("a.md", { content: "theirs", sha: "sha-theirs" });
    await ctx.engine.recordUpsert(makeNote(), "mine");
    await ctx.timers.tick();
    expect(ctx.engine.state.conflicts).toHaveLength(1);

    await ctx.engine.resolveConflict("ws", "a.md", "keep-local");
    await ctx.timers.tick();

    expect(ctx.engine.state.conflicts).toHaveLength(0);
    expect(ctx.gateway.files.get("a.md")!.content).toBe("mine");
  });

  it("keep-remote discards the local edit and adopts the remote copy", async () => {
    ctx.gateway.files.set("a.md", { content: "theirs", sha: "sha-theirs" });
    await ctx.engine.recordUpsert(makeNote(), "mine");
    await ctx.timers.tick();

    await ctx.engine.resolveConflict("ws", "a.md", "keep-remote");

    const stored = await ctx.db.getNote("ws::a.md");
    expect(stored!.content).toBe("theirs");
    expect(stored!.dirty).toBe(false);
    expect(ctx.engine.state.pendingCount).toBe(0);
  });

  it("keep-both saves the local version alongside under a new name", async () => {
    ctx.gateway.files.set("a.md", { content: "theirs", sha: "sha-theirs" });
    await ctx.engine.recordUpsert(makeNote(), "mine");
    await ctx.timers.tick();

    await ctx.engine.resolveConflict("ws", "a.md", "keep-both");
    await ctx.timers.tick();

    expect(ctx.gateway.files.get("a.md")!.content).toBe("theirs");
    expect(ctx.gateway.files.get("a (local copy).md")!.content).toBe("mine");
  });

  it("keeps changes queued when a push fails so nothing is lost", async () => {
    ctx.gateway.files.set("a.md", { content: "old", sha: "sha-original" });
    ctx.gateway.failNext = 1;

    await ctx.engine.recordUpsert(makeNote(), "important");
    await ctx.timers.tick();

    expect(ctx.engine.state.status).toBe("error");
    expect(ctx.engine.state.pendingCount).toBe(1);

    await ctx.engine.flushNow();
    expect(ctx.gateway.commits).toHaveLength(1);
    expect(ctx.engine.state.pendingCount).toBe(0);
  });

  /**
   * What happens to a change that can never be pushed.
   *
   * This used to be asserted the other way round — the change was deleted from
   * the queue and from storage after five attempts, and the test called that
   * "gives up rather than blocking the queue forever". It did stop blocking the
   * queue. It also emptied it, which moved the status to "idle" and put "All
   * changes saved" on screen for a note that had never reached GitHub and, now
   * that the only record of it was gone, never would.
   *
   * Nothing may be discarded. It is parked: kept, counted, and reported as
   * something that has stopped rather than something in progress.
   */
  it("parks a change that keeps failing, and never throws it away", async () => {
    ctx.gateway.files.set("a.md", { content: "old", sha: "sha-original" });
    ctx.gateway.failNext = 99;

    await ctx.engine.recordUpsert(makeNote(), "doomed");
    // The automatic path, which is what actually retries: each tick runs the
    // flush and schedules the next attempt.
    for (let i = 0; i < 6; i += 1) await ctx.timers.tick();

    expect(ctx.engine.state.blockedCount).toBe(1);
    expect(ctx.engine.state.pendingCount).toBe(1);

    // The text is still there to be pushed once whatever was wrong is fixed.
    expect(await ctx.db.listQueue()).toHaveLength(1);
    expect((await ctx.db.listQueue())[0]?.content).toBe("doomed");
  });

  it("never says everything is saved while a change is parked", async () => {
    ctx.gateway.files.set("a.md", { content: "old", sha: "sha-original" });
    ctx.gateway.failNext = 99;

    await ctx.engine.recordUpsert(makeNote(), "doomed");
    for (let i = 0; i < 6; i += 1) await ctx.timers.tick();

    expect(ctx.engine.state.status).toBe("blocked");
    expect(ctx.engine.state.status).not.toBe("idle");
  });

  it("stops retrying a parked change, so the queue behind it still drains", async () => {
    ctx.gateway.files.set("a.md", { content: "old", sha: "sha-original" });
    ctx.gateway.failNext = 99;

    await ctx.engine.recordUpsert(makeNote(), "doomed");
    for (let i = 0; i < 6; i += 1) await ctx.timers.tick();
    expect(ctx.engine.state.blockedCount).toBe(1);

    // A second note, in a workspace that is working again.
    ctx.gateway.failNext = 0;
    await ctx.engine.recordUpsert(makeNote({ id: "ws::b.md", path: "b.md" }), "fine");
    await ctx.timers.tick();

    const pushed = ctx.gateway.commits.flatMap((c) => c.changes.map((x) => x.path));
    expect(pushed).toContain("b.md");
    // And the parked one is still parked rather than quietly re-attempted.
    expect(ctx.engine.state.blockedCount).toBe(1);
  });

  it("tries a parked change again when asked, which is what retry means", async () => {
    ctx.gateway.files.set("a.md", { content: "old", sha: "sha-original" });
    ctx.gateway.failNext = 99;

    await ctx.engine.recordUpsert(makeNote(), "doomed");
    for (let i = 0; i < 6; i += 1) await ctx.timers.tick();
    expect(ctx.engine.state.blockedCount).toBe(1);

    // Whatever was wrong is fixed, and the reader presses sync.
    ctx.gateway.failNext = 0;
    await ctx.engine.flushNow();

    expect(ctx.engine.state.blockedCount).toBe(0);
    expect(ctx.engine.state.pendingCount).toBe(0);
    expect(ctx.gateway.files.get("a.md")?.content).toBe("doomed");
  });

  it("remembers why it stopped, so the reason can be shown", async () => {
    ctx.gateway.files.set("a.md", { content: "old", sha: "sha-original" });
    ctx.gateway.failNext = 99;

    await ctx.engine.recordUpsert(makeNote(), "doomed");
    for (let i = 0; i < 6; i += 1) await ctx.timers.tick();

    expect((await ctx.db.listQueue())[0]?.lastError).toContain("server error");
  });

  /**
   * Healing the damage the old discard left behind.
   *
   * Fixing the discard stops new notes being stranded. It does nothing for the
   * ones already sitting on somebody's device, dirty, with no queue entry and
   * an "All changes saved" label above them — and those are the ones with
   * writing in them.
   */
  it("re-queues a dirty note that nothing is left to push", async () => {
    const stranded = makeNote({ content: "words nobody pushed", dirty: true });
    await ctx.db.putNote(stranded);

    const recovered = await ctx.engine.recoverStrandedEdits("ws", (note) => note.content);

    expect(recovered).toBe(1);
    expect(ctx.engine.state.pendingCount).toBe(1);

    await ctx.engine.flushNow();
    expect(ctx.gateway.files.get("a.md")?.content).toBe("words nobody pushed");
  });

  it("leaves a note that is already in sync alone", async () => {
    await ctx.db.putNote(makeNote({ dirty: false }));

    expect(await ctx.engine.recoverStrandedEdits("ws", (n) => n.content)).toBe(0);
    expect(ctx.engine.state.pendingCount).toBe(0);
  });

  it("does not queue a second copy of something already queued", async () => {
    await ctx.engine.recordUpsert(makeNote(), "already queued");
    expect(ctx.engine.state.pendingCount).toBe(1);

    expect(await ctx.engine.recoverStrandedEdits("ws", (n) => n.content)).toBe(0);
    expect(ctx.engine.state.pendingCount).toBe(1);
  });

  it("notifies subscribers as the status changes", async () => {
    const seen: string[] = [];
    ctx.engine.subscribe((state) => seen.push(state.status));

    ctx.gateway.files.set("a.md", { content: "old", sha: "sha-original" });
    await ctx.engine.recordUpsert(makeNote(), "x");
    await ctx.timers.tick();

    expect(seen).toContain("pending");
    expect(seen).toContain("syncing");
    expect(seen.at(-1)).toBe("idle");
  });
});

describe("sync modes", () => {
  it("defaults to auto, preserving the behaviour the app shipped with", async () => {
    const { engine, gateway, timers } = setup();

    await engine.recordUpsert(makeNote(), "hello");
    expect(engine.state.mode).toBe("auto");
    expect(timers.delay).toBe(1000);

    await timers.tick();
    expect(gateway.commits).toHaveLength(1);
  });

  it("schedules nothing at all in manual mode", async () => {
    const { engine, gateway, timers } = setup({ mode: "manual" });

    await engine.recordUpsert(makeNote(), "hello");

    expect(timers.scheduled).toBe(false);
    expect(gateway.commits).toHaveLength(0);
    // The local write already happened, so nothing is at risk while it waits.
    expect(engine.state.status).toBe("pending");
    expect(engine.state.pendingCount).toBe(1);
  });

  it("still pushes on demand in manual mode", async () => {
    const { engine, gateway } = setup({ mode: "manual" });

    await engine.recordUpsert(makeNote(), "hello");
    await engine.flushNow();

    expect(gateway.commits).toHaveLength(1);
  });

  it("waits the configured interval rather than the debounce", async () => {
    const { engine, timers } = setup({ mode: "interval", intervalMinutes: 10 });

    await engine.recordUpsert(makeNote(), "hello");

    expect(timers.delay).toBe(10 * 60_000);
  });

  it("flushes what is already queued when auto is turned back on", async () => {
    const { engine, gateway, timers } = setup({ mode: "manual" });

    await engine.recordUpsert(makeNote(), "hello");
    expect(timers.scheduled).toBe(false);

    engine.setMode("auto");
    expect(timers.scheduled).toBe(true);

    await timers.tick();
    expect(gateway.commits).toHaveLength(1);
  });

  it("cancels a pending push when switching to manual", async () => {
    const { engine, timers } = setup();

    await engine.recordUpsert(makeNote(), "hello");
    expect(timers.scheduled).toBe(true);

    engine.setMode("manual");
    expect(timers.scheduled).toBe(false);
  });

  it("reports the current mode in its state", () => {
    const { engine } = setup({ mode: "interval", intervalMinutes: 5 });
    expect(engine.state.mode).toBe("interval");

    engine.setMode("manual");
    expect(engine.state.mode).toBe("manual");
  });

  it("takes a new interval along with the mode", async () => {
    const { engine, timers } = setup();

    engine.setMode("interval", 30);
    await engine.recordUpsert(makeNote(), "hello");

    expect(timers.delay).toBe(30 * 60_000);
  });
});

// ─── Handing the queue to someone else ──────────────────────────────────────

describe("pendingFor and discardPending", () => {
  /**
   * These exist for the propose-changes flow. A branch created from the base
   * holds nothing, so the pull request dialog has to commit the queue onto it
   * directly — which means reading the queue, and then making sure the same
   * work is not pushed a second time to whatever branch comes next.
   */

  it("reports one workspace's changes without the others'", async () => {
    const { engine } = setup({ mode: "manual" });
    await engine.start();

    await engine.recordUpsert(makeNote({ id: "one::a.md", workspaceId: "one", path: "a.md" }), "a");
    await engine.recordUpsert(makeNote({ id: "two::b.md", workspaceId: "two", path: "b.md" }), "b");

    expect(engine.pendingFor("one").map((c) => c.path)).toEqual(["a.md"]);
    expect(engine.pendingFor()).toHaveLength(2);
  });

  it("hands back a copy, so a caller cannot edit what is about to be pushed", async () => {
    const { engine } = setup({ mode: "manual" });
    await engine.start();
    await engine.recordUpsert(makeNote({ path: "a.md" }), "original");

    const [change] = engine.pendingFor("ws");
    change!.content = "tampered";

    expect(engine.pendingFor("ws")[0]!.content).toBe("original");
  });

  it("drops one workspace's queue from memory and from storage", async () => {
    const { engine, db } = setup({ mode: "manual" });
    await engine.start();

    await engine.recordUpsert(makeNote({ id: "one::a.md", workspaceId: "one", path: "a.md" }), "a");
    await engine.recordUpsert(makeNote({ id: "two::b.md", workspaceId: "two", path: "b.md" }), "b");

    await engine.discardPending("one");

    expect(engine.pendingFor("one")).toEqual([]);
    expect(engine.pendingFor("two")).toHaveLength(1);
    expect(engine.state.pendingCount).toBe(1);
    // Not just in memory: a reload must not bring them back.
    expect(await db.listQueue("one")).toEqual([]);
    expect(await db.listQueue("two")).toHaveLength(1);
  });

  it("never pushes what was discarded", async () => {
    const { engine, gateway, timers } = setup({ mode: "manual" });
    await engine.start();
    await engine.recordUpsert(makeNote({ path: "a.md" }), "a");

    await engine.discardPending("ws");
    await engine.flushNow();
    await timers.tick();

    expect(gateway.commits).toHaveLength(0);
  });

  it("is a no-op for a workspace with nothing queued", async () => {
    const { engine } = setup({ mode: "manual" });
    await engine.start();

    await expect(engine.discardPending("nobody")).resolves.toBeUndefined();
  });
});

/**
 * One change the server will never accept.
 *
 * A flush is a single commit, so a change GitHub refuses outright fails the
 * commit carrying everybody else's writing too — and keeps failing it, every
 * retry, until the whole queue is blocked and the status bar just says
 * "couldn't sync" forever.
 */
describe("a change the server refuses", () => {
  it("does not stop the rest of the queue from reaching GitHub", async () => {
    const ctx = setup();
    ctx.gateway.rejects.add("assets/ghost.png");

    await ctx.engine.recordUpsert(makeNote({ path: "a.md", baseSha: null }), "a");
    await ctx.engine.recordUpsert(makeNote({ id: "ws::b.md", path: "b.md", baseSha: null }), "b");
    await ctx.engine.recordAssetDelete("ws", "assets/ghost.png");

    await ctx.timers.tick();

    // The two notes landed, in whatever grouping the split produced.
    const written = ctx.gateway.commits.flatMap((commit) =>
      commit.changes.map((change) => change.path),
    );
    expect(written).toContain("a.md");
    expect(written).toContain("b.md");
    expect(written).not.toContain("assets/ghost.png");

    // And the one that failed is still queued, described by its own error.
    const queued = await ctx.db.listQueue("ws");
    expect(queued.map((item) => item.path)).toEqual(["assets/ghost.png"]);
    expect(queued[0]?.lastError).toContain("BadObjectState");
  });

  it("does not split a failure that has nothing to do with the content", async () => {
    const ctx = setup();
    ctx.gateway.failNext = 1;

    await ctx.engine.recordUpsert(makeNote({ path: "a.md", baseSha: null }), "a");
    await ctx.engine.recordUpsert(makeNote({ id: "ws::b.md", path: "b.md", baseSha: null }), "b");

    await ctx.timers.tick();

    // One attempt at the batch, not one per half.
    const queued = await ctx.db.listQueue("ws");
    expect(queued).toHaveLength(2);
    expect(queued.every((item) => item.attempts === 1)).toBe(true);
  });
});
