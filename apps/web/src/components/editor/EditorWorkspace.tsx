"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import type { CursorPosition, ImageBridge, LinkBridge } from "@forkleaf/editor";
import type { EditorViewMode } from "@forkleaf/types";
import {
  deriveTitle,
  dirname,
  documentStats,
  joinPath,
  serializeDocument,
  slugifyFilename,
  stripExtension,
} from "@forkleaf/markdown-engine";
import { useNotebook } from "@/hooks/useNotebook";
import { useLinks } from "@/hooks/useLinks";
import { useLocalFiles } from "@/hooks/useLocalFiles";
import type { LocalFile } from "@/lib/local-files";
import { useTheme } from "@/hooks/useTheme";
import { EditorSidebar } from "@/components/EditorSidebar";
import { EditorRightPanel } from "@/components/EditorRightPanel";
import { EditorStatusBar } from "@/components/EditorStatusBar";
import { EditorTabs } from "@/components/EditorTabs";
import { ConflictDialog } from "@/components/ConflictDialog";
import { ExportDialog } from "@/components/ExportDialog";
import { ConnectRepoDialog } from "@/components/ConnectRepoDialog";
import { ProposeChangesDialog } from "@/components/ProposeChangesDialog";
import { PublishDialog } from "@/components/PublishDialog";
import { HelpDialog } from "@/components/HelpDialog";
import { HistoryDialog } from "@/components/HistoryDialog";
import { PromptDialog, type PromptRequest } from "@/components/PromptDialog";
import { CommandPalette, type Command } from "@/components/CommandPalette";
import { StorageBlocked } from "@/components/StorageBlocked";
import { BootScreen } from "@/components/BootScreen";
import { ForkLeafLogo } from "@/components/Brand";
import { LocalOnlyBanner } from "@/components/LocalOnlyBanner";
import { signOut } from "@/lib/gateway";
import { assetPathFor, relativeSrc, resolveImageSrc, uploadImage } from "@/lib/assets";
import { flattenTree, isMarkdown } from "@/lib/library";
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

/**
 * The editor.
 *
 * `?ws=` and `?note=` are how the dashboard hands over a specific note. They
 * are read with `useSearchParams` rather than from `window.location`, because
 * on a client-side transition the component renders before the browser URL is
 * committed — which is exactly the case this has to work for. That is what the
 * Suspense boundary in the route above is for.
 */
