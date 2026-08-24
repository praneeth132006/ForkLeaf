import type { Note, NoteFrontmatter, TreeNode, Workspace } from "@forkleaf/types";
import {
  parseDocument,
  serializeDocument,
  deriveTitle,
  joinPath,
  slugifyFilename,
  uniquePath,
} from "@forkleaf/markdown-engine";
import type { LocalDatabase, RemoteGateway } from "./ports";
import type { SyncEngine } from "./sync-engine";

export interface NoteRepositoryOptions {
  db: LocalDatabase;
  gateway: RemoteGateway;
  sync: SyncEngine;
  now?: () => Date;
  /**
   * Who is editing, for the note's provenance stamp.
   *
   * A function rather than a value because a session can begin, end or change
   * while this repository is alive, and a login captured at construction would
   * keep crediting whoever happened to be signed in when the tab opened.
   * Returns null in local mode, where there is no account to name.
   */
  author?: () => string | null;
}

/**
 * What wrote the file, recorded in the file.
 *
 * These notes are meant to be read on github.com and in other editors, and a
 * reader who finds one has no way of knowing what made it. GitHub renders
 * frontmatter as a table above the document, so this is both a credit and the
 * most direct route from someone else's repository back to the project.
 */
const GENERATOR = "ForkLeaf — https://github.com/praneeth132006/ForkLeaf";

/**
 * The API the UI actually talks to.
 *
 * Everything here resolves from local storage first and reaches for the network
 * only when it must, so opening a note is instant on a second visit and works
 * with no connection at all.
 */
/** The best date a note's own frontmatter can offer, if it offers one. */
function frontmatterTimestamp(frontmatter: NoteFrontmatter): string | null {
  for (const value of [frontmatter.updated, frontmatter.created]) {
    if (typeof value !== "string") continue;
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
  }
  return null;
}

export class NoteRepository {
  private readonly db: LocalDatabase;
  private readonly gateway: RemoteGateway;
  private readonly sync: SyncEngine;
  private readonly now: () => Date;
  private readonly author: () => string | null;

  constructor(options: NoteRepositoryOptions) {
    this.db = options.db;
    this.gateway = options.gateway;
    this.sync = options.sync;
    this.now = options.now ?? (() => new Date());
    this.author = options.author ?? (() => null);
  }

  /**
   * Refreshes the provenance a note carries into its repository.
   *
   * `updated` and `editedBy` answer the two questions anyone browsing a notes
   * repository on GitHub actually has — when was this last touched, and by
   * whom — without needing `git log`. They are deliberately the only fields
   * maintained automatically: a word count or a reading time would change on
   * every save and turn every commit diff into noise about nothing.
   *
   * Whatever else the note carries is preserved and ordered first, so a field
   * somebody added by hand is not shuffled to the bottom on the next keystroke.
   */
  private stamp(frontmatter: NoteFrontmatter): NoteFrontmatter {
    const editedBy = this.author();

    return {
      ...frontmatter,
      updated: this.now().toISOString(),
      ...(editedBy ? { editedBy } : {}),
      generator: GENERATOR,
    };
  }

  // ─── Workspaces ───────────────────────────────────────────────────────────

  listWorkspaces(): Promise<Workspace[]> {
    return this.db.listWorkspaces();
  }

  async addWorkspace(workspace: Workspace): Promise<void> {
    await this.db.putWorkspace(workspace);
  }

  async removeWorkspace(id: string): Promise<void> {
    // Only disconnects locally. The GitHub repository is never touched —
    // deleting somebody's repo is not a thing this app should ever do.
    await this.db.deleteWorkspace(id);
  }

  async touchWorkspace(id: string): Promise<void> {
    const workspace = await this.db.getWorkspace(id);
    if (workspace) {
      await this.db.putWorkspace({ ...workspace, lastOpenedAt: this.now().toISOString() });
    }
  }

  // ─── Tree ─────────────────────────────────────────────────────────────────

  /**
   * Returns the cached tree immediately, then refreshes from GitHub in the
   * background via `onUpdate`. The sidebar renders on the first call and
   * repaints when the network answers.
   */
  async getTree(workspaceId: string, onUpdate?: (tree: TreeNode[]) => void): Promise<TreeNode[]> {
    const cached = (await this.db.getTreeCache(workspaceId)) ?? [];

    const refresh = async () => {
      try {
        const fresh = await this.gateway.listTree(workspaceId);
        await this.db.putTreeCache(workspaceId, fresh);
        onUpdate?.(fresh);
      } catch {
        // Offline or rate limited: the cached tree stays on screen.
      }
    };

    if (cached.length === 0) {
      // Nothing cached, so there is nothing to show until the network answers.
      try {
        const fresh = await this.gateway.listTree(workspaceId);
        await this.db.putTreeCache(workspaceId, fresh);
        return fresh;
      } catch {
        return cached;
      }
    }

    void refresh();
    return cached;
  }

