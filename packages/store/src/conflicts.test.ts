import { describe, it, expect, beforeEach } from "vitest";
import type { Note, TreeNode } from "@forkleaf/types";
import { SyncEngine } from "./sync-engine";
import { MemoryDatabase } from "./memory-db";
import type { RemoteCommitInput, RemoteGateway } from "./ports";

/**
 * Conflict handling, under conditions that are not polite.
 *
 * "Nothing is silently overwritten" is the claim ForkLeaf asks people to trust
 * it on, and the existing suite only exercised the happy path of each
 * resolution. What is actually dangerous is everything around it: a second
 * remote edit landing between detecting a conflict and resolving it, the
 * network flapping while a resolution is in flight, two notes conflicting at
 * once, a resolution arriving twice, and clocks that disagree.
 *
 * Every test here asserts the same underlying property in a different
 * situation — that no version of anybody's text disappears without the user
 * having chosen for it to.
 */

// ─── Test doubles ───────────────────────────────────────────────────────────

class FlakyGateway implements RemoteGateway {
  commits: RemoteCommitInput[] = [];
  files = new Map<string, { content: string; sha: string }>();
  online = true;
  /** Fail this many of the next commits before letting one through. */
  failNext = 0;
  /** Runs before each read, so a test can move the remote mid-flight. */
  beforeRead: ((path: string) => void) | null = null;
  private counter = 0;

  async listTree(): Promise<TreeNode[]> {
    return [];
  }

