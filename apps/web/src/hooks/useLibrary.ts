"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  NoteRepository,
  SearchIndex,
  SyncEngine,
  openLocalDatabase,
  type LocalDatabase,
  type LocalDatabaseStatus,
  type SearchDoc,
  type SearchHit,
} from "@forkleaf/store";
import { workspaceId, type Note, type PendingChange, type Workspace } from "@forkleaf/types";
import { GitHubGateway, LocalGateway, fetchSession, type SessionResponse } from "@/lib/gateway";
import { buildIndex, flattenTree, isMarkdown, orphanedNotes, type IndexEntry } from "@/lib/library";
import { deriveTitle, extractTags } from "@forkleaf/markdown-engine";
import { LOCAL_WORKSPACE } from "@/lib/workspaces";

/**
 * Reads the whole library — every connected repository and every note in it —
 * and keeps it indexed for the dashboard.
 *
 * Separate from `useNotebook` on purpose. The notebook owns one workspace, the
 * open tabs and a sync engine that pushes what you type; the dashboard is a
 * read across all of them and must not start a second engine that would race
 * the first one for the same queue. This hook therefore never writes notes.
 */

export interface LibraryWorkspace {
  workspace: Workspace;
  entries: IndexEntry[];
  /** Unpushed changes queued for this repository. */
  pending: number;
  /** Set when this repository's tree could not be reached. */
  error: string | null;
}

export interface LibraryState {
  ready: boolean;
  session: SessionResponse | null;
  workspaces: LibraryWorkspace[];
  /**
   * True when the user is signed in to GitHub but has not chosen where their
   * notes live yet. The dashboard turns this into the first-run repo picker
   * instead of silently creating a repository on their account.
   */
  needsRepoChoice: boolean;
  /** True while notes are being read to fill in titles, tags and counts. */
  indexing: boolean;
  /** Whether local storage is real, held by another tab, or missing entirely. */
  storage: LocalDatabaseStatus;
  error: string | null;
  /**
   * The failure behind `error`, with GitHub's own code kept.
   *
   * A message alone cannot be explained usefully: "Not Found" means one thing
   * for a typo and quite another for a private repository a public-only token
   * cannot see, and those two need different instructions.
   */
  errorInfo: { code?: string; status?: number; message: string } | null;
  /**
   * Bumped whenever notes are added to the full-text index.
   *
   * The index is a mutable object in a ref — searching it is not a render, and
   * React has no way to know it changed. This is what lets a memoised search
   * recompute as background indexing fills the library in, without making the
   * index itself part of state and copying it on every batch.
   */
  searchVersion: number;
  /** How many notes the full-text index actually holds. */
  searchable: number;
}

/**
 * Shown when the browser will not give ForkLeaf durable local storage at all.
 *
 * The recoverable case — another tab holding the database — is `StorageBlocked`
 * instead, so this text stays about the case that cannot be recovered from.
 */
const STORAGE_UNAVAILABLE =
  "This browser will not let ForkLeaf use local storage, so your notes cannot be listed here. Leaving private browsing, or allowing site data for this page, fixes it.";

/** How many notes to read at once while filling in the index. */
const HYDRATE_BATCH = 6;
/**
 * Cap on notes read per workspace in one pass, to bound API calls.
 *
 * Each read is one request, but only ever once: `openNote` writes what it
 * fetched into IndexedDB, so the next visit builds those entries locally and
 * this pass has less to do until the repository grows.
 */
const HYDRATE_LIMIT = 150;

/**
 * How many full-text hits to take.
 *
 * Generous rather than a page: these are merged with the title and tag matches
 * and then paged by the dashboard, so cutting them here would silently drop
 * results the reader could otherwise have scrolled to.
 */
const SEARCH_LIMIT = 200;

