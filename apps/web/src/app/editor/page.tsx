"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import type { EditorViewMode } from "@mdnotion/types";
import { deriveTitle, dirname, joinPath, slugifyFilename } from "@mdnotion/markdown-engine";
import { useNotebook } from "@/hooks/useNotebook";
import { useTheme } from "@/hooks/useTheme";
import { EditorSidebar } from "@/components/EditorSidebar";
import { EditorRightPanel } from "@/components/EditorRightPanel";
import { EditorStatusBar } from "@/components/EditorStatusBar";
import { ConflictDialog } from "@/components/ConflictDialog";
import { ExportDialog } from "@/components/ExportDialog";
import { ConnectRepoDialog } from "@/components/ConnectRepoDialog";
import { PromptDialog, type PromptRequest } from "@/components/PromptDialog";
import { signOut } from "@/lib/gateway";

/**
 * The editor is browser-only: it reaches for IndexedDB and builds a
 * ProseMirror/CodeMirror DOM on mount, neither of which the server can produce.
 */
const MarkdownEditor = dynamic(
  () => import("@mdnotion/editor").then((module) => module.MarkdownEditor),
  {
    ssr: false,
    loading: () => (
      <div className="p-8 text-sm text-[var(--color-mist)]" aria-busy="true">
        Loading editor…
      </div>
    ),
  },
);

