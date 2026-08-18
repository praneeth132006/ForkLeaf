"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  SyncEngine,
  NoteRepository,
  createLocalDatabase,
  type LocalDatabase,
  type RemoteGateway,
} from "@forkleaf/store";
import {
  workspaceId,
  type Note,
  type SyncState,
  type TreeNode,
  type Workspace,
  type EditorViewMode,
} from "@forkleaf/types";
import { dirname } from "@forkleaf/markdown-engine";
import {
  GitHubGateway,
  LocalGateway,
  fetchSession,
  bootstrapWorkspace,
  type SessionResponse,
} from "@/lib/gateway";

/**
 * The application's single source of truth.
 *
 * Owns the local database, the sync engine and the note repository, and exposes
 * them to the UI as plain state. Everything the editor does goes through here,
 * so there is exactly one place where "what happens when you type" is decided.
 */

const LOCAL_WORKSPACE: Workspace = {
  id: "local",
  name: "On this device",
  repo: { owner: "local", repo: "local", branch: "local", directory: "" },
  isDefault: true,
  isLocal: true,
  createdAt: new Date(0).toISOString(),
  lastOpenedAt: new Date(0).toISOString(),
};

export interface NotebookState {
  ready: boolean;
  session: SessionResponse | null;
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  tree: TreeNode[];
  /**
   * Every note the user currently has open, in tab order. Notes stay loaded
   * when you switch between them, so moving between two files you are editing
   * together is instant and neither loses its place.
   */
  openNotes: Note[];
  /** Path of the note the editor is showing. */
  activePath: string | null;
  sync: SyncState;
  error: string | null;
  /** Set while a slow operation (bootstrap, opening a note) is running. */
  busy: string | null;
}

/** Keys the open set is remembered under, so a reload reopens the same tabs. */
const openTabsKey = (workspace: string) => `openNotes:${workspace}`;
const activeTabKey = (workspace: string) => `activeNote:${workspace}`;

/** How many notes may be open at once, to bound memory and tab-strip width. */
const MAX_OPEN_NOTES = 12;

