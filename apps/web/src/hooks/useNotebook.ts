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
  note: Note | null;
  sync: SyncState;
  error: string | null;
  /** Set while a slow operation (bootstrap, opening a note) is running. */
  busy: string | null;
}

export function useNotebook() {
  const [state, setState] = useState<NotebookState>({
    ready: false,
    session: null,
    workspaces: [],
    activeWorkspace: null,
    tree: [],
    note: null,
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

  const openNote = useCallback(
    async (path: string) => {
      const workspace = state.activeWorkspace;
      const notes = repoRef.current;
      if (!workspace || !notes) return;

      patch({ busy: "Opening…", error: null });
      try {
        const note = await notes.openNote(workspace.id, path);
        patch({ note, busy: null });
      } catch (error) {
        patch({
          busy: null,
          error: error instanceof Error ? error.message : "Could not open that note.",
        });
      }
    },
    [state.activeWorkspace, patch],
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

  const saveNote = useCallback(
    async (content: string) => {
      const notes = repoRef.current;
      const current = state.note;
      if (!notes || !current) return;

      // Optimistic: show the new content immediately, persist in the background.
      const updated = { ...current, content, dirty: true };
      setState((previous) => ({ ...previous, note: updated }));
      await notes.saveNote(current, content);
    },
    [state.note],
  );

  const updateFrontmatter = useCallback(
    async (frontmatter: Note["frontmatter"]) => {
      const notes = repoRef.current;
      const current = state.note;
      if (!notes || !current) return;

      const updated = { ...current, frontmatter, dirty: true };
      setState((previous) => ({ ...previous, note: updated }));
      await notes.saveNote(current, current.content, frontmatter);
    },
    [state.note],
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

      patch({
        note,
        tree: insertIntoTree(state.tree, note.path),
      });
      return note;
    },
    [state.activeWorkspace, state.tree, patch],
  );

  const deleteNote = useCallback(
    async (note: Note) => {
      const notes = repoRef.current;
      if (!notes) return;

      await notes.deleteNote(note);
      patch({
        tree: removeFromTree(state.tree, note.path),
        note: state.note?.path === note.path ? null : state.note,
      });
    },
    [state.tree, state.note, patch],
  );

  const renameNote = useCallback(
    async (note: Note, toPath: string) => {
      const notes = repoRef.current;
      if (!notes) return;

      const renamed = await notes.renameNote(note, toPath);
      patch({
        tree: insertIntoTree(removeFromTree(state.tree, note.path), toPath),
        note: renamed,
      });
      return renamed;
    },
    [state.tree, patch],
  );

  const setViewMode = useCallback(
    async (mode: EditorViewMode) => {
      const notes = repoRef.current;
      const current = state.note;
      if (!notes || !current) return;

      setState((previous) => ({
        ...previous,
        note: previous.note ? { ...previous.note, viewMode: mode } : null,
      }));
      await notes.setViewMode(current, mode);
      await dbRef.current?.putMeta("defaultViewMode", mode);
    },
    [state.note],
  );

  const switchWorkspace = useCallback(
    (workspace: Workspace) => {
      patch({ activeWorkspace: workspace, note: null, tree: [] });
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
        note: null,
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
          ? { activeWorkspace: remaining[0] ?? null, note: null, tree: [] }
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

      // Re-read the note so the editor shows whatever the resolution produced.
      if (state.note?.path === path) await openNote(path);
    },
    [state.activeWorkspace, state.note, openNote],
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
      openNote,
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
      openNote,
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