export default function EditorPage() {
  const notebook = useNotebook();
  const router = useRouter();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [dialog, setDialog] = useState<"export" | "connect" | null>(null);
  const [prompt, setPrompt] = useState<PromptRequest | null>(null);
  // Conflicts open their own dialog as soon as they appear. Dismissing it hides
  // it until they are resolved; the status bar stays as the way back in.
  const [conflictsDismissed, setConflictsDismissed] = useState(false);
  const [theme, , toggleTheme] = useTheme();

  const note = notebook.note;
  const mode: EditorViewMode = note?.viewMode ?? "wysiwyg";
  const title = note ? deriveTitle(note.content, note.frontmatter.title, note.path) : "";

  const conflicts = notebook.sync.conflicts;
  // Derived rather than pushed into state by an effect, which would cause a
  // second render pass on every sync update.
  const showConflicts = conflicts.length > 0 && !conflictsDismissed;

  // ── Actions ─────────────────────────────────────────────────────────────

  const handleCreate = useCallback(
    (folder: string) => {
      setPrompt({
        title: "New note",
        label: "Title",
        initialValue: "Untitled note",
        confirmLabel: "Create",
        onConfirm: async (value) => {
          await notebook.createNote(value || "Untitled note", folder);
        },
      });
    },
    [notebook],
  );

  const handleRename = useCallback(
    (path: string) => {
      const currentName = (path.split("/").pop() ?? path).replace(/\.mdx?$/i, "");

      setPrompt({
        title: "Rename note",
        label: "Name",
        initialValue: currentName,
        confirmLabel: "Rename",
        onConfirm: async (value) => {
          // Renaming rewrites the file, so its content has to be loaded first.
          const target =
            notebook.note?.path === path ? notebook.note : await notebook.openNoteAndReturn(path);
          if (!target) return;

          await notebook.renameNote(
            target,
            joinPath(dirname(path), `${slugifyFilename(value)}.md`),
          );
        },
      });
    },
    [notebook],
  );

  const handleDelete = useCallback(
    (path: string) => {
      setPrompt({
        title: "Delete note",
        label: "",
        destructive: true,
        confirmLabel: "Delete",
        body: `“${path}” will be deleted. On a connected repository this is committed to GitHub, so it stays recoverable from your git history.`,
        onConfirm: async () => {
          // Load it first so the sync engine knows the base SHA to delete against.
          const target =
            notebook.note?.path === path ? notebook.note : await notebook.openNoteAndReturn(path);
          if (target) await notebook.deleteNote(target);
        },
      });
    },
    [notebook],
  );

  const handleSignOut = useCallback(async () => {
    await signOut();
    router.push("/");
    // The session cookie is gone, so anything the server rendered from it is
    // now stale.
    router.refresh();
  }, [router]);

  // ── Keyboard shortcuts ──────────────────────────────────────────────────
  // Declared after the callbacks it uses, so nothing is referenced before it
  // exists and the memoisation stays intact.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;

      switch (event.key.toLowerCase()) {
        case "s":
          // Everything is already saved locally; this just pushes now instead
          // of waiting out the debounce.
          event.preventDefault();
          void notebook.syncNow();
          break;

        case "e":
          if (event.shiftKey && note) {
            event.preventDefault();
            setDialog("export");
          }
          break;

        case "n":
          if (event.shiftKey) {
            event.preventDefault();
            handleCreate("");
          }
          break;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [note, notebook, handleCreate]);

  // ── Render ──────────────────────────────────────────────────────────────

  if (!notebook.ready) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--color-paper)]">
        <p className="text-sm text-[var(--color-mist)]" aria-busy="true">
          {notebook.busy ?? "Starting mdnotion…"}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--color-paper)] font-sans text-[var(--color-ink)]">
      <div className="flex min-h-0 flex-1">
        <div className="hidden md:flex">
          <EditorSidebar
            collapsed={sidebarCollapsed}
            onToggle={() => setSidebarCollapsed((value) => !value)}
            workspaces={notebook.workspaces}
            activeWorkspace={notebook.activeWorkspace}
            onSwitchWorkspace={notebook.switchWorkspace}
            onConnectRepo={() => setDialog("connect")}
            tree={notebook.tree}
            activePath={note?.path ?? null}
            onOpenNote={notebook.openNote}
            onCreateNote={handleCreate}
            onDeleteNote={handleDelete}
            onRenameNote={handleRename}
            user={notebook.session?.user ?? null}
            onSignIn={() => {
              // Deliberately a full document navigation: this is an API route
              // that 302s out to github.com, which the client router cannot
              // follow.
              // eslint-disable-next-line @next/next/no-location-assign-relative-destination
              window.location.assign("/api/auth/github");
            }}
            onSignOut={handleSignOut}
            githubAvailable={notebook.session?.githubAvailable ?? false}
          />
        </div>

        <main className="flex min-w-0 flex-1 flex-col">
          {/* ── Header ────────────────────────────────────────────────── */}
          <header className="flex h-14 shrink-0 items-center gap-3 border-b border-[var(--color-border)] px-4">
            <Link
              href="/"
              className="shrink-0 font-serif text-lg font-semibold text-[var(--color-ink)] md:hidden"
            >
              mdnotion
            </Link>

            {note ? (
              <input
                value={(note.frontmatter.title as string) ?? title}
                onChange={(event) =>
                  notebook.updateFrontmatter({ ...note.frontmatter, title: event.target.value })
                }
                aria-label="Note title"
                className="min-w-0 flex-1 truncate bg-transparent font-serif text-2xl font-bold text-[var(--color-ink)] outline-none"
              />
            ) : (
              <span className="flex-1 text-sm text-[var(--color-mist)]">No note open</span>
            )}

            <div className="flex shrink-0 items-center gap-1">
              {note && (
                <div
                  role="tablist"
                  aria-label="Editor mode"
                  className="hidden rounded-md border border-[var(--color-border)] p-0.5 sm:flex"
                >
                  {(["wysiwyg", "split", "source"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      role="tab"
                      aria-selected={mode === value}
                      onClick={() => notebook.setViewMode(value)}
                      className={`rounded px-2.5 py-1 text-xs font-medium capitalize transition ${
                        mode === value
                          ? "bg-[var(--color-trail-teal)] text-[var(--color-paper)]"
                          : "text-[var(--color-mist)] hover:text-[var(--color-ink)]"
                      }`}
                    >
                      {value === "wysiwyg" ? "Rich" : value}
                    </button>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={toggleTheme}
                title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
                aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
                className="rounded-md p-1.5 text-[var(--color-mist)] hover:bg-[var(--color-chalk)] hover:text-[var(--color-ink)]"
              >
                {theme === "dark" ? "☀" : "☾"}
              </button>

              {note && (
                <button
                  type="button"
                  onClick={() => setDialog("export")}
                  className="rounded-md px-2.5 py-1.5 text-xs font-medium text-[var(--color-mist)] hover:bg-[var(--color-chalk)] hover:text-[var(--color-ink)]"
                >
                  Export
                </button>
              )}

              <button
                type="button"
                onClick={() => setPanelCollapsed((value) => !value)}
                title="Toggle properties panel"
                aria-label="Toggle properties panel"
                className="hidden rounded-md p-1.5 text-[var(--color-mist)] hover:bg-[var(--color-chalk)] hover:text-[var(--color-ink)] lg:block"
              >
                ⋮
              </button>
            </div>
          </header>

          {/* ── Errors ───────────────────────────────────────────────── */}
          {notebook.error && (
            <div
              role="alert"
              className="flex items-center gap-2 border-b border-[var(--color-ember)]/30 bg-[var(--color-ember)]/8 px-4 py-2 text-sm text-[var(--color-ember)]"
            >
              <span className="flex-1">{notebook.error}</span>
              <button
                type="button"
                onClick={notebook.dismissError}
                aria-label="Dismiss"
                className="shrink-0 px-2"
              >
                ✕
              </button>
            </div>
          )}

          {/* ── Canvas ───────────────────────────────────────────────── */}
          <div className="flex min-h-0 flex-1 flex-col px-4 py-3 md:px-8">
            {note ? (
              <MarkdownEditor
                key={note.id}
                value={note.content}
                onChange={notebook.saveNote}
                mode={mode}
                theme={theme}
                hideModeSwitcher
                placeholder="Type / for commands…"
                className="min-h-0 flex-1"
              />
            ) : (
              <EmptyState onCreate={() => handleCreate("")} hasNotes={notebook.tree.length > 0} />
            )}
          </div>
        </main>

        {!panelCollapsed && (
          <div className="hidden lg:flex">
            <EditorRightPanel
              collapsed={false}
              onToggle={() => setPanelCollapsed(true)}
              note={note}
              onFrontmatterChange={notebook.updateFrontmatter}
              onExport={() => setDialog("export")}
            />
          </div>
        )}
      </div>

      <EditorStatusBar
        sync={notebook.sync}
        workspace={notebook.activeWorkspace}
        notePath={note?.path ?? null}
        onSyncNow={notebook.syncNow}
        onShowConflicts={() => setConflictsDismissed(false)}
      />

      {/* ── Dialogs ────────────────────────────────────────────────────── */}
      {dialog === "export" && note && (
        <ExportDialog
          note={note}
          loadAllNotes={notebook.allNotes}
          onClose={() => setDialog(null)}
        />
      )}

      {showConflicts && (
        <ConflictDialog
          conflicts={conflicts}
          onResolve={notebook.resolveConflict}
          onClose={() => setConflictsDismissed(true)}
        />
      )}

      {prompt && <PromptDialog request={prompt} onClose={() => setPrompt(null)} />}

      {dialog === "connect" && (
        <ConnectRepoDialog
          onConnect={async (workspace) => {
            await notebook.addWorkspace(workspace);
            setDialog(null);
          }}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

function EmptyState({ onCreate, hasNotes }: { onCreate: () => void; hasNotes: boolean }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      <h2 className="mb-2 font-serif text-2xl font-semibold text-[var(--color-ink)]">
        {hasNotes ? "Pick a note to start" : "Your notebook is empty"}
      </h2>
      <p className="mb-5 max-w-sm text-sm text-[var(--color-mist)]">
        {hasNotes
          ? "Choose something from the sidebar, or start something new."
          : "Create your first note. It will be saved to your GitHub repository as plain markdown."}
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="rounded-md bg-[var(--color-signal-amber)] px-5 py-2.5 text-sm font-semibold text-[var(--color-basalt)] hover:opacity-90"
      >
        New note
      </button>
    </div>
  );
}