export function useNotebook() {
  const [state, setState] = useState<NotebookState>({
    ready: false,
    session: null,
    workspaces: [],
    activeWorkspace: null,
    tree: [],
    openNotes: [],
    activePath: null,
    sync: { status: "idle", pendingCount: 0, lastSyncedAt: null, lastError: null, conflicts: [] },
    error: null,
    busy: null,
  });

  // Long-lived singletons. Refs rather than state: replacing the sync engine
  // mid-session would drop the pending queue.
  const dbRef = useRef<LocalDatabase | null>(null);
  const gatewayRef = useRef<GitHubGateway | LocalGateway | null>(null);
  const syncRef = useRef<SyncEngine | null>(null);
  const repoRef = useRef<NoteRepository | null>(null);

  const patch = useCallback((updates: Partial<NotebookState>) => {
    setState((current) => ({ ...current, ...updates }));
  }, []);

  // ── Boot ────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      try {
        const session = await fetchSession().catch((): SessionResponse => ({
          mode: "local",
          user: null,
          githubAvailable: false,
        }));
        if (cancelled) return;

        const db = await createLocalDatabase();
        const gateway: RemoteGateway =
          session.mode === "github" ? new GitHubGateway() : new LocalGateway();

        const sync = new SyncEngine({ db, gateway });
        const notes = new NoteRepository({ db, gateway, sync });

        dbRef.current = db;
        gatewayRef.current = gateway as GitHubGateway | LocalGateway;
        syncRef.current = sync;
        repoRef.current = notes;

        sync.subscribe((syncState) => {
          if (!cancelled) setState((current) => ({ ...current, sync: syncState }));
        });
        await sync.start();

        // Restore known workspaces, or set one up on first run.
        let workspaces = await notes.listWorkspaces();

        if (session.mode === "github") {
          if (gateway instanceof GitHubGateway) {
            for (const workspace of workspaces) gateway.register(workspace);
          }

          if (workspaces.length === 0) {
            patch({ busy: "Setting up your notes repository…" });
            const result = await bootstrapWorkspace();
            const workspace: Workspace = {
              id: workspaceId(result.workspace),
              name: result.repo.name,
              repo: result.workspace,
              isDefault: true,
              isLocal: false,
              createdAt: new Date().toISOString(),
              lastOpenedAt: new Date().toISOString(),
            };
            await notes.addWorkspace(workspace);
            (gateway as GitHubGateway).register(workspace);
            workspaces = [workspace];
          }
        } else if (workspaces.length === 0) {
          await notes.addWorkspace(LOCAL_WORKSPACE);
          workspaces = [LOCAL_WORKSPACE];
        }

        if (cancelled) return;

        // Reopen whatever was open last.
        const lastId = await db.getMeta<string>("activeWorkspace");
        const active = workspaces.find((w) => w.id === lastId) ?? workspaces[0] ?? null;

        patch({ session, workspaces, activeWorkspace: active, ready: true, busy: null });
      } catch (error) {
        if (!cancelled) {
          patch({
            ready: true,
            busy: null,
            error: error instanceof Error ? error.message : "Could not start ForkLeaf.",
          });
        }
      }
    };

    void boot();
    return () => {
      cancelled = true;
    };
  }, [patch]);

  // ── Load the tree whenever the workspace changes ────────────────────────
  useEffect(() => {
    const workspace = state.activeWorkspace;
    const notes = repoRef.current;
    if (!workspace || !notes) return;

    let cancelled = false;

    const load = async () => {
      await dbRef.current?.putMeta("activeWorkspace", workspace.id);
      await notes.touchWorkspace(workspace.id);

      // Reopen the tabs this workspace had last time. A note that has since
      // been deleted simply fails to load and is left out.
      const remembered = (await dbRef.current?.getMeta<string[]>(openTabsKey(workspace.id))) ?? [];
      const rememberedActive = await dbRef.current?.getMeta<string>(activeTabKey(workspace.id));

      if (remembered.length > 0 && !cancelled) {
        const restored = (
          await Promise.all(
            remembered
              .slice(0, MAX_OPEN_NOTES)
              .map((path) => notes.openNote(workspace.id, path).catch(() => null)),
          )
        ).filter((note): note is Note => note !== null);

        if (!cancelled && restored.length > 0) {
          patch({
            openNotes: restored,
            activePath:
              restored.find((note) => note.path === rememberedActive)?.path ??
              restored[0]?.path ??
              null,
          });
        }
      }

      if (workspace.isLocal) {
        // Local mode has no remote tree; build one from what is stored.
        const localNotes = await notes.listNotes(workspace.id);
        if (!cancelled) {
          patch({
            tree: localNotes
              .map((note) => ({
                path: note.path,
                name: note.path.split("/").pop()!,
                kind: "file" as const,
              }))
              .sort((a, b) => a.name.localeCompare(b.name)),
          });
        }
        return;
      }

      const tree = await notes.getTree(workspace.id, (fresh) => {
        if (!cancelled) patch({ tree: fresh });
      });
      if (!cancelled) patch({ tree });
    };

    void load().catch((error) => {
      if (!cancelled) patch({ error: error instanceof Error ? error.message : String(error) });
    });

    return () => {
      cancelled = true;
    };
  }, [state.activeWorkspace, patch]);

  // ── Flush pending changes when the connection returns ───────────────────
  useEffect(() => {
    // retryNow rather than flushNow: a reconnect should also clear any backoff
    // the engine built up while the network was down.
    const onOnline = () => syncRef.current?.retryNow();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  // ── Warn before closing with unsaved work ───────────────────────────────
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (state.sync.pendingCount === 0) return;
      // Changes are safe in IndexedDB either way; this just tells the user
      // their latest edits have not reached GitHub yet.
      event.preventDefault();
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [state.sync.pendingCount]);

  // ── Actions ─────────────────────────────────────────────────────────────

  /** Remembers the tab set so a reload comes back to the same desks. */
  const rememberTabs = useCallback((workspace: string, notes: Note[], active: string | null) => {
    void dbRef.current?.putMeta(
      openTabsKey(workspace),
      notes.map((note) => note.path),
    );
    void dbRef.current?.putMeta(activeTabKey(workspace), active);
  }, []);

  const openNote = useCallback(
    async (path: string) => {
      const workspace = state.activeWorkspace;
      const notes = repoRef.current;
      if (!workspace || !notes) return;

      // Already open: this is a tab switch, which should be instant and must
      // not throw away unsaved-to-remote edits by re-reading from storage.
      if (state.openNotes.some((note) => note.path === path)) {
        patch({ activePath: path });
        rememberTabs(workspace.id, state.openNotes, path);
        return;
      }

      patch({ busy: "Opening…", error: null });
      try {
        const note = await notes.openNote(workspace.id, path);
        // Past the cap, the least recently used tab gives way rather than the
        // strip growing until the labels are unreadable.
        const next = [...state.openNotes, note].slice(-MAX_OPEN_NOTES);

        patch({ openNotes: next, activePath: note.path, busy: null });
        rememberTabs(workspace.id, next, note.path);
      } catch (error) {
        patch({
          busy: null,
          error: error instanceof Error ? error.message : "Could not open that note.",
        });
      }
    },
    [state.activeWorkspace, state.openNotes, patch, rememberTabs],
  );

  /**
   * Closes one tab.
   *
   * Nothing is discarded: the note is already saved locally, and its pending
   * changes stay queued for sync. Closing only takes it off the strip.
   */
  const closeNote = useCallback(
    (path: string) => {
      const workspace = state.activeWorkspace;
      const remaining = state.openNotes.filter((note) => note.path !== path);

      // Focus moves to the neighbour on the left, which is where the eye
      // already is after closing something.
      const closedAt = state.openNotes.findIndex((note) => note.path === path);
      const activePath =
        state.activePath === path
          ? (remaining[Math.max(0, closedAt - 1)]?.path ?? null)
          : state.activePath;

      patch({ openNotes: remaining, activePath });
      if (workspace) rememberTabs(workspace.id, remaining, activePath);
    },
    [state.activeWorkspace, state.openNotes, state.activePath, patch, rememberTabs],
  );

  /**
   * Loads a note without making it the active one.
   *
   * Rename and delete need the note's base SHA and content even when the user
   * acted on it from the sidebar without opening it.
   */
  const openNoteAndReturn = useCallback(
    async (path: string): Promise<Note | null> => {
      const workspace = state.activeWorkspace;
      const notes = repoRef.current;
      if (!workspace || !notes) return null;

      try {
        return await notes.openNote(workspace.id, path);
      } catch (error) {
        patch({ error: error instanceof Error ? error.message : "Could not load that note." });
        return null;
      }
    },
    [state.activeWorkspace, patch],
  );

  const activeNote = useMemo(
    () => state.openNotes.find((note) => note.path === state.activePath) ?? null,
    [state.openNotes, state.activePath],
  );

  /** Replaces one open note in place, leaving the rest of the tabs untouched. */
  const patchOpenNote = useCallback((path: string, changes: Partial<Note>) => {
    setState((previous) => ({
      ...previous,
      openNotes: previous.openNotes.map((note) =>
        note.path === path ? { ...note, ...changes } : note,
      ),
    }));
  }, []);

  const saveNote = useCallback(
    async (content: string) => {
      const notes = repoRef.current;
      if (!notes || !activeNote) return;

      // Optimistic: show the new content immediately, persist in the background.
      patchOpenNote(activeNote.path, { content, dirty: true });
      await notes.saveNote(activeNote, content);
    },
    [activeNote, patchOpenNote],
  );

  const updateFrontmatter = useCallback(
    async (frontmatter: Note["frontmatter"]) => {
      const notes = repoRef.current;
      if (!notes || !activeNote) return;

      patchOpenNote(activeNote.path, { frontmatter, dirty: true });
      await notes.saveNote(activeNote, activeNote.content, frontmatter);
    },
    [activeNote, patchOpenNote],
  );

  const createNote = useCallback(
    async (title: string, folder = "") => {
      const workspace = state.activeWorkspace;
      const notes = repoRef.current;
      if (!workspace || !notes) return;

      const existing = collectPaths(state.tree);
      const note = await notes.createNote({
        workspaceId: workspace.id,
        folder,
        title,
        existingPaths: existing,
      });

      const open = [...state.openNotes, note].slice(-MAX_OPEN_NOTES);
      patch({
        openNotes: open,
        activePath: note.path,
        tree: insertIntoTree(state.tree, note.path),
      });
      rememberTabs(workspace.id, open, note.path);
      return note;
    },
    [state.activeWorkspace, state.tree, state.openNotes, patch, rememberTabs],
  );

  const deleteNote = useCallback(
    async (note: Note) => {
      const notes = repoRef.current;
      if (!notes) return;

      await notes.deleteNote(note);

      const open = state.openNotes.filter((candidate) => candidate.path !== note.path);
      const activePath =
        state.activePath === note.path ? (open[0]?.path ?? null) : state.activePath;

      patch({ tree: removeFromTree(state.tree, note.path), openNotes: open, activePath });
      if (state.activeWorkspace) rememberTabs(state.activeWorkspace.id, open, activePath);
    },
    [state.tree, state.openNotes, state.activePath, state.activeWorkspace, patch, rememberTabs],
  );

  const renameNote = useCallback(
    async (note: Note, toPath: string) => {
      const notes = repoRef.current;
      if (!notes) return;

      const renamed = await notes.renameNote(note, toPath);

      const open = state.openNotes.map((candidate) =>
        candidate.path === note.path ? renamed : candidate,
      );
      const activePath = state.activePath === note.path ? renamed.path : state.activePath;

      patch({
        tree: insertIntoTree(removeFromTree(state.tree, note.path), toPath),
        openNotes: open,
        activePath,
      });
      if (state.activeWorkspace) rememberTabs(state.activeWorkspace.id, open, activePath);
      return renamed;
    },
    [state.tree, state.openNotes, state.activePath, state.activeWorkspace, patch, rememberTabs],
  );

  const setViewMode = useCallback(
    async (mode: EditorViewMode) => {
      const notes = repoRef.current;
      if (!notes || !activeNote) return;

      patchOpenNote(activeNote.path, { viewMode: mode });
      await notes.setViewMode(activeNote, mode);
      await dbRef.current?.putMeta("defaultViewMode", mode);
    },
    [activeNote, patchOpenNote],
  );

  const switchWorkspace = useCallback(
    (workspace: Workspace) => {
      patch({ activeWorkspace: workspace, openNotes: [], activePath: null, tree: [] });
    },
    [patch],
  );

  const addWorkspace = useCallback(
    async (workspace: Workspace) => {
      const notes = repoRef.current;
      if (!notes) return;

      await notes.addWorkspace(workspace);
      if (gatewayRef.current instanceof GitHubGateway) {
        gatewayRef.current.register(workspace);
      }

      patch({
        workspaces: [...state.workspaces.filter((w) => w.id !== workspace.id), workspace],
        activeWorkspace: workspace,
        openNotes: [],
        activePath: null,
        tree: [],
      });
    },
    [state.workspaces, patch],
  );

  const removeWorkspace = useCallback(
    async (id: string) => {
      const notes = repoRef.current;
      if (!notes) return;

      await notes.removeWorkspace(id);
      if (gatewayRef.current instanceof GitHubGateway) gatewayRef.current.unregister(id);

      const remaining = state.workspaces.filter((w) => w.id !== id);
      patch({
        workspaces: remaining,
        ...(state.activeWorkspace?.id === id
          ? { activeWorkspace: remaining[0] ?? null, openNotes: [], activePath: null, tree: [] }
          : {}),
      });
    },
    [state.workspaces, state.activeWorkspace, patch],
  );

  const syncNow = useCallback(() => syncRef.current?.flushNow(), []);

  const resolveConflict = useCallback(
    async (path: string, resolution: "keep-local" | "keep-remote" | "keep-both") => {
      const workspace = state.activeWorkspace;
      if (!workspace) return;

      await syncRef.current?.resolveConflict(workspace.id, path, resolution);

      // Re-read the note so every tab showing it gets whatever the resolution
      // produced, rather than keeping the copy that lost.
      const notes = repoRef.current;
      if (notes && state.openNotes.some((note) => note.path === path)) {
        const fresh = await notes.openNote(workspace.id, path);
        patchOpenNote(path, fresh);
      }
    },
    [state.activeWorkspace, state.openNotes, patchOpenNote],
  );

  const allNotes = useCallback(async () => {
    const workspace = state.activeWorkspace;
    const notes = repoRef.current;
    if (!workspace || !notes) return [];
    return notes.listNotes(workspace.id);
  }, [state.activeWorkspace]);

  return useMemo(
    () => ({
      ...state,
      /** The note the editor is showing. Derived from the open set. */
      note: activeNote,
      openNote,
      closeNote,
      openNoteAndReturn,
      saveNote,
      updateFrontmatter,
      createNote,
      deleteNote,
      renameNote,
      setViewMode,
      switchWorkspace,
      addWorkspace,
      removeWorkspace,
      syncNow,
      resolveConflict,
      allNotes,
      dismissError: () => patch({ error: null }),
    }),
    [
      state,
      activeNote,
      openNote,
      closeNote,
      openNoteAndReturn,
      saveNote,
      updateFrontmatter,
      createNote,
      deleteNote,
      renameNote,
      setViewMode,
      switchWorkspace,
      addWorkspace,
      removeWorkspace,
      syncNow,
      resolveConflict,
      allNotes,
      patch,
    ],
  );
}