export function EditorWorkspace() {
  const searchParams = useSearchParams();
  const notebook = useNotebook({
    workspaceId: searchParams.get("ws"),
    path: searchParams.get("note"),
  });
  const router = useRouter();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  /**
   * Which panel is open over the document on a narrow screen.
   *
   * On a phone both side panels used to be `hidden`, full stop. Not collapsed
   * to a rail, not behind a button — absent. That took the file tree, the
   * dashboard link, export, publish and the note's history off the device
   * entirely, so a phone could edit whichever note happened to be open and
   * nothing else. They are the same two panels; on a narrow screen they slide
   * over the document instead of sitting beside it.
   */
  const [drawer, setDrawer] = useState<"files" | "document" | null>(null);
  const [dialog, setDialog] = useState<
    "export" | "connect" | "help" | "history" | "propose" | "publish" | null
  >(null);
  // Dismissing the repo chooser has to be remembered, because the condition
  // that raises it stays true until a repository is actually connected.
  const [repoChoiceDismissed, setRepoChoiceDismissed] = useState(false);
  const [prompt, setPrompt] = useState<PromptRequest | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  // Conflicts open their own dialog as soon as they appear. Dismissing it hides
  // it until they are resolved; the status bar stays as the way back in.
  const [conflictsDismissed, setConflictsDismissed] = useState(false);
  // Where the caret is, when there is a source surface to ask. Null in rich
  // text, where a line and column would be a fiction.
  const [cursor, setCursor] = useState<CursorPosition | null>(null);
  const [theme, , toggleTheme] = useTheme();

  // Signed in with nothing connected: ask where the notes should live rather
  // than creating a repository on the user's account without being asked. The
  // dashboard asks the same question with more room; this is the answer for
  // anyone who came straight to the editor. Derived rather than pushed in from
  // an effect, which would render the editor once before the dialog appeared.
  const openDialog =
    dialog ??
    (notebook.ready && notebook.needsRepoChoice && !repoChoiceDismissed ? "connect" : null);

  const note = notebook.note;
  const mode: EditorViewMode = note?.viewMode ?? "wysiwyg";
  const title = note ? deriveTitle(note.content, note.frontmatter.title, note.path) : "";
  const workspace = notebook.activeWorkspace;
  const user = notebook.session?.user ?? null;

  const words = useMemo(() => (note ? documentStats(note.content).words : 0), [note]);

  const notePath = note?.path ?? null;

  /**
   * The folder the reader is currently working in.
   *
   * The note that is open, which is the only thing on screen that says where
   * "here" is. Everything that creates something — the button, the shortcut,
   * the command palette — starts from this rather than from the repository
   * root, because a note made while you are three folders deep belongs three
   * folders deep.
   */
  const currentFolder = notePath ? dirname(notePath) : "";
  const takenPaths = useMemo(() => flattenTree(notebook.tree), [notebook.tree]);

  /**
   * Where images in this note come from and go.
   *
   * The note always gets the same thing: a relative path to a file next to the
   * notes, `../assets/chart.png`, exactly as a hand-written markdown file would
   * — so it still renders on github.com, in an IDE, or anywhere else the
   * repository is opened.
   *
   * Only where the bytes go differs. A connected repository gets a real commit;
   * a workspace with no repository keeps them on this device under the path the
   * note names. Inlining the image into the note as a `data:` URI, which is
   * what used to happen without a repository, made a two-line note into a
   * screenful of base64 — unreadable in the source view, and useless to every
   * other tool that opens the file.
   */
  const images = useMemo<ImageBridge>(
    () => ({
      canUpload: true,
      storesLocally: Boolean(workspace?.isLocal),
      resolve: (src: string) => resolveImageSrc(workspace, notePath, src, notebook.assetUrls),
      upload: async (file: File) => {
        if (!workspace || !notePath) {
          throw new Error("Open a note before adding an image to it.");
        }

        const repoPath = assetPathFor(workspace, file, takenPaths, notePath);

        // On this device first, always — including for a connected repository.
        //
        // Pasting a screenshot used to wait on a full commit to GitHub before
        // anything appeared, so on a phone or a slow connection the editor sat
        // there doing nothing for seconds and the paste read as broken. The
        // bytes are already in hand; storing them locally is instant and gives
        // the image a URL to render from, which is the whole point of a
        // local-first app. The commit is the same commit, made a moment later.
        await notebook.putAsset(repoPath, file, false);
        const markdownSrc = relativeSrc(notePath, repoPath);

        if (workspace.isLocal) return markdownSrc;

        // Pushed in the background. A failure here is worth saying out loud —
        // the note renders either way, so silence would leave someone
        // believing an image had been committed when it had not.
        void uploadImage({ workspace, notePath, file, taken: takenPaths })
          .then(() => notebook.putAsset(repoPath, file, true))
          .catch((error: unknown) => {
            notebook.reportError(
              error instanceof Error
                ? `That image is on this device but has not reached GitHub: ${error.message}`
                : "That image is on this device but has not reached GitHub.",
            );
          });

        return markdownSrc;
      },
    }),
    [workspace, notePath, takenPaths, notebook],
  );

  /**
   * The `[[wikilink]]` graph for this workspace.
   *
   * Fed the tree's paths rather than only the open notes, so a link to a note
   * that has never been opened on this device still resolves — otherwise the
   * graph would depend on browsing history rather than on the repository.
   */
  const markdownPaths = useMemo(() => takenPaths.filter(isMarkdown), [takenPaths]);
  const workspaceIdForLinks = workspace?.id ?? null;

  const hrefForPath = useCallback(
    (path: string) =>
      workspaceIdForLinks
        ? `/editor?ws=${encodeURIComponent(workspaceIdForLinks)}&note=${encodeURIComponent(path)}`
        : `/editor?note=${encodeURIComponent(path)}`,
    [workspaceIdForLinks],
  );

  const links = useLinks({
    workspaceId: workspaceIdForLinks,
    paths: markdownPaths,
    openNotes: notebook.openNotes,
    loadNotes: notebook.allNotes,
    hrefFor: hrefForPath,
  });

  /**
   * Creates the note a link points at but that nobody has written yet.
   *
   * The title is the target as typed, which is what makes the link resolve the
   * moment the note exists: the filename is slugified, but the frontmatter
   * title is not, and either is enough for the resolver to match on.
   */
  const createLinked = useCallback(
    (target: string) => {
      const folder = dirname(links.createPathFor(target, notePath ?? ""));
      void notebook.createNote(target, folder);
    },
    [links, notePath, notebook],
  );

  const linkBridge = useMemo<LinkBridge>(
    () => ({
      resolve: links.resolve,
      open: (target) => {
        const path = links.pathFor(target);
        // Clicking a link to a note that has not been written yet writes it.
        // Refusing to navigate would be technically correct and useless.
        if (path) notebook.openNote(path);
        else createLinked(target);
      },
    }),
    [links, notebook, createLinked],
  );

  /**
   * Takes a file from this machine into the notebook.
   *
   * A file opened from the operating system becomes a real note — saved to
   * IndexedDB, synced to the repository like any other — that also happens to
   * have a file behind it. Anything less would mean a second kind of document
   * with its own tabs, its own storage and its own bugs, for no gain.
   *
   * Opening a file that is already open re-reads it into the tab it is already
   * in, rather than making a second copy. That is what every desktop editor
   * does, and the file on disk is the authority for a note that came from one.
   */
  const adoptFile = useCallback(
    async (file: LocalFile, existingNotePath: string | null): Promise<string | null> => {
      if (existingNotePath) {
        await notebook.replaceNoteContent(existingNotePath, file.text);
        notebook.openNote(existingNotePath);
        return existingNotePath;
      }

      const title = stripExtension(file.name) || "Untitled";
      const created = await notebook.createNote(title, "", file.text);
      return created?.path ?? null;
    },
    [notebook],
  );

  const localFiles = useLocalFiles(adoptFile);

  /**
   * Saves the note, and the file behind it when there is one.
   *
   * Local storage already has every keystroke; this is the deliberate save.
   * For an ordinary note that means pushing to GitHub now rather than waiting
   * out the debounce, and for a note opened from this machine it also means
   * writing the file — which is not done on every keystroke, because
   * continuously rewriting a file in someone's home directory is not something
   * an editor should do without being asked.
   */
  const saveEverything = useCallback(async () => {
    if (note) {
      const written = await localFiles.saveToFile(
        note.path,
        serializeDocument(note.content, note.frontmatter),
      );
      if (written) return;
    }

    await notebook.syncNow();
  }, [note, localFiles, notebook]);

  const conflicts = notebook.sync.conflicts;
  // Derived rather than pushed into state by an effect, which would cause a
  // second render pass on every sync update.
  const showConflicts = conflicts.length > 0 && !conflictsDismissed;

  // Records who is using ForkLeaf, for the analytics side. Fails silently and
  // never blocks the editor when Firebase is unconfigured.
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
        title: folder ? `New note in ${folder}` : "New note",
        label: "Title",
        initialValue: "Untitled note",
        confirmLabel: "Create",
        // Where it lands, stated before it lands there. A note created into
        // the wrong folder on a connected repository is already a commit by
        // the time anybody notices.
        body: folder
          ? `Saved as a file inside “${folder}”.`
          : "Saved at the top of your repository. Open a note first to create alongside it.",
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

  /**
   * Moves a note into another folder.
   *
   * A move and a rename are the same operation in a repository — the folder is
   * part of the path — so this is `renameNote` with the filename kept and the
   * directory replaced. Dragging is the only way to reorganise notes without
   * retyping their names, which on a tree of a few hundred is the difference
   * between reorganising and not bothering.
   */
  const handleMoveNote = useCallback(
    async (path: string, toFolder: string) => {
      const name = path.split("/").pop();
      if (!name) return;

      const target = joinPath(toFolder, name);
      if (target === path) return;

      const note =
        notebook.note?.path === path ? notebook.note : await notebook.openNoteAndReturn(path);
      if (!note) return;

      await notebook.renameNote(note, target);
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
        body:
          "Folders are made of the notes inside them, so this one appears in your repository as soon as it holds its first note. " +
          "Use slashes to make several at once, as in “SOC 101/Phishing analysis”.",
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

  /**
   * What ⌘K can do, beyond opening a note.
   *
   * Everything here is reachable by mouse somewhere else too — the palette is a
   * faster route to existing actions, not a second place where features live.
   */
  const commands = useMemo<Command[]>(() => {
    const list: Command[] = [
      {
        id: "new-note",
        label: "New note",
        group: "Notes",
        hint: "⌘⇧N",
        keywords: "create add write",
        run: () => handleCreate(currentFolder),
      },
      {
        id: "dashboard",
        label: "Go to dashboard",
        group: "Go to",
        hint: "⌘⇧D — every note, indexed and searchable",
        keywords: "home library overview repositories",
        run: () => router.push("/dashboard"),
      },
      {
        id: "profile",
        label: "Go to your profile",
        group: "Go to",
        run: () => router.push("/profile"),
      },
      { id: "docs", label: "Go to documentation", group: "Go to", run: () => router.push("/docs") },
      {
        id: "sync",
        label: "Push to GitHub now",
        group: "Sync",
        hint: "⌘S",
        keywords: "commit save upload",
        run: () => void notebook.syncNow(),
      },
      {
        id: "connect",
        label: "Connect a repository",
        group: "Sync",
        keywords: "github repo add workspace",
        run: () => setDialog("connect"),
      },
      {
        id: "theme",
        label: `Switch to ${theme === "dark" ? "light" : "dark"} theme`,
        group: "View",
        keywords: "dark light appearance",
        run: toggleTheme,
      },
      {
        id: "sidebar",
        label: sidebarCollapsed ? "Show the sidebar" : "Hide the sidebar",
        group: "View",
        hint: "⌘\\",
        run: () => setSidebarCollapsed((value) => !value),
      },
      {
        id: "panel",
        label: panelCollapsed ? "Show the document panel" : "Hide the document panel",
        group: "View",
        run: () => setPanelCollapsed((value) => !value),
      },
      {
        id: "help",
        label: "Help and shortcuts",
        group: "View",
        hint: "⌘⇧?",
        run: () => setDialog("help"),
      },
    ];

    // Actions that need a note to act on are absent rather than disabled: a
    // palette row you can select but that does nothing is worse than no row.
    if (note) {
      list.splice(
        1,
        0,
        ...MODES.map((option) => ({
          id: `mode-${option.value}`,
          label: `View as ${option.label.toLowerCase()}`,
          group: "View",
          hint: option.hint,
          keywords: "mode editor markdown preview",
          run: () => notebook.setViewMode(option.value),
        })),
        {
          id: "export",
          label: "Export this note",
          group: "Notes",
          hint: "⌘⇧E",
          keywords: "pdf html word markdown download",
          run: () => setDialog("export"),
        },
        {
          id: "rename",
          label: "Rename this note",
          group: "Notes",
          run: () => handleRename(note.path),
        },
        {
          id: "delete",
          label: "Delete this note",
          group: "Notes",
          run: () => handleDelete(note.path),
        },
      );

      if (localFiles.supported) {
        list.push({
          id: "save-file-as",
          label: "Save this note to a file…",
          group: "Notes",
          hint: "⇧⌘S",
          keywords: "export disk download local filesystem save as",
          run: () =>
            void localFiles.saveFileAs(
              note.path,
              `${slugifyFilename(title || "note")}.md`,
              serializeDocument(note.content, note.frontmatter),
            ),
        });
      }

      if (workspace && !workspace.isLocal) {
        list.push({
          id: "publish",
          label: "Publish this note as a page…",
          group: "Notes",
          hint: "A public link, served from your repo",
          keywords: "share public url link github pages website publish",
          run: () => setDialog("publish"),
        });

        list.push({
          id: "history",
          label: "Show this note's history",
          group: "Notes",
          hint: "Every save is a commit",
          keywords: "git commits versions diff revisions",
          run: () => setDialog("history"),
        });
      }
    }

    if (localFiles.supported) {
      list.push({
        id: "open-file",
        label: "Open a file from this computer…",
        group: "Notes",
        hint: "Edits the file itself",
        keywords: "import disk local filesystem md markdown open with",
        run: () => void localFiles.openFile(),
      });
    }

    return list;
  }, [
    note,
    title,
    workspace,
    theme,
    sidebarCollapsed,
    panelCollapsed,
    notebook,
    router,
    toggleTheme,
    handleCreate,
    currentFolder,
    handleRename,
    handleDelete,
    localFiles,
  ]);

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
        case "k":
          // Toggle rather than open: ⌘K is how people close it too, and a
          // palette that only opens traps the keyboard user who mistyped.
          event.preventDefault();
          setPaletteOpen((open) => !open);
          break;

        case "s":
          event.preventDefault();
          if (event.shiftKey) {
            // ⇧⌘S is Save as, everywhere. Only offered where the browser can
            // actually write files.
            if (note && localFiles.supported) {
              void localFiles.saveFileAs(
                note.path,
                `${slugifyFilename(title || "note")}.md`,
                serializeDocument(note.content, note.frontmatter),
              );
            }
            break;
          }
          void saveEverything();
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
            handleCreate(currentFolder);
          }
          break;

        case "d":
          if (event.shiftKey) {
            event.preventDefault();
            router.push("/dashboard");
          }
          break;

        case "\\":
          event.preventDefault();
          setSidebarCollapsed((value) => !value);
          break;

        // ⌘1/2/3 for the three view modes, the way every editor with modes
        // numbers them.
        case "1":
        case "2":
        case "3": {
          if (!note) break;
          const target = MODES[Number(event.key) - 1];
          if (!target) break;
          event.preventDefault();
          void notebook.setViewMode(target.value);
          break;
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [note, notebook, handleCreate, currentFolder, router, localFiles, saveEverything, title]);

  // ── Render ──────────────────────────────────────────────────────────────

  // Another tab is holding local storage. Nothing typed here could be saved,
  // so the editor does not open at all.
  if (notebook.storage === "blocked") return <StorageBlocked />;

  if (!notebook.ready) return <BootScreen message={notebook.busy ?? undefined} />;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--fl-bg)] font-sans text-[var(--fl-text)]">
      {/* The gap and the padding are what make the three panels read as
          separate surfaces rather than as one slab divided by hairlines. */}
      {drawer && (
        <button
          type="button"
          aria-label="Close panel"
          onClick={() => setDrawer(null)}
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
        />
      )}

      <div className="flex min-h-0 flex-1 gap-2 p-2 pb-0">
        {/* Beside the document from `md` up; a drawer over it below that.
            One component either way — a second, cut-down mobile file tree
            would be a second set of bugs. */}
        <div
          className={`fl-panel ${
            drawer === "files"
              ? "fixed inset-y-2 left-2 z-40 flex w-[min(19rem,85vw)] shadow-[var(--fl-shadow-lg)] md:static md:z-auto md:w-auto md:shadow-none"
              : "hidden md:flex"
          }`}
        >
          <EditorSidebar
            collapsed={sidebarCollapsed}
            onToggle={() => setSidebarCollapsed((value) => !value)}
            workspaces={notebook.workspaces}
            activeWorkspace={workspace}
            onSwitchWorkspace={notebook.switchWorkspace}
            onConnectRepo={() => setDialog("connect")}
            tree={notebook.tree}
            activePath={note?.path ?? null}
            onOpenNote={(path) => {
              notebook.openNote(path);
              // On a phone the drawer covers the note it just opened.
              setDrawer(null);
            }}
            onCreateNote={handleCreate}
            currentFolder={currentFolder}
            onDeleteNote={handleDelete}
            onRenameNote={handleRename}
            onCreateFolder={handleCreateFolder}
            onRenameFolder={handleRenameFolder}
            onDeleteFolder={handleDeleteFolder}
            onMoveNote={handleMoveNote}
            pinnedPaths={notebook.pinnedPaths}
            onTogglePin={notebook.togglePinned}
            onMovePin={notebook.movePinned}
            user={user}
            onSignIn={signIn}
            onSignOut={handleSignOut}
            onOpenHelp={() => setDialog("help")}
            onOpenPalette={() => setPaletteOpen(true)}
            githubAvailable={notebook.session?.githubAvailable ?? false}
          />
        </div>

        <main className="fl-panel flex min-w-0 flex-1 flex-col">
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
            {/* The way into the file tree — and therefore into the
                dashboard, the repository picker and everything else that
                lives in it — on a screen too narrow to show it beside the
                document. */}
            <button
              type="button"
              onClick={() => setDrawer((open) => (open === "files" ? null : "files"))}
              aria-expanded={drawer === "files"}
              aria-label="Notes and folders"
              className="shrink-0 rounded-lg p-1.5 text-[var(--fl-muted)] transition-colors hover:bg-[var(--fl-elevated)] hover:text-[var(--fl-text)] md:hidden"
            >
              <svg
                viewBox="0 0 16 16"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M1.75 4.25c0-.83.67-1.5 1.5-1.5h2.4c.5 0 .96.24 1.25.65l.6.85h5.25c.83 0 1.5.67 1.5 1.5v6.5c0 .83-.67 1.5-1.5 1.5H3.25c-.83 0-1.5-.67-1.5-1.5z" />
              </svg>
            </button>

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
                className="flex shrink-0 rounded-lg border border-[var(--fl-border)] bg-[var(--fl-surface)] p-0.5"
              >
                {MODES.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="tab"
                    aria-selected={mode === option.value}
                    title={option.hint}
                    onClick={() => notebook.setViewMode(option.value)}
                    className={`rounded-[6px] px-2 py-1 text-[12.5px] font-medium transition-colors sm:px-3 ${
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
              {/* Search reads as the way into everything, which it is: notes
                  first, then every command in the editor. */}
              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                title="Search notes and commands (⌘K)"
                className="hidden items-center gap-2 rounded-lg border border-[var(--fl-border)] bg-[var(--fl-surface)] py-1.5 pl-2.5 pr-2 text-[12.5px] text-[var(--fl-muted)] transition-colors hover:border-[var(--fl-border-strong)] hover:text-[var(--fl-text)] sm:inline-flex"
              >
                <SearchGlyph />
                <span>Search</span>
                <kbd className="rounded border border-[var(--fl-border)] bg-[var(--fl-elevated)] px-1 py-0.5 font-sans text-[10.5px]">
                  ⌘K
                </kbd>
              </button>

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

              {/* Export, publish, history and the note's properties all live
                  in the document panel, so below `lg` this button is the only
                  route to any of them. */}
              <IconButton
                onClick={() => setDrawer((open) => (open === "document" ? null : "document"))}
                label="Document, export and history"
                className="inline-flex lg:hidden"
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
          {[
            { text: notebook.error, dismiss: notebook.dismissError },
            { text: localFiles.error, dismiss: localFiles.clearError },
          ]
            .filter((banner) => banner.text)
            .map((banner) => (
              <div
                key={banner.text}
                role="alert"
                className="flex items-center gap-2 border-b border-[var(--fl-danger)]/30 bg-[var(--fl-danger)]/8 px-4 py-2 text-sm text-[var(--fl-danger)]"
              >
                <span className="flex-1">{banner.text}</span>
                <button
                  type="button"
                  onClick={banner.dismiss}
                  aria-label="Dismiss"
                  className="shrink-0 px-2"
                >
                  ✕
                </button>
              </div>
            ))}

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
                images={images}
                links={linkBridge}
                imageDestination={
                  workspace && !workspace.isLocal
                    ? `Committed to ${workspace.repo.owner}/${workspace.repo.repo}`
                    : "Saved to assets/ on this device"
                }
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

        {(!panelCollapsed || drawer === "document") && (
          <div
            className={`fl-panel ${
              drawer === "document"
                ? "fixed inset-y-2 right-2 z-40 flex w-[min(21rem,88vw)] shadow-[var(--fl-shadow-lg)] lg:static lg:z-auto lg:w-auto lg:shadow-none"
                : "hidden lg:flex"
            }`}
          >
            <EditorRightPanel
              collapsed={false}
              onToggle={() => (drawer === "document" ? setDrawer(null) : setPanelCollapsed(true))}
              note={note}
              workspace={workspace}
              onFrontmatterChange={notebook.updateFrontmatter}
              onExport={() => {
                setDrawer(null);
                setDialog("export");
              }}
              onShowHistory={() => {
                setDrawer(null);
                setDialog("history");
              }}
              onPublish={
                workspace && !workspace.isLocal
                  ? () => {
                      setDrawer(null);
                      setDialog("publish");
                    }
                  : undefined
              }
              syncMode={notebook.syncPreference.mode}
              onSyncNow={() => void saveEverything()}
              assetUrls={notebook.assetUrls}
              links={{
                ready: links.ready,
                backlinks: note ? links.backlinksFor(note.path) : [],
                outgoing: note ? links.outgoingFor(note.path) : [],
                titleFor: links.titleFor,
                onOpen: notebook.openNote,
                onCreate: createLinked,
              }}
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
        localFile={note ? localFiles.fileFor(note.path) : null}
        cursor={cursor}
        words={words}
        syncPreference={notebook.syncPreference}
        onSyncModeChange={notebook.setSyncMode}
        onSyncNow={() => void saveEverything()}
        onShowConflicts={() => setConflictsDismissed(false)}
      />

      {/* ── Dialogs ────────────────────────────────────────────────────── */}
      {openDialog === "export" && note && (
        <ExportDialog
          note={note}
          workspace={workspace}
          assetUrls={notebook.assetUrls}
          loadAllNotes={notebook.allNotes}
          onClose={() => setDialog(null)}
        />
      )}

      {openDialog === "help" && (
        <HelpDialog
          onClose={() => setDialog(null)}
          user={user}
          workspace={workspace}
          githubAvailable={notebook.session?.githubAvailable ?? false}
          onSignIn={signIn}
          onConnectRepo={() => setDialog("connect")}
        />
      )}

      {openDialog === "history" && note && workspace && !workspace.isLocal && (
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

      {paletteOpen && (
        <CommandPalette
          onClose={() => setPaletteOpen(false)}
          tree={notebook.tree}
          openNotes={notebook.openNotes}
          workspace={workspace}
          onOpenNote={notebook.openNote}
          commands={commands}
        />
      )}

      {openDialog === "publish" && workspace && !workspace.isLocal && note && (
        <PublishDialog workspace={workspace} note={note} onClose={() => setDialog(null)} />
      )}

      {openDialog === "propose" && workspace && !workspace.isLocal && user && (
        <ProposeChangesDialog
          workspace={workspace}
          login={user.login}
          subject={title || note?.path || "update documentation"}
          pendingChanges={notebook.pendingChanges}
          onProposed={notebook.discardPending}
          onClose={() => setDialog(null)}
          onSwitchBranch={notebook.switchBranch}
        />
      )}

      {openDialog === "connect" && (
        <ConnectRepoDialog
          onConnect={async (nextWorkspace) => {
            await notebook.addWorkspace(nextWorkspace);
            track("repo_connected");
            setDialog(null);
          }}
          onClose={() => {
            setDialog(null);
            setRepoChoiceDismissed(true);
          }}
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
  // The caller's display utility has to win. Tailwind resolves a conflict by
  // which class comes later in the generated stylesheet, not by the order they
  // appear in the attribute — so a base `inline-flex` here beat a `hidden`
  // passed in, and the panel toggle marked desktop-only was on screen on every
  // phone. Dropping the base when the caller states one is the only version of
  // this that cannot silently lose the argument.
  const statesDisplay = /(^|\s)(hidden|(inline-)?flex|block|inline)(\s|$)/.test(className);
  const display = statesDisplay ? "" : "inline-flex";

  const shared = `${display} h-8 w-8 items-center justify-center rounded-lg text-[var(--fl-muted)] transition-colors hover:bg-[var(--fl-elevated)] hover:text-[var(--fl-text)] ${className}`;

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

function SearchGlyph() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
    >
      <circle cx="7" cy="7" r="4.25" />
      <path d="m10.2 10.2 3.05 3.05" />
    </svg>
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
