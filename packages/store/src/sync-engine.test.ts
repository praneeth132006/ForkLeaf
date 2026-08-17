import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Note, TreeNode } from "@forkleaf/types";
import { SyncEngine } from "./sync-engine";
import { MemoryDatabase } from "./memory-db";
import { coalesce, describeChanges } from "./queue";
import type { RemoteCommitInput, RemoteGateway } from "./ports";

// ─── Test doubles ───────────────────────────────────────────────────────────

class FakeGateway implements RemoteGateway {
  commits: RemoteCommitInput[] = [];
  /** Remote file state, keyed by path. */
  files = new Map<string, { content: string; sha: string }>();
  online = true;
  failNext = 0;
  private counter = 0;

  async listTree(): Promise<TreeNode[]> {
    return [];
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
  return {
    setTimeout: (fn: () => void) => {
      pending = fn;
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

function setup(options: { online?: boolean } = {}) {
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

  it("gives up on a change that keeps failing rather than blocking the queue forever", async () => {
    ctx.gateway.files.set("a.md", { content: "old", sha: "sha-original" });
    ctx.gateway.failNext = 99;

    await ctx.engine.recordUpsert(makeNote(), "doomed");
    for (let i = 0; i < 5; i += 1) await ctx.engine.flushNow();

    expect(ctx.engine.state.pendingCount).toBe(0);
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