  // ─── Notes ────────────────────────────────────────────────────────────────

  /** Opens a note, preferring unpushed local edits over the remote copy. */
  async openNote(workspaceId: string, path: string): Promise<Note> {
    const id = noteId(workspaceId, path);
    const local = await this.db.getNote(id);

    // Local edits always win; pulling over them would discard the user's work.
    if (local?.dirty) return local;

    try {
      const remote = await this.gateway.readFile(workspaceId, path);
      if (remote) {
        const parsed = parseDocument(remote.content);
        const note: Note = {
          id,
          workspaceId,
          path,
          content: parsed.content,
          frontmatter: parsed.frontmatter,
          baseSha: remote.sha,
          // A read must not look like an edit. Any edit made here is still the
          // most recent one we know of; failing that, the note's own
          // frontmatter may say when it was written; failing that we genuinely
          // do not know, and `null` says so instead of inventing "just now".
          updatedAt: local?.updatedAt ?? frontmatterTimestamp(parsed.frontmatter),
          dirty: false,
          ...(local?.viewMode ? { viewMode: local.viewMode } : {}),
        };
        await this.db.putNote(note);
        return note;
      }
    } catch {
      // Offline: fall through to whatever we have cached.
    }

    if (local) return local;

    throw new Error(`Note not found: ${path}`);
  }

  /** Saves an edit locally and queues it for GitHub. Returns immediately. */
  async saveNote(note: Note, content: string, frontmatter?: NoteFrontmatter): Promise<Note> {
    const nextFrontmatter = this.stamp(frontmatter ?? note.frontmatter);

    // The note passed from the UI might have a stale baseSha if a background
    // sync finished and updated the database since the UI last read it.
    // Overwriting the database with the UI's stale baseSha causes the next
    // sync to falsely detect a conflict. Read the current baseSha from the
    // store first.
    const current = await this.db.getNote(`${note.workspaceId}::${note.path}`);
    const baseSha = current?.baseSha ?? note.baseSha;

    const updated: Note = {
      ...note,
      baseSha,
      content,
      frontmatter: nextFrontmatter,
      updatedAt: this.now().toISOString(),
      dirty: true,
    };

    // The IndexedDB write happens inside recordUpsert, in the same transaction
    // as the queue write.
    await this.sync.recordUpsert(updated, serializeDocument(content, nextFrontmatter));
    return updated;
  }

  /**
   * Creates a note, deriving a safe filename from the title and avoiding
   * collisions with anything already in the folder.
   */
  async createNote(options: {
    workspaceId: string;
    folder: string;
    title: string;
    content?: string;
    existingPaths: string[];
  }): Promise<Note> {
    const filename = `${slugifyFilename(options.title)}.md`;
    const path = uniquePath(joinPath(options.folder, filename), options.existingPaths);
    const timestamp = this.now().toISOString();

    // Title and creation date first, then the maintained fields, so the table
    // GitHub renders reads in the order somebody would ask the questions.
    const frontmatter: NoteFrontmatter = this.stamp({
      title: options.title,
      created: timestamp,
    });
    const content = options.content ?? `# ${options.title}\n\n`;

    const note: Note = {
      id: noteId(options.workspaceId, path),
      workspaceId: options.workspaceId,
      path,
      content,
      frontmatter,
      // Never pushed yet, so there is nothing to conflict against.
      baseSha: null,
      updatedAt: timestamp,
      dirty: true,
    };

    await this.sync.recordUpsert(note, serializeDocument(content, frontmatter));
    return note;
  }

  async deleteNote(note: Note): Promise<void> {
    const current = await this.db.getNote(note.id);
    await this.sync.recordDelete(current ?? note);
  }

  async renameNote(note: Note, toPath: string): Promise<Note> {
    const current = await this.db.getNote(note.id);
    const freshNote = current ?? note;

    const content = serializeDocument(freshNote.content, freshNote.frontmatter);
    await this.sync.recordRename(freshNote, toPath, content);
    return { ...freshNote, id: noteId(freshNote.workspaceId, toPath), path: toPath };
  }

  /** Persists the per-note editor mode without queueing a GitHub commit. */
  async setViewMode(note: Note, viewMode: Note["viewMode"]): Promise<void> {
    const stored = await this.db.getNote(note.id);
    if (stored) await this.db.putNote({ ...stored, ...(viewMode ? { viewMode } : {}) });
  }

  /** Every locally known note in a workspace, for search and the command palette. */
  listNotes(workspaceId: string): Promise<Note[]> {
    return this.db.listNotes(workspaceId);
  }

  title(note: Note): string {
    return deriveTitle(note.content, note.frontmatter.title, note.path);
  }
}

export function noteId(workspaceId: string, path: string): string {
  return `${workspaceId}::${path}`;
}