  async readFile(_workspaceId: string, path: string) {
    if (!this.online) throw new Error("offline");
    this.beforeRead?.(path);
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
    tick: async () => {
      const fn = pending;
      pending = null;
      fn?.();
      await new Promise((resolve) => setTimeout(resolve, 0));
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

function setup() {
  const db = new MemoryDatabase();
  const gateway = new FlakyGateway();
  const timers = fakeTimers();
  let online = true;
  // A clock the test controls, so "which write won" is never decided by how
  // fast the machine running the suite happens to be.
  let clock = Date.parse("2026-01-01T00:00:00.000Z");

  const engine = new SyncEngine({
    db,
    gateway,
    debounceMs: 1000,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    isOnline: () => online,
    now: () => new Date(clock),
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
    advance(ms: number) {
      clock += ms;
    },
    /** Moves the clock backwards, as an out-of-sync device would. */
    rewind(ms: number) {
      clock -= ms;
    },
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("conflicts under adversarial conditions", () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(async () => {
    ctx = setup();
    await ctx.engine.start();
  });

  it("keeps the local text intact while a conflict sits unresolved", async () => {
    ctx.gateway.files.set("a.md", { content: "theirs", sha: "sha-theirs" });

    // `recordUpsert` takes the note (what is stored) and the serialised file
    // text (what is pushed), so both have to say "mine" for this to be a
    // faithful stand-in for the user having typed it.
    await ctx.engine.recordUpsert(makeNote({ content: "mine", dirty: true }), "mine");
    await ctx.timers.tick();

    // The remote copy must not have been written over the local one just
    // because a conflict was detected.
    const stored = await ctx.db.getNote("ws::a.md");
    expect(stored!.content).toBe("mine");
    expect(stored!.dirty).toBe(true);
    expect(ctx.engine.state.conflicts[0]!.remoteContent).toBe("theirs");
  });

  it("does not push while a conflict is unresolved, however many times it is asked", async () => {
    ctx.gateway.files.set("a.md", { content: "theirs", sha: "sha-theirs" });
    await ctx.engine.recordUpsert(makeNote(), "mine");
    await ctx.timers.tick();

    await ctx.engine.flushNow();
    await ctx.engine.flushNow();

    expect(ctx.gateway.commits).toHaveLength(0);
    expect(ctx.gateway.files.get("a.md")!.content).toBe("theirs");
  });

  it("conflicts on two notes at once are tracked and resolved independently", async () => {
    ctx.gateway.files.set("a.md", { content: "theirs A", sha: "sha-a" });
    ctx.gateway.files.set("b.md", { content: "theirs B", sha: "sha-b" });

    await ctx.engine.recordUpsert(makeNote(), "mine A");
    await ctx.engine.recordUpsert(makeNote({ id: "ws::b.md", path: "b.md" }), "mine B");
    await ctx.timers.tick();

    expect(ctx.engine.state.conflicts).toHaveLength(2);

    await ctx.engine.resolveConflict("ws", "a.md", "keep-local");
    // Resolving one must not clear the other — that would silently drop the
    // decision the user has not made yet.
    expect(ctx.engine.state.conflicts.map((conflict) => conflict.path)).toEqual(["b.md"]);

    await ctx.timers.tick();
    expect(ctx.gateway.files.get("a.md")!.content).toBe("mine A");
    expect(ctx.gateway.files.get("b.md")!.content).toBe("theirs B");
  });

  it("re-conflicts rather than overwriting when the remote moves again mid-resolution", async () => {
    ctx.gateway.files.set("a.md", { content: "theirs v1", sha: "sha-v1" });
    await ctx.engine.recordUpsert(makeNote(), "mine");
    await ctx.timers.tick();
    expect(ctx.engine.state.conflicts).toHaveLength(1);

    // A third party commits again between the user seeing the conflict and
    // choosing. Keeping local must not blow that newer version away.
    ctx.gateway.files.set("a.md", { content: "theirs v2", sha: "sha-v2" });

    await ctx.engine.resolveConflict("ws", "a.md", "keep-local");
    await ctx.timers.tick();

    expect(ctx.engine.state.conflicts).toHaveLength(1);
    expect(ctx.engine.state.conflicts[0]!.remoteContent).toBe("theirs v2");
    expect(ctx.gateway.files.get("a.md")!.content).toBe("theirs v2");
  });

  it("keep-both never lets the two versions collide on one path", async () => {
    ctx.gateway.files.set("a.md", { content: "theirs", sha: "sha-theirs" });
    await ctx.engine.recordUpsert(makeNote(), "mine");
    await ctx.timers.tick();

    await ctx.engine.resolveConflict("ws", "a.md", "keep-both");
    await ctx.timers.tick();

    // Both texts survive, at two distinct paths.
    const paths = [...ctx.gateway.files.keys()].sort();
    expect(paths).toEqual(["a (local copy).md", "a.md"]);
    expect(ctx.gateway.files.get("a.md")!.content).toBe("theirs");
    expect(ctx.gateway.files.get("a (local copy).md")!.content).toBe("mine");
  });

  it("resolving the same conflict twice is harmless", async () => {
    ctx.gateway.files.set("a.md", { content: "theirs", sha: "sha-theirs" });
    await ctx.engine.recordUpsert(makeNote(), "mine");
    await ctx.timers.tick();

    await ctx.engine.resolveConflict("ws", "a.md", "keep-remote");
    // A double-click on the resolution button, or a second tab resolving the
    // same conflict, must not resurrect it or throw.
    await ctx.engine.resolveConflict("ws", "a.md", "keep-remote");

    expect(ctx.engine.state.conflicts).toHaveLength(0);
    const stored = await ctx.db.getNote("ws::a.md");
    expect(stored!.content).toBe("theirs");
  });

  it("resolving a conflict that does not exist does nothing", async () => {
    await expect(
      ctx.engine.resolveConflict("ws", "never-seen.md", "keep-local"),
    ).resolves.toBeUndefined();
    expect(ctx.engine.state.conflicts).toHaveLength(0);
  });

  it("survives the connection dropping between resolving and pushing", async () => {
    ctx.gateway.files.set("a.md", { content: "theirs", sha: "sha-theirs" });
    await ctx.engine.recordUpsert(makeNote(), "mine");
    await ctx.timers.tick();

    await ctx.engine.resolveConflict("ws", "a.md", "keep-local");

    ctx.setOnline(false);
    await ctx.timers.tick();
    // Nothing pushed, and the resolved edit is still queued rather than lost.
    expect(ctx.gateway.commits).toHaveLength(0);
    expect(ctx.engine.state.pendingCount).toBe(1);

    ctx.setOnline(true);
    await ctx.engine.retryNow();
    await ctx.timers.tick();

    expect(ctx.gateway.files.get("a.md")!.content).toBe("mine");
  });

  it("rapid disconnect and reconnect does not duplicate the queued change", async () => {
    await ctx.engine.recordUpsert(makeNote({ baseSha: null }), "v1");

    for (let cycle = 0; cycle < 5; cycle += 1) {
      ctx.setOnline(false);
      await ctx.timers.tick();
      ctx.setOnline(true);
      await ctx.engine.retryNow();
    }
    await ctx.timers.tick();

    // One note edited once is one queued change and one commit, no matter how
    // many times the network flapped underneath it.
    const queue = await ctx.db.listQueue();
    expect(queue.length).toBeLessThanOrEqual(1);
    expect(ctx.gateway.files.get("a.md")!.content).toBe("v1");
  });

  it("a failed push leaves the change queued and pushes it on the retry", async () => {
    ctx.gateway.files.set("a.md", { content: "old", sha: "sha-original" });
    ctx.gateway.failNext = 1;

    await ctx.engine.recordUpsert(makeNote(), "mine");
    await ctx.timers.tick();

    expect(ctx.engine.state.pendingCount).toBe(1);
    expect(ctx.gateway.files.get("a.md")!.content).toBe("old");

    await ctx.engine.retryNow();
    await ctx.timers.tick();

    expect(ctx.gateway.files.get("a.md")!.content).toBe("mine");
  });

  it("an edit arriving while the conflict is open is not lost", async () => {
    ctx.gateway.files.set("a.md", { content: "theirs", sha: "sha-theirs" });
    await ctx.engine.recordUpsert(makeNote(), "mine v1");
    await ctx.timers.tick();
    expect(ctx.engine.state.conflicts).toHaveLength(1);

    // The user keeps typing while the conflict dialog is up.
    ctx.advance(5_000);
    await ctx.engine.recordUpsert(makeNote({ dirty: true }), "mine v2");

    await ctx.engine.resolveConflict("ws", "a.md", "keep-local");
    await ctx.timers.tick();

    // The version that reaches GitHub is the latest one they typed, not the
    // stale copy captured when the conflict was raised.
    expect(ctx.gateway.files.get("a.md")!.content).toBe("mine v2");
  });

  it("a clock running backwards does not make an older edit win", async () => {
    await ctx.engine.recordUpsert(makeNote({ baseSha: null }), "first");
    await ctx.timers.tick();

    // A device whose clock is behind writes next. Ordering must come from the
    // queue, not from comparing timestamps.
    ctx.rewind(60 * 60 * 1000);
    const pushed = await ctx.db.getNote("ws::a.md");
    await ctx.engine.recordUpsert(pushed!, "second");
    await ctx.timers.tick();

    expect(ctx.gateway.files.get("a.md")!.content).toBe("second");
    expect(ctx.engine.state.conflicts).toHaveLength(0);
  });

  it("reports conflict status until the last one is resolved", async () => {
    ctx.gateway.files.set("a.md", { content: "x", sha: "sha-x" });
    ctx.gateway.files.set("b.md", { content: "y", sha: "sha-y" });

    await ctx.engine.recordUpsert(makeNote(), "mine A");
    await ctx.engine.recordUpsert(makeNote({ id: "ws::b.md", path: "b.md" }), "mine B");
    await ctx.timers.tick();
    expect(ctx.engine.state.status).toBe("conflict");

    await ctx.engine.resolveConflict("ws", "a.md", "keep-remote");
    expect(ctx.engine.state.status).toBe("conflict");

    await ctx.engine.resolveConflict("ws", "b.md", "keep-remote");
    expect(ctx.engine.state.status).not.toBe("conflict");
  });
});

/**
 * A "conflict" that is only a timestamp.
 *
 * Every save stamps `updated` and `editedBy`, so two devices holding the same
 * note produce files that differ while saying exactly the same thing. Asking
 * somebody to choose between them teaches them to dismiss the dialog without
 * reading it — and the next one will be about their actual writing.
 */
describe("differences that are only bookkeeping", () => {
  const body = "# Plan\n\nSame words on both sides.\n";
  const withStamp = (updated: string, editedBy: string) =>
    `---\ntitle: Plan\nupdated: ${updated}\neditedBy: ${editedBy}\ngenerator: https://forkleaf.vercel.app\n---\n\n${body}`;

  it("resolves itself instead of asking", async () => {
    const ctx = setup();
    ctx.gateway.files.set("plan.md", {
      content: withStamp("2026-08-20T10:00:00.000Z", "someone-else"),
      sha: "sha-remote",
    });

    await ctx.engine.recordUpsert(
      makeNote({ path: "plan.md", baseSha: "sha-original" }),
      withStamp("2026-08-21T10:00:00.000Z", "me"),
    );
    await ctx.timers.tick();

    expect(ctx.engine.state.conflicts).toHaveLength(0);
    expect(ctx.gateway.commits).toHaveLength(1);
    // Pushed against what is on GitHub now, so it lands rather than bouncing.
    expect(ctx.gateway.files.get("plan.md")?.content).toContain("2026-08-21");
  });

  it("still asks when the words themselves differ", async () => {
    const ctx = setup();
    ctx.gateway.files.set("plan.md", {
      content: withStamp("2026-08-20T10:00:00.000Z", "someone-else").replace(
        "Same words",
        "Different words",
      ),
      sha: "sha-remote",
    });

    await ctx.engine.recordUpsert(
      makeNote({ path: "plan.md", baseSha: "sha-original" }),
      withStamp("2026-08-21T10:00:00.000Z", "me"),
    );
    await ctx.timers.tick();

    expect(ctx.engine.state.conflicts).toHaveLength(1);
    expect(ctx.gateway.commits).toHaveLength(0);
  });
});