export function useLibrary() {
  const [state, setState] = useState<LibraryState>({
    ready: false,
    session: null,
    workspaces: [],
    needsRepoChoice: false,
    indexing: false,
    storage: "ready",
    error: null,
    errorInfo: null,
    searchVersion: 0,
    searchable: 0,
  });

  /**
   * The full-text index over note bodies.
   *
   * A ref, not state: it is a few megabytes of postings that every keystroke
   * reads and nothing renders, and putting it in state would copy it on every
   * batch of the background read for no gain.
   */
  const searchRef = useRef<SearchIndex>(new SearchIndex());

  const dbRef = useRef<LocalDatabase | null>(null);
  const repoRef = useRef<NoteRepository | null>(null);
  const gatewayRef = useRef<GitHubGateway | LocalGateway | null>(null);

  const patch = useCallback((updates: Partial<LibraryState>) => {
    setState((current) => ({ ...current, ...updates }));
  }, []);

  /** Adds notes to the full-text index and tells React the index moved. */
  const indexNotes = useCallback((notes: Note[]) => {
    if (notes.length === 0) return;
    for (const note of notes) searchRef.current.add(searchDoc(note));

    setState((current) => ({
      ...current,
      searchVersion: current.searchVersion + 1,
      searchable: searchRef.current.size,
    }));
  }, []);

  /**
   * Drops notes from the full-text index.
   *
   * The counterpart to `indexNotes`, and needed for the same reason: the index
   * is a ref, so nothing else would ever take a deleted note back out of it.
   * Without this, a note deleted on GitHub kept answering searches for the
   * rest of the session, from the pass that indexed it before the tree said it
   * was gone.
   */
  const forgetNotes = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    for (const id of ids) searchRef.current.remove(id);

    setState((current) => ({
      ...current,
      searchVersion: current.searchVersion + 1,
      searchable: searchRef.current.size,
    }));
  }, []);

  /** Replaces one workspace's slice of the state, leaving the others alone. */
  const patchWorkspace = useCallback((id: string, updates: Partial<LibraryWorkspace>) => {
    setState((current) => ({
      ...current,
      workspaces: current.workspaces.map((entry) =>
        entry.workspace.id === id ? { ...entry, ...updates } : entry,
      ),
    }));
  }, []);

  // ── Load ────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const session = await fetchSession().catch((): SessionResponse => ({
          mode: "local",
          user: null,
          githubAvailable: false,
        }));
        if (cancelled) return;

        // Never throws: a browser that refuses IndexedDB gets an in-memory
        // store instead. That store is empty and dies with the tab, so the one
        // thing that must not happen is showing it as the user's library.
        const { db, status: storage } = await openLocalDatabase();
        if (storage === "blocked") {
          patch({ ready: true, storage });
          return;
        }
        const gateway = session.mode === "github" ? new GitHubGateway() : new LocalGateway();
        // The engine is created only so the repository can be, and is never
        // started: nothing on the dashboard pushes.
        const notes = new NoteRepository({
          db,
          gateway,
          sync: new SyncEngine({ db, gateway }),
        });

        dbRef.current = db;
        gatewayRef.current = gateway;
        repoRef.current = notes;

        let workspaces = await db.listWorkspaces();

        // First visit, from either direction: there is always somewhere to
        // write, even before a repository has been chosen.
        if (workspaces.length === 0) {
          await notes.addWorkspace(LOCAL_WORKSPACE);
          workspaces = [LOCAL_WORKSPACE];
        }

        if (gateway instanceof GitHubGateway) {
          for (const workspace of workspaces) gateway.register(workspace);
        }

        const queue = await db.listQueue();
        const connected = workspaces.filter((workspace) => !workspace.isLocal);

        // ── Pass one: this device only, so there is no network to wait on.
        //
        // The load used to await `listTree` for every connected repository
        // before the first paint, so opening the dashboard meant watching
        // "Reading your library…" for as long as GitHub took to answer — every
        // single visit, with last time's tree sitting unused in IndexedDB.
        const slices = await Promise.all(
          workspaces.map((workspace) => readWorkspace(db, workspace, queue)),
        );
        if (cancelled) return;

        // Everything already on this device is searchable before the first
        // paint: it costs one pass over notes that have just been read anyway.
        indexNotes(slices.flatMap((slice) => slice.notes));

        patch({
          ready: true,
          session,
          workspaces: sortWorkspaces(slices),
          needsRepoChoice: session.mode === "github" && connected.length === 0,
          storage,
          error: storage === "unavailable" ? STORAGE_UNAVAILABLE : null,
        });

        // ── Pass two: reconcile with GitHub, one repository at a time.
        //
        // Folded in as each answer arrives rather than awaited as a set, so a
        // slow repository does not hold up the rest of the library.
        const reconciled = await Promise.all(
          slices.map(async (slice) => {
            if (slice.workspace.isLocal) return slice;

            const fresh = await refreshWorkspace(db, gateway, slice);
            if (cancelled) return slice;

            forgetNotes(fresh.dropped);
            const merged = { ...slice, entries: fresh.entries, error: fresh.error };
            patchWorkspace(slice.workspace.id, {
              entries: fresh.entries,
              error: fresh.error,
            });
            return merged;
          }),
        );
        if (cancelled) return;

        void hydrate(reconciled);
      } catch (error) {
        if (!cancelled) {
          patch({
            ready: true,
            error: error instanceof Error ? error.message : "Could not read your library.",
            errorInfo: failureInfo(error, "Could not read your library."),
          });
        }
      }
    };

    /**
     * Fills in the entries that are still only paths.
     *
     * A freshly connected repository is a list of filenames and nothing else,
     * which is exactly the state where search and sorting are useless. Reading
     * the notes is what makes them real index entries — done after the first
     * paint, in small batches, so the dashboard is usable while it happens.
     */
    const hydrate = async (slices: LibraryWorkspace[]) => {
      const notes = repoRef.current;
      if (!notes) return;

      const work = slices.flatMap((slice) =>
        slice.entries
          .filter((entry) => !entry.indexed)
          .slice(0, HYDRATE_LIMIT)
          .map((entry) => ({ workspace: slice.workspace, path: entry.path })),
      );

      if (work.length === 0 || cancelled) return;
      patch({ indexing: true });

      for (let start = 0; start < work.length; start += HYDRATE_BATCH) {
        if (cancelled) return;

        const batch = work.slice(start, start + HYDRATE_BATCH);
        const read = await Promise.all(
          batch.map((item) => notes.openNote(item.workspace.id, item.path).catch(() => null)),
        );
        if (cancelled) return;

        indexNotes(read.filter((note): note is Note => note !== null));

        setState((current) => ({
          ...current,
          workspaces: current.workspaces.map((slice) => {
            const fresh = read.filter(
              (note): note is Note => note !== null && note.workspaceId === slice.workspace.id,
            );
            if (fresh.length === 0) return slice;
            return { ...slice, entries: mergeNotes(slice, fresh) };
          }),
        }));
      }

      if (!cancelled) patch({ indexing: false });
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [patch, patchWorkspace, indexNotes, forgetNotes]);

  // ── Actions ─────────────────────────────────────────────────────────────

  /** Adds a repository to the library and indexes it, without a page reload. */
  const addWorkspace = useCallback(
    async (workspace: Workspace) => {
      const db = dbRef.current;
      const notes = repoRef.current;
      const gateway = gatewayRef.current;
      if (!db || !notes || !gateway) return;

      await notes.addWorkspace(workspace);
      if (gateway instanceof GitHubGateway) gateway.register(workspace);

      const queue = await db.listQueue();
      const slice = await readWorkspace(db, workspace, queue);

      setState((current) => ({
        ...current,
        needsRepoChoice: false,
        workspaces: sortWorkspaces([
          ...current.workspaces.filter((entry) => entry.workspace.id !== workspace.id),
          slice,
        ]),
      }));

      // A repository just connected has nothing cached, so the network pass is
      // the only one that will put anything in it.
      const fresh = await refreshWorkspace(db, gateway, slice);
      forgetNotes(fresh.dropped);
      patchWorkspace(workspace.id, { entries: fresh.entries, error: fresh.error });
    },
    [patchWorkspace, forgetNotes],
  );

  /**
   * Disconnects a repository from this device.
   *
   * Local only, always: the notes, the queued changes and the cached tree go,
   * and the repository on GitHub is untouched. Everything that was pushed is
   * still in it, and connecting it again brings the lot back.
   */
  const removeWorkspace = useCallback(
    async (id: string) => {
      const db = dbRef.current;
      const notes = repoRef.current;
      if (!db || !notes) return;

      // Read before the delete: `removeWorkspace` takes the notes with it, and
      // afterwards there is no way left to know what to unindex.
      const stored = await db.listNotes(id).catch((): Note[] => []);

      await notes.removeWorkspace(id);
      if (gatewayRef.current instanceof GitHubGateway) gatewayRef.current.unregister(id);

      forgetNotes(stored.map((note) => note.id));

      setState((current) => ({
        ...current,
        workspaces: current.workspaces.filter((entry) => entry.workspace.id !== id),
      }));
    },
    [forgetNotes],
  );

  /**
   * Creates a note and hands back where it lives, so the dashboard can send
   * the user straight into the editor with it open.
   *
   * The note is saved locally and queued immediately; the push happens in the
   * editor, whose sync engine is the one that actually runs. That is why this
   * is always followed by a navigation rather than left as a dashboard-only
   * action.
   */
  const createNote = useCallback(
    async (title: string, workspace: Workspace, folder = "") => {
      const notes = repoRef.current;
      if (!notes) return null;

      const slice = state.workspaces.find((entry) => entry.workspace.id === workspace.id);
      const note = await notes.createNote({
        workspaceId: workspace.id,
        folder,
        title,
        existingPaths: slice?.entries.map((entry) => entry.path) ?? [],
      });

      patchWorkspace(workspace.id, {
        entries: mergeNotes(slice ?? { workspace, entries: [], pending: 0, error: null }, [note]),
      });

      return note;
    },
    [state.workspaces, patchWorkspace],
  );

  /**
   * Library-wide figures, including how much of the library they are based on.
   *
   * `read` is the part that matters. Word and diagram counts can only be
   * computed from notes that have actually been fetched, so on a freshly
   * connected repository they start near zero and climb as the background pass
   * works through it. Reporting the total without reporting the coverage is
   * what made the word count look like it was inventing words by itself.
   */
  const totals = useMemo(() => {
    const entries = state.workspaces.flatMap((slice) => slice.entries);

    return {
      notes: entries.length,
      words: entries.reduce((sum, entry) => sum + entry.words, 0),
      diagrams: entries.reduce((sum, entry) => sum + entry.diagrams, 0),
      read: entries.filter((entry) => entry.indexed).length,
      pending: state.workspaces.reduce((sum, slice) => sum + slice.pending, 0),
    };
  }, [state.workspaces]);

  /**
   * Ranks notes by what is written in them.
   *
   * Deliberately not memoised on the query: the caller holds the query and
   * knows when it changed, and memoising here would keep the last result set
   * alive for a search box that has since been cleared.
   */
  const searchText = useCallback(
    (query: string, workspaceId?: string): SearchHit[] =>
      searchRef.current.search(query, {
        limit: SEARCH_LIMIT,
        ...(workspaceId ? { workspaceId } : {}),
      }),
    [],
  );

  return useMemo(
    () => ({ ...state, totals, addWorkspace, removeWorkspace, createNote, searchText }),
    [state, totals, addWorkspace, removeWorkspace, createNote, searchText],
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * One workspace's index.
 *
 * The cached tree is used first so the dashboard paints immediately, and the
 * network copy replaces it when it arrives. A repository that cannot be
 * reached still shows whatever is stored on this device rather than an empty
 * page with an error on it.
 */
async function readWorkspace(
  db: LocalDatabase,
  workspace: Workspace,
  queue: PendingChange[],
): Promise<LibraryWorkspace & { notes: Note[] }> {
  const notes = await db.listNotes(workspace.id);
  const pending = queue.filter((item) => item.workspaceId === workspace.id).length;

  if (workspace.isLocal) {
    return { workspace, entries: buildIndex(workspace, [], notes), pending, error: null, notes };
  }

  const cached = await db.getTreeCache(workspace.id);

  // A cached tree is a real listing, so it is authoritative here too: last
  // visit's deletions must not reappear for as long as it takes GitHub to
  // answer. No cache at all is not a listing, and everything stored is shown.
  const entries = buildIndex(workspace, markdownOnly(flattenTree(cached ?? [])), notes, {
    treeKnown: cached != null,
  });

  // Only what the index kept is handed on to be searched. A note the cached
  // tree has already ruled out would otherwise be missing from the list and
  // findable by searching for it, which is a worse state than either.
  const listed = new Set(entries.map((entry) => entry.path));

  return {
    workspace,
    entries,
    pending,
    error: null,
    notes: notes.filter((note) => listed.has(note.path)),
  };
}

/**
 * Reconciles one workspace against GitHub.
 *
 * The tree is authoritative about which notes exist, so this is what removes a
 * note deleted from another device. A repository that cannot be reached keeps
 * whatever was already on screen rather than emptying itself.
 */
async function refreshWorkspace(
  db: LocalDatabase,
  gateway: GitHubGateway | LocalGateway,
  slice: LibraryWorkspace,
): Promise<{ entries: IndexEntry[]; error: string | null; dropped: string[] }> {
  try {
    const tree = await gateway.listTree(slice.workspace.id);
    await db.putTreeCache(slice.workspace.id, tree);

    const paths = markdownOnly(flattenTree(tree));
    const stored = await db.listNotes(slice.workspace.id);

    /**
     * The copies of notes that no longer exist, forgotten.
     *
     * Leaving them in IndexedDB is not harmless. Dropping them from the index
     * fixes what is on screen, but the next visit would read them back out of
     * storage and the full-text index would go on answering searches with
     * notes the repository does not have — findable, and opening nothing.
     */
    const orphans = orphanedNotes(paths, stored);
    for (const orphan of orphans) await db.deleteNote(orphan.id);

    const gone = new Set(orphans.map((orphan) => orphan.id));
    const notes = stored.filter((note) => !gone.has(note.id));

    return {
      entries: buildIndex(slice.workspace, paths, notes, { treeKnown: true }),
      error: null,
      dropped: [...gone],
    };
  } catch (error) {
    return {
      entries: slice.entries,
      error: error instanceof Error ? error.message : "Could not reach this repository.",
      dropped: [],
    };
  }
}

/** A stored note, as the full-text index wants it. */
function searchDoc(note: Note): SearchDoc {
  return {
    id: note.id,
    workspaceId: note.workspaceId,
    path: note.path,
    title: deriveTitle(note.content, note.frontmatter.title, note.path),
    tags: extractTags(note.content, note.frontmatter.tags),
    content: note.content,
  };
}

/** The tree carries every file in the repo; only markdown is a note. */
function markdownOnly(paths: string[]): string[] {
  return paths.filter(isMarkdown);
}

/** Folds freshly read notes into a workspace's entries, replacing by path. */
function mergeNotes(slice: LibraryWorkspace, notes: Note[]): IndexEntry[] {
  const paths = slice.entries.map((entry) => entry.path);
  const byPath = new Map(notes.map((note) => [note.path, note] as const));

  const kept = slice.entries
    .filter((entry) => !byPath.has(entry.path))
    .map((entry) => ({ path: entry.path, entry }));

  const rebuilt = buildIndex(
    slice.workspace,
    paths.filter((path) => byPath.has(path)),
    notes,
  );

  // Preserve the original path order so nothing jumps around mid-hydration;
  // the dashboard sorts the list itself anyway.
  const merged = new Map<string, IndexEntry>();
  for (const item of kept) merged.set(item.path, item.entry);
  for (const entry of rebuilt) merged.set(entry.path, entry);

  return [...merged.values()];
}

/** Connected repositories first, then most recently opened. */
function sortWorkspaces(slices: LibraryWorkspace[]): LibraryWorkspace[] {
  return [...slices].sort((a, b) => {
    if (a.workspace.isLocal !== b.workspace.isLocal) return a.workspace.isLocal ? 1 : -1;
    return b.workspace.lastOpenedAt.localeCompare(a.workspace.lastOpenedAt);
  });
}

export { workspaceId };

/** Keeps GitHub's own code alongside its message, for explaining afterwards. */
function failureInfo(
  error: unknown,
  fallback: string,
): { code?: string; status?: number; message: string } {
  const { code, status, message } = (error ?? {}) as {
    code?: string;
    status?: number;
    message?: string;
  };

  return {
    ...(code ? { code } : {}),
    ...(typeof status === "number" ? { status } : {}),
    message: message ?? fallback,
  };
}
