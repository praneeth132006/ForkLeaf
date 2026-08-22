"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  NoteRepository,
  SyncEngine,
  createLocalDatabase,
  indexedDbAvailable,
  type LocalDatabase,
} from "@forkleaf/store";
import { workspaceId, type Note, type PendingChange, type Workspace } from "@forkleaf/types";
import { GitHubGateway, LocalGateway, fetchSession, type SessionResponse } from "@/lib/gateway";
import { buildIndex, flattenTree, type IndexEntry } from "@/lib/library";
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
  error: string | null;
}

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

export function useLibrary() {
  const [state, setState] = useState<LibraryState>({
    ready: false,
    session: null,
    workspaces: [],
    needsRepoChoice: false,
    indexing: false,
    error: null,
  });

  const dbRef = useRef<LocalDatabase | null>(null);
  const repoRef = useRef<NoteRepository | null>(null);
  const gatewayRef = useRef<GitHubGateway | LocalGateway | null>(null);

  const patch = useCallback((updates: Partial<LibraryState>) => {
    setState((current) => ({ ...current, ...updates }));
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

        if (!indexedDbAvailable()) {
          patch({
            ready: true,
            session,
            error:
              "This browser is not letting ForkLeaf use local storage, so your notes cannot be listed here.",
          });
          return;
        }

        const db = await createLocalDatabase();
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

        patch({
          ready: true,
          session,
          workspaces: sortWorkspaces(slices),
          needsRepoChoice: session.mode === "github" && connected.length === 0,
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
  }, [patch, patchWorkspace]);

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
      patchWorkspace(workspace.id, { entries: fresh.entries, error: fresh.error });
    },
    [patchWorkspace],
  );

  const removeWorkspace = useCallback(async (id: string) => {
    const notes = repoRef.current;
    if (!notes) return;

    await notes.removeWorkspace(id);
    if (gatewayRef.current instanceof GitHubGateway) gatewayRef.current.unregister(id);

    setState((current) => ({
      ...current,
      workspaces: current.workspaces.filter((entry) => entry.workspace.id !== id),
    }));
  }, []);

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

  return useMemo(
    () => ({ ...state, totals, addWorkspace, removeWorkspace, createNote }),
    [state, totals, addWorkspace, removeWorkspace, createNote],
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
): Promise<LibraryWorkspace> {
  const notes = await db.listNotes(workspace.id);
  const pending = queue.filter((item) => item.workspaceId === workspace.id).length;

  if (workspace.isLocal) {
    return { workspace, entries: buildIndex(workspace, [], notes), pending, error: null };
  }

  const cached = await db.getTreeCache(workspace.id);

  return {
    workspace,
    entries: buildIndex(workspace, markdownOnly(flattenTree(cached ?? [])), notes),
    pending,
    error: null,
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
): Promise<{ entries: IndexEntry[]; error: string | null }> {
  try {
    const tree = await gateway.listTree(slice.workspace.id);
    await db.putTreeCache(slice.workspace.id, tree);

    const notes = await db.listNotes(slice.workspace.id);
    return {
      entries: buildIndex(slice.workspace, markdownOnly(flattenTree(tree)), notes),
      error: null,
    };
  } catch (error) {
    return {
      entries: slice.entries,
      error: error instanceof Error ? error.message : "Could not reach this repository.",
    };
  }
}

/** The tree carries every file in the repo; only markdown is a note. */
function markdownOnly(paths: string[]): string[] {
  return paths.filter((path) => /\.mdx?$/i.test(path));
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
