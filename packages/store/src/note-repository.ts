import type { Note, NoteFrontmatter, TreeNode, Workspace } from "@forkleaf/types";
import {
  parseDocument,
  serializeDocument,
  deriveTitle,
  joinPath,
  slugifyFilename,
  uniquePath,
  rewriteRelativeLinks,
  isRelativeLink,
  resolveFromNote,
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
 *
 * Written in full, with its scheme, because that is what makes it a link
 * rather than a piece of text somebody has to retype: GitHub linkifies a URL
 * in that table and does nothing at all with a bare domain.
 */
const GENERATOR = "https://forkleaf.vercel.app";

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
        onUpdate?.(this.withPending(workspaceId, fresh));
      } catch {
        // Offline or rate limited: the cached tree stays on screen.
      }
    };

    if (cached.length === 0) {
      // Nothing cached, so there is nothing to show until the network answers.
      try {
        const fresh = await this.gateway.listTree(workspaceId);
        await this.db.putTreeCache(workspaceId, fresh);
        return this.withPending(workspaceId, fresh);
      } catch {
        return this.withPending(workspaceId, cached);
      }
    }

    void refresh();
    return this.withPending(workspaceId, cached);
  }

  /**
   * The repository's tree, corrected by what has not been pushed yet.
   *
   * Both trees this method is handed describe GitHub: the cache is the last
   * answer GitHub gave, and a refresh is the current one. Neither knows about
   * a note deleted thirty seconds ago and still sitting in the queue — so the
   * sidebar used to put deleted notes and deleted folders straight back on
   * screen the moment anything refreshed the tree, which is indistinguishable
   * from delete not working. With a queue that cannot drain — an expired
   * sign-in, no connection — they came back and stayed.
   *
   * Applying the queue on top makes the sidebar agree with what the person
   * did, and it stops agreeing the moment the deletion is really committed and
   * GitHub stops listing the path.
   */
  private withPending(workspaceId: string, tree: TreeNode[]): TreeNode[] {
    const pending = this.sync.pendingFor(workspaceId);
    if (pending.length === 0) return tree;

    // Images go through the same queue and are not part of the notebook; the
    // tree only ever lists Markdown.
    const markdown = (path: string) => path.toLowerCase().endsWith(".md");

    let next = tree;
    for (const change of pending) {
      if (change.op === "delete") {
        next = withoutPath(next, change.path);
      } else if (change.op === "rename") {
        next = withoutPath(next, change.path);
        if (change.toPath && markdown(change.toPath)) next = withPath(next, change.toPath);
      } else if (markdown(change.path)) {
        next = withPath(next, change.path);
      }
    }
    return next;
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

  /**
   * Deletes a note by path, whether or not it can be read first.
   *
   * Deleting used to require opening the note, because the delete is recorded
   * against the note's own base SHA. But opening reaches for GitHub, and when
   * GitHub will not answer — an expired token, no connection, a file that was
   * only ever listed in the tree and never opened — the read threw and the
   * delete never happened. Nothing was removed and nothing said why, which is
   * exactly the state where somebody most wants to be able to tidy up.
   *
   * So a note we cannot read is deleted on the strength of its path and the
   * SHA the tree already reported. That is all the commit needs.
   */
  async deletePath(workspaceId: string, path: string, sha?: string): Promise<void> {
    const id = noteId(workspaceId, path);
    const stored = await this.db.getNote(id);
    if (stored) {
      await this.deleteNote(stored);
      return;
    }

    let note: Note | null = null;
    try {
      note = await this.openNote(workspaceId, path);
    } catch {
      // Unreadable, which is not a reason to refuse to delete it.
    }

    await this.deleteNote(
      note ?? {
        id,
        workspaceId,
        path,
        content: "",
        frontmatter: {},
        baseSha: sha ?? null,
        updatedAt: null,
        dirty: false,
      },
    );
  }

  async deleteNote(note: Note): Promise<void> {
    const current = await this.db.getNote(note.id);
    const target = current ?? note;
    await this.sync.recordDelete(target);

    // Clean up assets referenced by this note so they don't linger on GitHub.
    const matches = Array.from(target.content.matchAll(/!\[.*?\]\(([^)]+)\)/g));
    for (const match of matches) {
      const src = match[1];
      if (!src || !isRelativeLink(src)) continue;

      const assetPath = resolveFromNote(target.path, src);
      const id = `${target.workspaceId}::${assetPath}`;
      const stored = await this.db.getAsset(id);

      /**
       * An asset that never reached GitHub must not be deleted from it.
       *
       * Asking git to remove a path that is not in the tree is not a no-op —
       * GitHub rejects the whole commit with `GitRPC::BadObjectState`, and
       * since a flush is one atomic commit, that one impossible deletion took
       * every note queued behind it down with it. The queue then retried the
       * same impossible commit forever, which is what "couldn't sync" that
       * never clears actually was.
       *
       * No local record means the note came from the repository and its images
       * are presumed to be there too, which is the case worth attempting.
       */
      if (!stored || stored.pushed) {
        await this.sync.recordAssetDelete(target.workspaceId, assetPath);
      }

      // Local copy goes either way: the note that used it is gone.
      await this.db.deleteAsset(id);
    }
  }

  /**
   * Every file under a folder, notes and images alike.
   *
   * The sidebar's tree is Markdown only, which is right for a sidebar and
   * wrong for acting on a folder as a whole: the pictures a folder's notes use
   * live in an `assets` directory inside it, and that directory is invisible
   * to a tree that lists nothing but `.md`.
   *
   * The consequence was that deleting a folder deleted its notes and left its
   * images behind, in a directory nothing pointed at any more — so a folder
   * "deleted" in the app was still sitting on github.com, holding files, and
   * unreachable from the app that made it. Renaming had the same shape: the
   * notes moved, the images stayed.
   *
   * Falls back to the notes it already knows about when the repository cannot
   * be listed. A folder that cannot be enumerated is still a folder somebody
   * asked to delete, and removing the notes is better than removing nothing.
   */
  private async pathsUnder(
    workspaceId: string,
    folder: string,
    known: string[],
  ): Promise<string[]> {
    const prefix = `${folder}/`;
    try {
      const all = await this.gateway.listAllPaths(workspaceId);
      const under = all.filter((path) => path.startsWith(prefix));

      // Union, not replacement: a note created moments ago is in `known` and
      // not yet in anything GitHub would list back.
      return [...new Set([...under, ...known.filter((path) => path.startsWith(prefix))])];
    } catch {
      return known.filter((path) => path.startsWith(prefix));
    }
  }

  /**
   * Deletes a folder: every note in it, and every file beside them.
   *
   * `known` is what the sidebar believes is in there, which is the Markdown.
   * Anything else under the folder — images, and any other file a repository
   * may hold — is found by listing the repository and removed by path.
   */
  async deleteFolderContents(workspaceId: string, folder: string, known: string[]): Promise<void> {
    const markdown = (path: string) => path.toLowerCase().endsWith(".md");

    for (const path of await this.pathsUnder(workspaceId, folder, known)) {
      if (markdown(path)) {
        // By path: a folder is deleted as a whole, and one note inside it that
        // cannot be read is not a reason to abandon the rest halfway through.
        await this.deletePath(workspaceId, path);
      } else {
        await this.sync.recordAssetDelete(workspaceId, path);
        await this.db.deleteAsset(`${workspaceId}::${path}`);
      }
    }
  }

  /**
   * Moves every file under a folder to a new prefix.
   *
   * Notes go through `renameNote`, so their relative links are rewritten as
   * part of the move. Everything else is moved as bytes, which is why the
   * images have to move at all: leaving them behind worked — `renameNote`
   * repoints the links at wherever the file still is — but it left a stray
   * `assets` directory at the old path for every folder anybody ever
   * reorganised, and made "move this folder" quietly not move most of it.
   */
  async moveFolderContents(
    workspaceId: string,
    from: string,
    to: string,
    known: string[],
  ): Promise<void> {
    const markdown = (path: string) => path.toLowerCase().endsWith(".md");

    for (const path of await this.pathsUnder(workspaceId, from, known)) {
      const target = `${to}${path.slice(from.length)}`;

      if (markdown(path)) {
        let note: Note | null = (await this.db.getNote(noteId(workspaceId, path))) ?? null;
        if (!note) {
          try {
            note = await this.openNote(workspaceId, path);
          } catch {
            // Unreadable: move it as bytes rather than not at all. Its links
            // are relative to a folder that moved wholesale, so they still
            // resolve to the same files.
            note = null;
          }
        }

        if (note) await this.renameNote(note, target);
        else await this.sync.recordAssetMove(workspaceId, path, target);
      } else {
        await this.sync.recordAssetMove(workspaceId, path, target);
      }
    }
  }

  /**
   * Moves or renames a note, and takes its images with it.
   *
   * The links inside the note are relative to where the note sits — that is
   * what makes them work on github.com — so moving the file one folder across
   * silently repoints every image in it at a path that holds nothing. The
   * rewrite is part of the move rather than a follow-up commit: a note that is
   * moved but not repointed is a broken note, and there is no moment at which
   * anyone would want to see one.
   */
  async renameNote(note: Note, toPath: string): Promise<Note> {
    const current = await this.db.getNote(note.id);
    const stored = current ?? note;
    const freshNote: Note = {
      ...stored,
      content: rewriteRelativeLinks(stored.content, stored.path, toPath),
    };

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

/**
 * The tree without one path, and without any folder that path was the last
 * thing in.
 *
 * Leaving an empty folder behind would be a lie in the other direction: git
 * has no empty directories, so a folder whose every note has been deleted does
 * not exist in the repository either.
 */
function withoutPath(tree: TreeNode[], path: string): TreeNode[] {
  return tree
    .filter((node) => node.path !== path)
    .map((node) => (node.children ? { ...node, children: withoutPath(node.children, path) } : node))
    .filter((node) => node.kind !== "folder" || (node.children?.length ?? 0) > 0);
}

/** The tree with one path added, creating the folders on the way to it. */
function withPath(tree: TreeNode[], path: string): TreeNode[] {
  const segments = path.split("/");
  const name = segments.pop();
  if (!name) return tree;

  const insert = (nodes: TreeNode[], depth: number, prefix: string): TreeNode[] => {
    if (depth === segments.length) {
      if (nodes.some((node) => node.path === path)) return nodes;
      return sortNodes([...nodes, { path, name, kind: "file" as const }]);
    }

    const folderName = segments[depth]!;
    const folderPath = prefix ? `${prefix}/${folderName}` : folderName;
    const existing = nodes.find((node) => node.path === folderPath && node.kind === "folder");

    if (existing) {
      return nodes.map((node) =>
        node === existing
          ? { ...node, children: insert(node.children ?? [], depth + 1, folderPath) }
          : node,
      );
    }

    return sortNodes([
      ...nodes,
      {
        path: folderPath,
        name: folderName,
        kind: "folder" as const,
        children: insert([], depth + 1, folderPath),
      },
    ]);
  };

  return insert(tree, 0, "");
}

/** Folders first, then by name — the order the tree already arrives in. */
function sortNodes(nodes: TreeNode[]): TreeNode[] {
  return [...nodes].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}
