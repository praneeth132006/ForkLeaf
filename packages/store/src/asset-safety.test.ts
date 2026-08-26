import { describe, expect, it } from "vitest";
import type { RemoteGateway } from "./ports";
import { MemoryDatabase } from "./memory-db";
import { NoteRepository } from "./note-repository";
import { SyncEngine } from "./sync-engine";

/**
 * Deleting a note must not delete pictures another note is still using.
 *
 * Reported from a real repository, and the sequence is worth writing down
 * because every step of it was reasonable:
 *
 *   1. A note with a dozen screenshots in it was renamed.
 *   2. A copy of it appeared at the old path.
 *   3. The copy was deleted, being a copy.
 *   4. Every image in the surviving note turned into a broken link on GitHub.
 *
 * Step 4 is this file. `deleteNote` removed every asset the deleted note's
 * text pointed at, and the copy pointed at exactly the same files as the note
 * that was being kept — so deleting the duplicate deleted the originals'
 * pictures out from under it. The note was left intact, still linking to a
 * dozen paths that no longer held anything, which is precisely the state that
 * cannot be undone from inside the app.
 */

const WS = "octo/notes@main:";

function repository(files: Record<string, string>) {
  const db = new MemoryDatabase();
  const committed: { op: string; path: string; toPath?: string }[] = [];

  const gateway: RemoteGateway = {
    listTree: async () => [],
    listAllPaths: async () => Object.keys(files),
    readFile: async (_workspaceId, path) =>
      files[path] === undefined ? null : { content: files[path]!, sha: `sha-${path}` },
    commit: async (input) => {
      const blobShas: Record<string, string> = {};
      for (const change of input.changes) {
        committed.push({
          op: change.op,
          path: change.path,
          ...(change.toPath ? { toPath: change.toPath } : {}),
        });
        // What GitHub reports back: the blob now at the path it was written
        // to, which for a rename is the new one.
        const landed = change.toPath ?? change.path;
        if (change.op !== "delete") blobShas[landed] = `sha-${landed}`;
      }
      return { sha: "c", blobShas, squashed: false };
    },
  };

  const sync = new SyncEngine({ db, gateway });
  const notes = new NoteRepository({ db, gateway, sync });

  const queued = () =>
    sync.pendingFor(WS).map((change) => ({
      op: change.op,
      path: change.path,
      ...(change.toPath ? { toPath: change.toPath } : {}),
    }));

  return { db, notes, sync, committed, queued };
}

const IMAGE = "1. Introduction/assets/2026-08-26-shot-ab12.png";
const NOTE_A = "1. Introduction/1.1-a-day.md";
const NOTE_B = "1. Introduction/1.1-a-day-copy.md";
const BODY = "# A day\n\n![13539.png](assets/2026-08-26-shot-ab12.png)\n";

async function withAsset(db: MemoryDatabase, path = IMAGE) {
  await db.putAsset({
    id: `${WS}::${path}`,
    workspaceId: WS,
    path,
    mimeType: "image/png",
    data: "AAAA",
    createdAt: new Date(0).toISOString(),
    pushed: true,
  });
}

describe("deleting a note that shares its pictures", () => {
  it("keeps an image another note still points at", async () => {
    const { db, notes, queued } = repository({ [NOTE_A]: BODY, [NOTE_B]: BODY });
    await withAsset(db);

    // Both notes open, both pointing at the same file — which is what a
    // duplicate of a note is.
    await notes.openNote(WS, NOTE_A);
    const copy = await notes.openNote(WS, NOTE_B);

    await notes.deleteNote(copy);

    expect(queued().filter((change) => change.path === IMAGE)).toHaveLength(0);
    expect(await db.getAsset(`${WS}::${IMAGE}`)).toBeDefined();
  });

  it("still removes an image nothing else points at", async () => {
    const { db, notes, queued } = repository({ [NOTE_A]: BODY });
    await withAsset(db);

    const note = await notes.openNote(WS, NOTE_A);
    await notes.deleteNote(note);

    expect(queued()).toContainEqual({ op: "delete", path: IMAGE });
    expect(await db.getAsset(`${WS}::${IMAGE}`)).toBeUndefined();
  });

  it("counts a reference in any of the forms a note can carry it", async () => {
    const html = '# A day\n\n<img src="assets/2026-08-26-shot-ab12.png" alt="shot">\n';
    const { db, notes } = repository({ [NOTE_A]: BODY, [NOTE_B]: html });
    await withAsset(db);

    await notes.openNote(WS, NOTE_A);
    const other = await notes.openNote(WS, NOTE_B);
    await notes.deleteNote(other);

    // The `<img>` note is the one being deleted; the markdown one keeps it.
    expect(await db.getAsset(`${WS}::${IMAGE}`)).toBeDefined();
  });
});

describe("renaming a note", () => {
  it("leaves nothing behind at the old path", async () => {
    const { notes, sync, committed } = repository({ [NOTE_A]: BODY });

    const note = await notes.openNote(WS, NOTE_A);
    await notes.renameNote(note, NOTE_B);
    await sync.flushNow();

    // A rename, not an add: an upsert at the new path with no delete of the
    // old one is how the same note ends up in the repository twice.
    expect(committed).toContainEqual({ op: "rename", path: NOTE_A, toPath: NOTE_B });
    expect(committed.filter((change) => change.op === "upsert")).toHaveLength(0);
  });

  it("records what the renamed note is now based on, so a second rename moves it too", async () => {
    const { db, notes, sync, committed } = repository({ [NOTE_A]: BODY });

    const note = await notes.openNote(WS, NOTE_A);
    const renamed = await notes.renameNote(note, NOTE_B);
    await sync.flushNow();

    const stored = await db.getNote(renamed.id);
    // Without this the note looks like one that has never been pushed, and the
    // *next* rename is recorded as a fresh file at the new path — leaving the
    // one just written sitting there as a duplicate.
    expect(stored?.baseSha).toBe(`sha-${NOTE_B}`);

    committed.length = 0;
    const third = "1. Introduction/1.1-final.md";
    await notes.renameNote({ ...renamed, baseSha: stored?.baseSha ?? null }, third);
    await sync.flushNow();

    expect(committed).toContainEqual({ op: "rename", path: NOTE_B, toPath: third });
  });
});
