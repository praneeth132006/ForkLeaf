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

function repository(files: Record<string, string>, allPaths?: string[]) {
  const db = new MemoryDatabase();
  const committed: { op: string; path: string; toPath?: string }[] = [];

  const gateway: RemoteGateway = {
    listTree: async () => [],
    // What the repository actually holds, images included. Defaults to the
    // notes, so tests that do not care about images need say nothing.
    listAllPaths: async () => allPaths ?? Object.keys(files),
    readFile: async (_workspaceId, path) =>
      files[path] === undefined ? null : { content: files[path]!, sha: `sha-${path}` },
    commit: async (input) => {
      for (const change of input.changes) {
        committed.push({
          op: change.op,
          path: change.path,
          ...(change.toPath ? { toPath: change.toPath } : {}),
        });
      }
      return { sha: "c", blobShas: {}, squashed: false };
    },
  };

  const sync = new SyncEngine({ db, gateway });

  const notes = new NoteRepository({ db, gateway, sync });

  /** Everything queued for GitHub, whether or not it has flushed yet. */
  const queued = () =>
    sync.pendingFor(WS).map((change) => ({
      op: change.op,
      path: change.path,
      ...(change.toPath ? { toPath: change.toPath } : {}),
    }));

  return { db, notes, sync, committed, queued };
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

/**
 * Moving a note.
 *
 * Images are referenced relative to the note, which is what makes a note
 * render on github.com — and what makes moving the file break every one of
 * them unless the links move with it.
 */
describe("renameNote", () => {
  it("repoints relative images at the files they already named", async () => {
    const { notes, db } = repository({
      "SOC 101/Phishing/notes.md": "# Notes\n\n![shot](./assets/a.png)\n",
    });

    const opened = await notes.openNote(WS, "SOC 101/Phishing/notes.md");
    const moved = await notes.renameNote(opened, "OSINT/notes.md");

    expect(moved.content).toContain("![shot](../SOC%20101/Phishing/assets/a.png)");
    // And the copy that gets committed says the same thing.
    const stored = await db.getNote(`${WS}::OSINT/notes.md`);
    expect(stored?.content).toContain("../SOC%20101/Phishing/assets/a.png");
  });

  it("leaves a note renamed within its own folder untouched", async () => {
    const { notes } = repository({ "a/notes.md": "![shot](./assets/a.png)\n" });

    const opened = await notes.openNote(WS, "a/notes.md");
    const renamed = await notes.renameNote(opened, "a/better-name.md");

    expect(renamed.content).toContain("![shot](./assets/a.png)");
  });
});

/**
 * The credit a note carries into its repository.
 *
 * GitHub renders frontmatter as a table above the document and linkifies a URL
 * in it. A bare domain is just text somebody would have to retype.
 */
describe("the generator stamp", () => {
  it("is a link, not a word", async () => {
    const { notes } = repository({});

    const note = await notes.createNote({
      workspaceId: WS,
      title: "A note",
      folder: "",
      existingPaths: [],
    });

    expect(note.frontmatter.generator).toBe("https://forkleaf.vercel.app");
  });
});

/**
 * Deleting, when GitHub will not answer.
 *
 * The failure this covers is the one people hit: a sign-in expires, the queue
 * stops draining, and from then on deleting a note did nothing whatsoever —
 * the delete needed to read the note first, the read was refused, and the
 * refusal was swallowed. Then the tree refreshed and put everything back.
 */
describe("deleting without being able to read", () => {
  const tree = [
    {
      path: "notes",
      name: "notes",
      kind: "folder" as const,
      children: [
        { path: "notes/a.md", name: "a.md", kind: "file" as const, sha: "sha-a" },
        { path: "notes/b.md", name: "b.md", kind: "file" as const, sha: "sha-b" },
      ],
    },
  ];

  function signedOut() {
    const db = new MemoryDatabase();
    const unauthorized = Object.assign(new Error("Bad credentials"), { code: "unauthorized" });

    const gateway: RemoteGateway = {
      listTree: async () => tree,
      listAllPaths: async () => {
        throw unauthorized;
      },
      readFile: async () => {
        throw unauthorized;
      },
      commit: async () => {
        throw unauthorized;
      },
    };

    const sync = new SyncEngine({ db, gateway, isOnline: () => false });
    return { db, sync, notes: new NoteRepository({ db, gateway, sync }) };
  }

  it("deletes a note it was never able to open", async () => {
    const { notes, sync } = signedOut();

    await notes.deletePath(WS, "notes/a.md", "sha-a");

    const queued = sync.pendingFor(WS);
    expect(queued).toHaveLength(1);
    expect(queued[0]!.op).toBe("delete");
    expect(queued[0]!.path).toBe("notes/a.md");
    expect(queued[0]!.baseSha).toBe("sha-a");
  });

  it("keeps the deleted note out of the tree until the deletion is pushed", async () => {
    const { notes } = signedOut();

    await notes.deletePath(WS, "notes/a.md", "sha-a");

    const shown = await notes.getTree(WS);
    const paths = shown.flatMap((node) => node.children ?? []).map((node) => node.path);
    expect(paths).toEqual(["notes/b.md"]);
  });

  it("drops a folder once every note in it is gone", async () => {
    const { notes } = signedOut();

    await notes.deletePath(WS, "notes/a.md", "sha-a");
    await notes.deletePath(WS, "notes/b.md", "sha-b");

    expect(await notes.getTree(WS)).toEqual([]);
  });
});

/**
 * Deleting and moving a folder.
 *
 * A folder holds the pictures its notes use, in an `assets` directory inside
 * it. The tree the sidebar is built from lists Markdown only — correctly, it
 * is a notebook — so acting on a folder from that tree acted on the notes and
 * nothing else.
 *
 * Deleting a folder therefore removed its notes and left the images sitting on
 * github.com in a directory nothing pointed at any more, and with no note left
 * inside it, nothing in the app could reach the folder to try again. Moving a
 * folder left the images behind at the old path in the same way.
 */
describe("deleting a folder", () => {
  const files = {
    "Python 101/Introduction/what-is-python.md": "# What\n\n![shot](assets/a.png)\n",
    "Python 101/Introduction/why-learn-python.md": "# Why\n",
  };
  const all = [...Object.keys(files), "Python 101/Introduction/assets/a.png"];

  it("takes the images with it, not just the notes", async () => {
    const { notes, queued } = repository(files, all);

    await notes.deleteFolderContents(WS, "Python 101/Introduction", Object.keys(files));

    expect(
      queued()
        .map((change) => change.path)
        .sort(),
    ).toEqual([
      "Python 101/Introduction/assets/a.png",
      "Python 101/Introduction/what-is-python.md",
      "Python 101/Introduction/why-learn-python.md",
    ]);
    expect(queued().every((change) => change.op === "delete")).toBe(true);
  });

  it("leaves everything outside the folder alone", async () => {
    const { notes, queued } = repository(files, [...all, "Python 101/Concepts/other.md"]);

    await notes.deleteFolderContents(WS, "Python 101/Introduction", Object.keys(files));

    expect(queued().some((change) => change.path.includes("Concepts"))).toBe(false);
  });

  it("still deletes what it can when the repository cannot be listed", async () => {
    // Offline, or a token that has expired. The listing failure is swallowed
    // and the notes it already knows about still go — along with the images
    // those notes link to, which `deleteNote` finds by reading the Markdown.
    // That path is why the listing is a supplement rather than the only way
    // an image gets cleaned up.
    const db = new MemoryDatabase();
    const gateway: RemoteGateway = {
      listTree: async () => [],
      listAllPaths: async () => {
        throw new Error("offline");
      },
      readFile: async (_workspaceId, path) =>
        (files as Record<string, string>)[path] === undefined
          ? null
          : { content: (files as Record<string, string>)[path]!, sha: `sha-${path}` },
      commit: async () => ({ sha: "c", blobShas: {}, squashed: false }),
    };
    const sync = new SyncEngine({ db, gateway });
    const notes = new NoteRepository({ db, gateway, sync });

    await notes.deleteFolderContents(WS, "Python 101/Introduction", Object.keys(files));

    expect(
      sync
        .pendingFor(WS)
        .map((change) => change.path)
        .sort(),
    ).toEqual([
      "Python 101/Introduction/assets/a.png",
      "Python 101/Introduction/what-is-python.md",
      "Python 101/Introduction/why-learn-python.md",
    ]);
  });

  it("removes an image no note links to, which only the listing can find", async () => {
    // The case the listing exists for: a screenshot pasted and then cut from
    // the note, or one whose link was broken. Nothing in any Markdown points
    // at it, so reading the notes will never turn it up.
    const orphan = "Python 101/Introduction/assets/orphan.png";
    const { notes, queued } = repository(files, [...all, orphan]);

    await notes.deleteFolderContents(WS, "Python 101/Introduction", Object.keys(files));

    expect(queued().map((change) => change.path)).toContain(orphan);
  });
});

describe("moving a folder", () => {
  const files = {
    "Introduction/what-is-python.md": "# What\n\n![shot](assets/a.png)\n",
  };
  const all = [...Object.keys(files), "Introduction/assets/a.png"];

  it("carries the images along with the notes", async () => {
    const { notes, queued } = repository(files, all);

    await notes.moveFolderContents(WS, "Introduction", "Python 101/Introduction", [
      "Introduction/what-is-python.md",
    ]);

    const image = queued().find((change) => change.path.endsWith("a.png"));
    expect(image).toEqual({
      op: "move",
      path: "Introduction/assets/a.png",
      toPath: "Python 101/Introduction/assets/a.png",
    });
  });

  it("moves an image without re-uploading it", async () => {
    // `move` carries no content: the commit reuses the blob already in the
    // repository. Re-reading a megabyte of screenshot to change its name is
    // the thing this op exists to avoid.
    const { notes, sync } = repository(files, all);

    await notes.moveFolderContents(WS, "Introduction", "Python 101/Introduction", [
      "Introduction/what-is-python.md",
    ]);

    const image = sync.pendingFor(WS).find((change) => change.path.endsWith("a.png"));
    expect(image?.content).toBeUndefined();
  });

  it("renames the notes, so their links are rewritten", async () => {
    const { notes, queued } = repository(files, all);

    await notes.moveFolderContents(WS, "Introduction", "Python 101/Introduction", [
      "Introduction/what-is-python.md",
    ]);

    const note = queued().find((change) => change.path.endsWith(".md"));
    expect(note?.op).toBe("rename");
    expect(note?.toPath).toBe("Python 101/Introduction/what-is-python.md");
  });
});
