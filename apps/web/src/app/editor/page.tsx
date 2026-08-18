"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import type { CursorPosition } from "@forkleaf/editor";
import type { EditorViewMode } from "@forkleaf/types";
import {
  deriveTitle,
  dirname,
  documentStats,
  joinPath,
  slugifyFilename,
} from "@forkleaf/markdown-engine";
import { useNotebook } from "@/hooks/useNotebook";
import { useTheme } from "@/hooks/useTheme";
import { EditorSidebar } from "@/components/EditorSidebar";
import { EditorRightPanel } from "@/components/EditorRightPanel";
import { EditorStatusBar } from "@/components/EditorStatusBar";
import { EditorTabs } from "@/components/EditorTabs";
import { ConflictDialog } from "@/components/ConflictDialog";
import { ExportDialog } from "@/components/ExportDialog";
import { ConnectRepoDialog } from "@/components/ConnectRepoDialog";
import { ProposeChangesDialog } from "@/components/ProposeChangesDialog";
import { HelpDialog } from "@/components/HelpDialog";
import { HistoryDialog } from "@/components/HistoryDialog";
import { PromptDialog, type PromptRequest } from "@/components/PromptDialog";
import { ForkLeafLogo } from "@/components/Brand";
import { LocalOnlyBanner } from "@/components/LocalOnlyBanner";
import { signOut } from "@/lib/gateway";
import { track } from "@/lib/firebase/analytics";
import { upsertUserProfile } from "@/lib/firebase/users";

/**
 * The editor is browser-only: it reaches for IndexedDB and builds a
 * ProseMirror/CodeMirror DOM on mount, neither of which the server can produce.
 */
const MarkdownEditor = dynamic(
  () => import("@forkleaf/editor").then((module) => module.MarkdownEditor),
  {
    ssr: false,
    loading: () => (
      <div className="p-8 text-sm text-[var(--fl-muted)]" aria-busy="true">
        Loading editor…
      </div>
    ),
  },
);

const MODES: { value: EditorViewMode; label: string; hint: string }[] = [
  { value: "wysiwyg", label: "Rich", hint: "Format as you type" },
  { value: "split", label: "Split", hint: "Markdown beside a live preview" },
  { value: "source", label: "Source", hint: "Raw markdown" },
];

