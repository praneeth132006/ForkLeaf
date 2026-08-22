import { describe, expect, it } from "vitest";
import type { RemoteGateway } from "./ports";
import { MemoryDatabase } from "./memory-db";
import { NoteRepository } from "./note-repository";
import { SyncEngine } from "./sync-engine";

/**
 * Opening a note is a read.
 *
 * The dashboard indexes a repository by opening every note in it, so anything
 * `openNote` writes is written across the whole library at once. Stamping the
 * current time on each one made a freshly connected repository report that all
 * 155 of its notes had been edited seconds ago, and made "recently edited" —
 * the dashboard's default order — meaningless.
 */

const WS = "octo/notes@main:";

function repository(files: Record<string, string>) {
  const db = new MemoryDatabase();

  const gateway: RemoteGateway = {
    listTree: async () => [],
    readFile: async (_workspaceId, path) =>
      files[path] === undefined ? null : { content: files[path]!, sha: `sha-${path}` },
    commit: async () => ({ sha: "c", blobShas: {}, squashed: false }),
  };

  const notes = new NoteRepository({
    db,
    gateway,
    sync: new SyncEngine({ db, gateway }),
  });

  return { db, notes };
}

describe("openNote", () => {
  it("does not claim a note was edited just because it was read", async () => {
    const { notes } = repository({ "a.md": "# A\n\nbody\n" });

    const note = await notes.openNote(WS, "a.md");

    expect(note.updatedAt).toBeNull();
    expect(note.dirty).toBe(false);
    expect(note.content).toContain("body");
  });

  it("takes a date from the note's own frontmatter when it has one", async () => {
    const { notes } = repository({
      "a.md": "---\nupdated: 2025-03-04T10:00:00.000Z\n---\n\n# A\n",
    });

    const note = await notes.openNote(WS, "a.md");

    expect(note.updatedAt).toBe("2025-03-04T10:00:00.000Z");
  });

  it("falls back to the created date when there is no updated date", async () => {
    const { notes } = repository({
      "a.md": "---\ncreated: 2024-01-02T00:00:00.000Z\n---\n\n# A\n",
    });

    expect((await notes.openNote(WS, "a.md")).updatedAt).toBe("2024-01-02T00:00:00.000Z");
  });

  it("ignores an unparseable frontmatter date rather than passing it through", async () => {
    const { notes } = repository({ "a.md": "---\nupdated: last tuesday\n---\n\n# A\n" });

    expect((await notes.openNote(WS, "a.md")).updatedAt).toBeNull();
  });

  it("keeps the edit timestamp of a note that was actually edited here", async () => {
    const { db, notes } = repository({ "a.md": "# A\n\nremote\n" });

    await db.putNote({
      id: `${WS}::a.md`,
      workspaceId: WS,
      path: "a.md",
      content: "# A\n\nlocal\n",
      frontmatter: {},
      baseSha: "sha-a.md",
      updatedAt: "2025-06-01T12:00:00.000Z",
      dirty: false,
    });

    const note = await notes.openNote(WS, "a.md");

    // The remote content wins — the local copy was clean — but the fact that
    // this note was once edited here is not thrown away.
    expect(note.content).toContain("remote");
    expect(note.updatedAt).toBe("2025-06-01T12:00:00.000Z");
  });

  it("returns local edits untouched rather than pulling over them", async () => {
    const { db, notes } = repository({ "a.md": "# A\n\nremote\n" });

    await db.putNote({
      id: `${WS}::a.md`,
      workspaceId: WS,
      path: "a.md",
      content: "# A\n\nunsaved work\n",
      frontmatter: {},
      baseSha: "sha-a.md",
      updatedAt: "2025-06-01T12:00:00.000Z",
      dirty: true,
    });

    const note = await notes.openNote(WS, "a.md");

    expect(note.content).toContain("unsaved work");
    expect(note.updatedAt).toBe("2025-06-01T12:00:00.000Z");
  });
});