// ─── Tree helpers ───────────────────────────────────────────────────────────
// The tree is updated locally on create/rename/delete so the sidebar responds
// instantly; the authoritative version arrives on the next refresh.

function collectPaths(tree: TreeNode[]): string[] {
  const paths: string[] = [];
  const walk = (nodes: TreeNode[]) => {
    for (const node of nodes) {
      if (node.kind === "file") paths.push(node.path);
      if (node.children) walk(node.children);
    }
  };
  walk(tree);
  return paths;
}

function insertIntoTree(tree: TreeNode[], path: string): TreeNode[] {
  const folder = dirname(path);
  const name = path.split("/").pop()!;
  const node: TreeNode = { path, name, kind: "file" };

  if (folder === "") return sortNodes([...tree, node]);

  const insert = (nodes: TreeNode[], prefix: string): TreeNode[] =>
    nodes.map((current) => {
      if (current.kind !== "folder") return current;
      if (current.path === prefix) {
        return { ...current, children: sortNodes([...(current.children ?? []), node]) };
      }
      if (prefix.startsWith(`${current.path}/`)) {
        return { ...current, children: insert(current.children ?? [], prefix) };
      }
      return current;
    });

  return insert(tree, folder);
}

function removeFromTree(tree: TreeNode[], path: string): TreeNode[] {
  return tree
    .filter((node) => node.path !== path)
    .map((node) =>
      node.children ? { ...node, children: removeFromTree(node.children, path) } : node,
    );
}

function sortNodes(nodes: TreeNode[]): TreeNode[] {
  return [...nodes].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}
