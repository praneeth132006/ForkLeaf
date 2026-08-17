import type { Note, NoteFrontmatter, TreeNode, Workspace } from "@mdnotion/types";
import {
  parseDocument,
  serializeDocument,
  deriveTitle,
  joinPath,
  slugifyFilename,
  uniquePath,
} from "@mdnotion/markdown-engine";
import type { LocalDatabase, RemoteGateway } from "./ports";
import type { SyncEngine } from "./sync-engine";

export interface NoteRepositoryOptions {
  db: LocalDatabase;
  gateway: RemoteGateway;
  sync: SyncEngine;
  now?: () => Date;
}

/**
 * The API the UI actually talks to.
 *
 * Everything here resolves from local storage first and reaches for the network
 * only when it must, so opening a note is instant on a second visit and works
 * with no connection at all.
 */
export class NoteRepository {
  private readonly db: LocalDatabase;
  private readonly gateway: RemoteGateway;
  private readonly sync: SyncEngine;
  private readonly now: () => Date;

  constructor(options: NoteRepositoryOptions) {
    this.db = options.db;
    this.gateway = options.gateway;
    this.sync = options.sync;
    this.now = options.now ?? (() => new Date());
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
          updatedAt: this.now().toISOString(),
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
    const nextFrontmatter = frontmatter ?? note.frontmatter;
    const updated: Note = {
      ...note,
      content,
      frontmatter: nextFrontmatter,
      updatedAt: this.now().toISOString(),
      dirty: true,
    };

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

    const frontmatter: NoteFrontmatter = {
      title: options.title,
      created: timestamp,
    };
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
    await this.sync.recordDelete(note);
  }

  async renameNote(note: Note, toPath: string): Promise<Note> {
    const content = serializeDocument(note.content, note.frontmatter);
    await this.sync.recordRename(note, toPath, content);
    return { ...note, id: noteId(note.workspaceId, toPath), path: toPath };
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