export default function EditorPage() {
  const notebook = useNotebook();
  const router = useRouter();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [dialog, setDialog] = useState<
    "export" | "connect" | "help" | "history" | "propose" | null
  >(null);
  const [prompt, setPrompt] = useState<PromptRequest | null>(null);
  // Conflicts open their own dialog as soon as they appear. Dismissing it hides
  // it until they are resolved; the status bar stays as the way back in.
  const [conflictsDismissed, setConflictsDismissed] = useState(false);
  // Where the caret is, when there is a source surface to ask. Null in rich
  // text, where a line and column would be a fiction.
  const [cursor, setCursor] = useState<CursorPosition | null>(null);
  const [theme, , toggleTheme] = useTheme();

  const note = notebook.note;
  const mode: EditorViewMode = note?.viewMode ?? "wysiwyg";
  const title = note ? deriveTitle(note.content, note.frontmatter.title, note.path) : "";
  const workspace = notebook.activeWorkspace;
  const user = notebook.session?.user ?? null;

  const words = useMemo(() => (note ? documentStats(note.content).words : 0), [note]);

  const conflicts = notebook.sync.conflicts;
  // Derived rather than pushed into state by an effect, which would cause a
  // second render pass on every sync update.
  const showConflicts = conflicts.length > 0 && !conflictsDismissed;

  // Records who is using ForkLeaf, for the analytics and billing side. Fails
  // silently and never blocks the editor when Firebase is unconfigured.
  useEffect(() => {
    if (!notebook.ready) return;
    void upsertUserProfile(user);
  }, [notebook.ready, user]);

  const signIn = useCallback(() => {
    track("github_sign_in_started");
    // Deliberately a full document navigation: this is an API route that 302s
    // out to github.com, which the client router cannot follow.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/api/auth/github");
  }, []);

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
          track("note_created");
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

  const handleCreateFolder = useCallback(
    (parent: string) => {
      setPrompt({
        title: parent ? `New folder in ${parent}` : "New folder",
        label: "Folder name",
        initialValue: "",
        confirmLabel: "Create",
        body: "Folders are made of the notes inside them, so this one appears in your repository as soon as it holds its first note.",
        onConfirm: async (value) => {
          const name = value.trim();
          if (!name) return;
          await notebook.createFolder(parent ? `${parent}/${name}` : name);
        },
      });
    },
    [notebook],
  );

  const handleRenameFolder = useCallback(
    (path: string) => {
      const currentName = path.split("/").pop() ?? path;

      setPrompt({
        title: "Rename folder",
        label: "Folder name",
        initialValue: currentName,
        confirmLabel: "Rename",
        body: "Every note in the folder moves with it, which on a connected repository is committed as a set of renames.",
        onConfirm: async (value) => {
          const name = value.trim();
          if (!name || name === currentName) return;

          const parent = path.split("/").slice(0, -1).join("/");
          await notebook.renameFolder(path, parent ? `${parent}/${name}` : name);
        },
      });
    },
    [notebook],
  );

  const handleDeleteFolder = useCallback(
    (path: string) => {
      setPrompt({
        title: "Delete folder",
        label: "",
        destructive: true,
        confirmLabel: "Delete",
        body: `“${path}” and every note inside it will be deleted. On a connected repository this is committed to GitHub, so it stays recoverable from your git history.`,
        onConfirm: async () => {
          await notebook.deleteFolder(path);
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
      if (event.key === "?" && event.shiftKey && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setDialog("help");
        return;
      }

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
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-[var(--fl-bg)]">
        <ForkLeafLogo markClassName="h-8 w-8" textClassName="text-xl" />
        <p className="text-sm text-[var(--fl-muted)]" aria-busy="true">
          {notebook.busy ?? "Starting ForkLeaf…"}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--fl-bg)] font-sans text-[var(--fl-text)]">
      <div className="flex min-h-0 flex-1">
        <div className="hidden md:flex">
          <EditorSidebar
            collapsed={sidebarCollapsed}
            onToggle={() => setSidebarCollapsed((value) => !value)}
            workspaces={notebook.workspaces}
            activeWorkspace={workspace}
            onSwitchWorkspace={notebook.switchWorkspace}
            onConnectRepo={() => setDialog("connect")}
            tree={notebook.tree}
            activePath={note?.path ?? null}
            onOpenNote={notebook.openNote}
            onCreateNote={handleCreate}
            onDeleteNote={handleDelete}
            onRenameNote={handleRename}
            onCreateFolder={handleCreateFolder}
            onRenameFolder={handleRenameFolder}
            onDeleteFolder={handleDeleteFolder}
            user={user}
            onSignIn={signIn}
            onSignOut={handleSignOut}
            onOpenHelp={() => setDialog("help")}
            githubAvailable={notebook.session?.githubAvailable ?? false}
          />
        </div>

        <main className="flex min-w-0 flex-1 flex-col">
          {/* ── Header ────────────────────────────────────────────────── */}
          {/* One row: which notes are open, how this one is being viewed, and
              the handful of controls that act on the window rather than on the
              document. The note's title used to sit here too, duplicating the
              one in the properties panel; there is now one place to edit it. */}
          {/* Flex, not a three-column grid: the grid gave the tab strip a fixed
              third of the row, so the seventh open note was clipped while the
              controls beside it sat in empty space. Now the tabs take whatever
              is left after the controls have what they need, and scroll when
              that is not enough — which is what makes this fit every width. */}
          <header className="flex h-[52px] shrink-0 items-center gap-2 border-b border-[var(--fl-border)] px-2">
            <Link href="/" className="shrink-0 px-1 text-[var(--fl-text)] md:hidden">
              <ForkLeafLogo markClassName="h-6 w-6" textClassName="text-[15px]" />
            </Link>

            <EditorTabs
              notes={notebook.openNotes}
              activePath={notebook.activePath}
              onSelect={notebook.openNote}
              onClose={notebook.closeNote}
              className="h-9 flex-1"
            />

            {note ? (
              <div
                role="tablist"
                aria-label="Editor mode"
                className="hidden shrink-0 rounded-lg border border-[var(--fl-border)] bg-[var(--fl-surface)] p-0.5 sm:flex"
              >
                {MODES.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="tab"
                    aria-selected={mode === option.value}
                    title={option.hint}
                    onClick={() => notebook.setViewMode(option.value)}
                    className={`rounded-[6px] px-3 py-1 text-[12.5px] font-medium transition-colors ${
                      mode === option.value
                        ? "bg-[var(--fl-accent)] text-[var(--fl-accent-contrast)]"
                        : "text-[var(--fl-muted)] hover:text-[var(--fl-text)]"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="flex shrink-0 items-center justify-end gap-1">
              <IconButton onClick={() => setDialog("help")} label="Help (⌘⇧?)">
                <svg
                  viewBox="0 0 16 16"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                >
                  <circle cx="8" cy="8" r="6.25" />
                  <path d="M6.2 6.2a1.9 1.9 0 1 1 2.3 2.2v1.1M8.5 12h.01" />
                </svg>
              </IconButton>

              <IconButton
                onClick={toggleTheme}
                label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
              >
                {theme === "dark" ? <SunGlyph /> : <MoonGlyph />}
              </IconButton>

              <IconButton
                onClick={() => setPanelCollapsed((value) => !value)}
                label="Toggle document panel"
                className="hidden lg:inline-flex"
              >
                <svg
                  viewBox="0 0 16 16"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                >
                  <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="2" />
                  <path d="M10 2.75v10.5" />
                </svg>
              </IconButton>
            </div>
          </header>

          {/* ── Banners ──────────────────────────────────────────────── */}
          {notebook.error && (
            <div
              role="alert"
              className="flex items-center gap-2 border-b border-[var(--fl-danger)]/30 bg-[var(--fl-danger)]/8 px-4 py-2 text-sm text-[var(--fl-danger)]"
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

          {!user && (
            <LocalOnlyBanner
              githubAvailable={notebook.session?.githubAvailable ?? false}
              onSignIn={signIn}
              onLearnMore={() => setDialog("help")}
            />
          )}

          {/* ── Canvas ───────────────────────────────────────────────── */}
          <div className="flex min-h-0 flex-1 flex-col">
            {note ? (
              <MarkdownEditor
                key={note.id}
                value={note.content}
                onChange={notebook.saveNote}
                mode={mode}
                theme={theme}
                onCursorChange={setCursor}
                hideModeSwitcher
                placeholder="Type / for headings, lists, tables and diagrams…"
                className="min-h-0 flex-1"
              />
            ) : (
              <EmptyState
                onCreate={() => handleCreate("")}
                onHelp={() => setDialog("help")}
                hasNotes={notebook.tree.length > 0}
              />
            )}
          </div>
        </main>

        {!panelCollapsed && (
          <div className="hidden lg:flex">
            <EditorRightPanel
              collapsed={false}
              onToggle={() => setPanelCollapsed(true)}
              note={note}
              workspace={workspace}
              onFrontmatterChange={notebook.updateFrontmatter}
              onExport={() => setDialog("export")}
              onShowHistory={() => setDialog("history")}
              syncMode={notebook.syncPreference.mode}
              onSyncNow={notebook.syncNow}
            />
          </div>
        )}
      </div>

      <EditorStatusBar
        onSwitchBranch={notebook.switchBranch}
        onPropose={() => setDialog("propose")}
        sync={notebook.sync}
        workspace={workspace}
        notePath={note?.path ?? null}
        cursor={cursor}
        words={words}
        syncPreference={notebook.syncPreference}
        onSyncModeChange={notebook.setSyncMode}
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

      {dialog === "help" && (
        <HelpDialog
          onClose={() => setDialog(null)}
          user={user}
          workspace={workspace}
          githubAvailable={notebook.session?.githubAvailable ?? false}
          onSignIn={signIn}
          onConnectRepo={() => setDialog("connect")}
        />
      )}

      {dialog === "history" && note && workspace && !workspace.isLocal && (
        <HistoryDialog
          note={note}
          workspace={workspace}
          onClose={() => setDialog(null)}
          onRestore={notebook.saveNote}
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

      {dialog === "propose" && workspace && !workspace.isLocal && user && (
        <ProposeChangesDialog
          workspace={workspace}
          login={user.login}
          subject={title || note?.path || "update documentation"}
          onClose={() => setDialog(null)}
          onSwitchBranch={notebook.switchBranch}
        />
      )}

      {dialog === "connect" && (
        <ConnectRepoDialog
          onConnect={async (nextWorkspace) => {
            await notebook.addWorkspace(nextWorkspace);
            track("repo_connected");
            setDialog(null);
          }}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

// ─── Pieces ─────────────────────────────────────────────────────────────────

function IconButton({
  as = "button",
  href,
  onClick,
  label,
  children,
  className = "",
}: {
  as?: "button" | "a";
  href?: string;
  onClick?: () => void;
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  const shared = `inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--fl-muted)] transition-colors hover:bg-[var(--fl-elevated)] hover:text-[var(--fl-text)] ${className}`;

  if (as === "a" && href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        title={label}
        aria-label={label}
        className={shared}
      >
        {children}
      </a>
    );
  }

  return (
    <button type="button" onClick={onClick} title={label} aria-label={label} className={shared}>
      {children}
    </button>
  );
}

function EmptyState({
  onCreate,
  onHelp,
  hasNotes,
}: {
  onCreate: () => void;
  onHelp: () => void;
  hasNotes: boolean;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <h2 className="mb-2 text-xl font-semibold tracking-tight text-[var(--fl-text)]">
        {hasNotes ? "Pick a note to start" : "Your notebook is empty"}
      </h2>
      <p className="mb-6 max-w-sm text-[14px] leading-relaxed text-[var(--fl-muted)]">
        {hasNotes
          ? "Choose something from the sidebar, or start something new."
          : "Create your first note. It saves to this device instantly, and to your GitHub repository once you connect one."}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button type="button" onClick={onCreate} className="fl-btn fl-btn-primary !py-2.5">
          New note
        </button>
        <button type="button" onClick={onHelp} className="fl-btn fl-btn-ghost !py-2.5">
          How does this work?
        </button>
      </div>
    </div>
  );
}

function SunGlyph() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    >
      <circle cx="8" cy="8" r="3" />
      <path d="M8 1v1.5M8 13.5V15M15 8h-1.5M2.5 8H1M12.95 3.05l-1.06 1.06M4.11 11.89l-1.06 1.06M12.95 12.95l-1.06-1.06M4.11 4.11 3.05 3.05" />
    </svg>
  );
}

function MoonGlyph() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    >
      <path d="M13.5 9.7A6 6 0 0 1 6.3 2.5a6 6 0 1 0 7.2 7.2Z" />
    </svg>
  );
}
