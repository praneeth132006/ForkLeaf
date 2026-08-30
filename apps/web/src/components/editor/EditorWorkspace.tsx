"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import type { CursorPosition, ImageBridge, LinkBridge } from "@forkleaf/editor";
import { displayTitle, parseCitation, type PdfCitation } from "@forkleaf/pdf";
import type { EditorViewMode, Workspace } from "@forkleaf/types";
import {
  deriveTitle,
  dirname,
  documentStats,
  joinPath,
  parseRepoTarget,
  referencedPaths,
  type RepoTarget,
  serializeDocument,
  slugifyFilename,
  stripExtension,
} from "@forkleaf/markdown-engine";
import { useNotebook } from "@/hooks/useNotebook";
import { usePublishedPages } from "@/hooks/usePublishedPages";
import { useLinks } from "@/hooks/useLinks";
import { useLocalFiles } from "@/hooks/useLocalFiles";
import type { LocalFile, LocalPdf } from "@/lib/local-files";
import { usePdfReader } from "@/hooks/usePdfReader";
import { PdfReader } from "@/components/PdfReader";
import {
  localSource,
  pdfLinkTarget,
  pdfPathFor,
  readerUrl,
  repoSource,
  toBase64,
  whyCannotSave,
  type PdfSource,
} from "@/lib/pdf-source";
import { commitToBranch } from "@/lib/gateway";
import { readDroppedPdf } from "@/lib/local-files";
import { insertionFor, quoteMarkdown } from "@/lib/pdf-quote";
import { isPdfPath } from "@/lib/media";
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
import { ReviewPanel } from "@/components/ReviewPanel";
import { LinkFileDialog } from "@/components/LinkFileDialog";
import { RepoFileDialog } from "@/components/RepoFileDialog";
import { LinkHoverCard } from "@/components/LinkHoverCard";
import { CaptureDialog } from "@/components/CaptureDialog";
import { Dialog } from "@/components/Dialog";
import { PromptDialog, type PromptRequest } from "@/components/PromptDialog";
import { CommandPalette, type Command } from "@/components/CommandPalette";
import { StorageBlocked } from "@/components/StorageBlocked";
import { BootScreen } from "@/components/BootScreen";
import { LocalOnlyBanner } from "@/components/LocalOnlyBanner";
import { fetchSession, signOut } from "@/lib/gateway";
import { postHogReset } from "@/lib/posthog";
import { assetPathFor, relativeSrc, resolveImageSrc } from "@/lib/assets";
import { revealAsset } from "@/lib/reveal-asset";
import { imageTypeFor } from "@/lib/media";
import { collectFolders } from "@/lib/tree";
import { hasRelativeImages, repairNoteLinks } from "@/lib/repair-links";
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

/**
 * Where this device prefers to open a PDF.
 *
 * Read through `useSyncExternalStore` rather than copied into state by an
 * effect. `localStorage` is exactly what that hook is for — a value owned by
 * the browser rather than by React — and it gets two things for free: the
 * server render agrees with the first client render, and a change made in one
 * ForkLeaf tab reaches the others, so the setting does not drift between two
 * windows of the same notebook.
 */
const PDF_BESIDE_KEY = "forkleaf:pdf-beside-note";

function readPdfBeside(): boolean {
  try {
    return window.localStorage.getItem(PDF_BESIDE_KEY) === "1";
  } catch {
    // Storage can be blocked outright; the default is a fine answer.
    return false;
  }
}

function writePdfBeside(value: boolean): void {
  try {
    window.localStorage.setItem(PDF_BESIDE_KEY, value ? "1" : "0");
    // `storage` only fires in *other* tabs, so this tab is told by hand.
    window.dispatchEvent(new StorageEvent("storage", { key: PDF_BESIDE_KEY }));
  } catch {
    // Not worth surfacing; the reader still opens, just in the other place.
  }
}

function subscribeToPdfBeside(onChange: () => void): () => void {
  const handle = (event: StorageEvent) => {
    if (event.key === null || event.key === PDF_BESIDE_KEY) onChange();
  };
  window.addEventListener("storage", handle);
  return () => window.removeEventListener("storage", handle);
}

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
    | "export"
    | "connect"
    | "help"
    | "history"
    | "replay"
    | "blame"
    | "review"
    | "link-file"
    | "capture"
    | "propose"
    | "publish"
    | null
  >(null);
  /**
   * Something worth saying that is not a failure.
   *
   * The error banner is red and stays until dismissed, which is right for "that
   * did not save" and wrong for "your images are back". This is the quiet
   * channel: neutral, and it goes away on its own.
   */
  /**
   * The repository file a link was clicked on, being read.
   *
   * Its own state rather than a `dialog` value, because the dialog needs to
   * know *which* file — and a link can name one in a repository this workspace
   * is not even connected to.
   */
  const [viewingFile, setViewingFile] = useState<RepoTarget | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
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

  /**
   * Whether the note on screen is locked against editing.
   *
   * Read here rather than passed down piecemeal because four things depend on
   * it: the editing surfaces, the formatting bar, the properties panel, and
   * the button that says so.
   */
  const noteLocked = notebook.isLocked(notebook.activePath);

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

  // Which folders the sidebar should offer to put back under the sort mode.
  const manualFolders = useMemo(
    () =>
      Object.entries(notebook.treeOrder.manual)
        .filter(([, paths]) => paths.length > 0)
        .map(([folder]) => folder),
    [notebook.treeOrder],
  );

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

        /**
         * On this device first, and queued for GitHub second.
         *
         * Pasting a screenshot used to wait on a full commit before anything
         * appeared, so on a phone or a slow connection the editor sat there
         * doing nothing and the paste read as broken. The bytes are already in
         * hand: storing them locally is instant and gives the image something
         * to render from, which is the whole point of a local-first app.
         *
         * The commit is then the *same* commit as the note's own text, made by
         * the sync queue a moment later. That matters more than it sounds:
         * pushing the image separately meant a failed upload was lost in
         * silence while the note that referenced it synced happily, leaving a
         * note on GitHub pointing at a file which had never been committed —
         * and no way for either side to notice.
         */
        await notebook.putAsset(repoPath, file, false);

        return relativeSrc(notePath, repoPath);
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

  // ── The reader ────────────────────────────────────────────────────────
  //
  // A PDF is not a note and never becomes one: it has no markdown body, cannot
  // be edited, and would need its own branch at every place a note is written,
  // saved, synced or exported. It gets a pane of its own beside the note
  // instead — which is also the arrangement the feature exists for, since the
  // point of opening a paper in a notes app is to write about it.
  const reader = usePdfReader(workspace);
  const [readerCitation, setReaderCitation] = useState<PdfCitation | null>(null);
  /** The repo path of the document open in the reader, for writing links to. */
  const [readerPath, setReaderPath] = useState<string | null>(null);
  /** A PDF that could not even be read off the disk, before the reader saw it. */
  const [readerError, setReaderError] = useState<string | null>(null);
  /**
   * Whether a repository PDF opens beside the note rather than in its own tab.
   *
   * Remembered on this device, and off by default. It is a reading preference
   * — like which side the sidebar is on — not something worth writing into a
   * repository and committing.
   */
  const pdfBeside = useSyncExternalStore(subscribeToPdfBeside, readPdfBeside, () => false);
  const [savingPdf, setSavingPdf] = useState(false);

  const togglePdfBeside = useCallback(() => {
    writePdfBeside(!readPdfBeside());
  }, []);

  const openInReader = useCallback(
    (next: PdfSource, citation: PdfCitation | null, path: string | null) => {
      setReaderCitation(citation);
      setReaderPath(path);
      reader.open(next);
      // The reader shares the width with the note, so on a narrow screen the
      // panels beside them have to give way or there is nothing left for
      // either.
      setDrawer(null);
    },
    [reader],
  );

  /**
   * Opens a document from the repository in a tab of its own.
   *
   * The default, and the reason it is: a typeset page beside a note on a
   * laptop is around four hundred pixels wide, which is too narrow to read a
   * book at however carefully the panel is laid out. Reading full-width is the
   * common case; reading *beside the note you are writing* is the deliberate
   * one, and is a click away rather than the other way round.
   *
   * `noopener` because the opened tab has no business reaching back into this
   * one, and because without it the new tab's `window.opener` is a handle to
   * an editor holding somebody's notes.
   */
  const openPdfTab = useCallback(
    (path: string, citation: PdfCitation | null) => {
      if (!workspace || workspace.isLocal) return;
      window.open(readerUrl(workspace, path, citation), "_blank", "noopener,noreferrer");
    },
    [workspace],
  );

  const openLocalPdf = useCallback(
    (pdf: LocalPdf) => openInReader(localSource(pdf.name, pdf.bytes), null, null),
    [openInReader],
  );

  /**
   * A PDF dropped onto the window opens in the reader.
   *
   * Not a convenience. Firefox and Safari have no File System Access API, so
   * the "Open a PDF…" command does not exist there at all — dropping the file
   * is the only way in, and without it the whole feature would be a Chromium
   * feature. Dropping also skips a native dialog for the case the dialog
   * exists, which is the common one.
   *
   * Bound at the window rather than on a drop zone, because a drop zone that
   * only accepts a file over one particular rectangle is a target people miss.
   */
  useEffect(() => {
    const pdfFrom = (transfer: DataTransfer | null): File | null =>
      Array.from(transfer?.files ?? []).find(
        (file) => file.type === "application/pdf" || /\.pdf$/i.test(file.name),
      ) ?? null;

    const onDragOver = (event: DragEvent) => {
      // The default action for a dropped file is for the browser to navigate
      // to it, which throws away everything unsaved in the tab. Preventing the
      // dragover is what makes the drop reach us at all.
      if (event.dataTransfer?.types.includes("Files")) event.preventDefault();
    };

    const onDrop = (event: DragEvent) => {
      const file = pdfFrom(event.dataTransfer);
      if (!file) return;

      event.preventDefault();
      void readDroppedPdf(file)
        .then((pdf) => openInReader(localSource(pdf.name, pdf.bytes), null, null))
        .catch((problem: unknown) => {
          setReaderError(
            problem instanceof Error ? problem.message : "That PDF could not be opened.",
          );
        });
    };

    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [openInReader]);

  /**
   * Opens a PDF that lives in the repository, at a passage if one was asked for.
   */
  /**
   * Opens a repository PDF, wherever the reader prefers to see one.
   *
   * `beside` overrides the preference for the one call — used by the sidebar's
   * "Open beside this note", which is an explicit request rather than a
   * default.
   */
  const openRepoPdf = useCallback(
    (path: string, fragment: string, beside?: boolean) => {
      if (!workspace) return;
      const citation = fragment ? parseCitation(fragment) : null;

      if (beside ?? pdfBeside) {
        openInReader(repoSource(workspace, path), citation, path);
        return;
      }
      openPdfTab(path, citation);
    },
    [workspace, openInReader, openPdfTab, pdfBeside],
  );

  /**
   * Writes a cited passage into the note being read alongside.
   *
   * The link is written *relative to the note*, exactly as an image is, so the
   * markdown that lands in the file is the markdown a person would have
   * written by hand — and still resolves when the repository is opened in
   * anything else.
   */
  const citeIntoNote = useCallback(
    (citation: PdfCitation, withQuote: boolean) => {
      if (!note) return;

      const markdown = quoteMarkdown({
        // A document from the user's own disk has no path this repository can
        // resolve, so the quotation is attributed rather than linked.
        target: readerPath ? relativeSrc(note.path, readerPath) : null,
        title: reader.info
          ? displayTitle(reader.info.metadata, reader.source?.name ?? "")
          : (reader.source?.name ?? "PDF"),
        citation,
        includeQuote: withQuote,
      });

      // Appended at the end rather than at the caret: the caret is in the
      // editor, which has not been focused since the reader was opened, so its
      // recorded position is wherever it was several minutes and one document
      // ago. The end of the note is where a passage being read into it goes.
      const { text } = insertionFor(note.content, note.content.length, markdown);
      notebook.saveNote(text);
    },
    [note, readerPath, reader.info, reader.source, notebook],
  );

  const links = useLinks({
    workspaceId: workspaceIdForLinks,
    paths: markdownPaths,
    openNotes: notebook.openNotes,
    loadNotes: notebook.allNotes,
    hrefFor: hrefForPath,
    repo: workspace && !workspace.isLocal ? workspace.repo : null,
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
        /**
         * A link naming a file in the repository opens the file.
         *
         * Checked first, and it has to be: `repo:scripts/scan.sh` resolves to
         * no note, so this fell through to the branch below and offered to
         * create a note *called* `repo:scripts/scan.sh`. Every link the file
         * picker wrote was therefore unopenable, and clicking one left a junk
         * note behind.
         */
        const repoTarget = parseRepoTarget(target);
        if (repoTarget && workspace && !workspace.isLocal) {
          setViewingFile(repoTarget);
          return;
        }

        const path = links.pathFor(target);
        // Clicking a link to a note that has not been written yet writes it.
        // Refusing to navigate would be technically correct and useless.
        if (path) notebook.openNote(path);
        else createLinked(target);
      },
      /**
       * An ordinary markdown link to a PDF in this repository opens the reader.
       *
       * Claimed here rather than left to the browser because following it would
       * navigate the tab to a path that resolves against this app's origin and
       * 404s — the link is correct, and correct for github.com, and simply not
       * something a browser sitting on `/editor` can follow.
       */
      openHref: (href) => {
        if (!workspace || workspace.isLocal || !notePath) return false;

        const target = pdfLinkTarget(notePath, href);
        if (!target) return false;

        openRepoPdf(target.path, target.fragment);
        return true;
      },
    }),
    [links, notebook, createLinked, workspace, notePath, openRepoPdf],
  );

  /**
   * Whether the open document is one that could be kept, and why not.
   *
   * Only a document opened from this machine is offered — one already in the
   * repository is already kept, and offering to save it again would be a
   * button that commits an identical file.
   */
  const pdfSaveHint = useMemo(() => {
    const open = reader.source;
    if (!open || open.kind !== "local" || readerPath) return null;
    return whyCannotSave(workspace, open.bytes.length);
  }, [reader.source, readerPath, workspace]);

  const canSavePdf =
    reader.source?.kind === "local" && !readerPath && pdfSaveHint === null && !savingPdf;

  /**
   * Keeps a PDF opened from this machine in the repository.
   *
   * Until this exists, a document dragged in from the desktop can be read and
   * quoted but not *linked* — there is no path in the repository for a link to
   * point at, so the quotation gets a plain attribution instead. Committing
   * the file turns every citation of it into a real link, and turns a paper
   * somebody happened to have in Downloads into part of the notebook, with
   * history, on every device.
   *
   * It goes in beside the note being read from it, in a `papers/` folder, for
   * the same reason images go beside the note that uses them.
   */
  const savePdfToNotebook = useCallback(async () => {
    const open = reader.source;
    if (!workspace || !open || open.kind !== "local") return;

    setSavingPdf(true);
    try {
      const path = pdfPathFor(workspace, open.name, takenPaths, note?.path);

      await commitToBranch({
        owner: workspace.repo.owner,
        repo: workspace.repo.repo,
        branch: workspace.repo.branch,
        directory: workspace.repo.directory,
        message: `add ${path.split("/").pop()}`,
        changes: [{ op: "upsert", path, content: toBase64(open.bytes), encoding: "base64" }],
      });

      // The reader keeps showing the same bytes — re-fetching them through the
      // proxy to display what it is already displaying would be a round trip
      // for nothing. What changes is that the document now has an address, so
      // citing it can write a link.
      setReaderPath(path);
      await notebook.refreshTree();
    } catch (problem) {
      setReaderError(problem instanceof Error ? problem.message : "That PDF could not be saved.");
    } finally {
      setSavingPdf(false);
    }
  }, [reader.source, workspace, takenPaths, note, notebook]);

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

  const localFiles = useLocalFiles(adoptFile, openLocalPdf);

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
    /**
     * The permission choice comes first.
     *
     * Going straight to the OAuth route sends somebody to a GitHub screen
     * saying "full control of private repositories" with nothing to explain
     * why a notes app is asking, and no narrower option — which is a fair
     * reason to close the tab. `/sign-in` says what each level is for and
     * offers the public-repositories-only grant as an equal choice.
     */
    router.push("/sign-in");
  }, [router]);

  /**
   * Signing in again after a token expired, which is a different errand.
   *
   * It interrupted something: there is a note open and a queue waiting behind
   * a 401. So it says so on the sign-in page, and it comes back here rather
   * than to the dashboard — being bounced to a repository picker after fixing
   * a sign-in reads as having lost the note you were writing.
   */
  const signInAgain = useCallback(() => {
    track("github_sign_in_started");
    const here = `${window.location.pathname}${window.location.search}`;
    router.push(`/sign-in?expired=1&next=${encodeURIComponent(here)}`);
  }, [router]);

  /**
   * The click on a failed push, doing whichever of the two things is needed.
   *
   * "Click to retry" is only the right offer while the sign-in still works.
   * When it does not, retrying pushes into the same refusal and the bar
   * reprints the same red sentence with nothing having moved — and the app
   * does not always know which case it is in. A push can fail for a reason
   * that never names the sign-in: a 500 from our own route, a proxy in the
   * way, a request that died before GitHub answered. All of those print the
   * general "could not push" sentence, whose retry is a dead end whenever the
   * real reason underneath was the session.
   *
   * So a failing push asks the server where it stands before offering
   * anything. If the sign-in has gone, the click is the sign-in — one press,
   * from the control the reader already went for, instead of a retry that
   * fails and a button that appears afterwards. Only on a failure, so an
   * ordinary "sync now" still goes straight to pushing.
   */
  const retrySync = useCallback(async () => {
    const failing = notebook.sync.status === "error" || notebook.sync.status === "blocked";

    if (failing && workspace && !workspace.isLocal) {
      // A server we cannot reach tells us nothing about the sign-in, so it
      // falls through to the retry rather than throwing somebody who is merely
      // offline at a sign-in page.
      const session = await fetchSession().catch(() => null);
      if (session && session.mode !== "github" && session.githubAvailable) {
        signInAgain();
        return;
      }
    }

    // Straight to the push, not through `saveEverything`. That helper writes
    // the open note back to its linked file on this computer and stops there
    // when it does — which is right for ⌘S and wrong here, because it meant a
    // press of "retry" on a failed *GitHub* push wrote a local file and never
    // went near the queue. From this control the push is the whole point.
    await notebook.syncNow();
  }, [notebook, workspace, signInAgain]);

  /**
   * The element the note is drawn into, so a picture in it can be found.
   *
   * A ref rather than an id lookup: two editors are never on screen at once
   * today, but a `document.querySelector` that assumes so is a bug waiting for
   * the day one is.
   */
  const canvasRef = useRef<HTMLDivElement | null>(null);

  /**
   * Rings an image once the note it is in has actually drawn it.
   *
   * Opening a note is not the same as the note being on screen: its text is
   * fetched, the editor mounts, and an image resolves through an asset store
   * that may still be reading the bytes off this device. Marking the image in
   * the same tick as the open would reliably mark nothing.
   *
   * So it is retried across frames until the image appears or the window
   * closes. The window exists because "never" is a real answer — raw markdown
   * view draws no images at all — and something has to say so rather than
   * polling for the rest of the session.
   */
  const revealWhenDrawn = useCallback(
    (notePath: string, assetPath: string) =>
      new Promise<"revealed" | "not-rendered">((resolve) => {
        const deadline = Date.now() + 2500;

        const attempt = () => {
          const outcome = revealAsset({
            root: canvasRef.current,
            notePath,
            assetPath,
            // Recomputed each time: the resolver reads an asset store that
            // fills up while this is running, so its answer for a picture
            // being read off disk changes between one frame and the next.
            resolvedSrc: images.resolve?.(relativeSrc(notePath, assetPath)) ?? null,
          });

          if (outcome === "revealed" || Date.now() > deadline) {
            resolve(outcome);
            return;
          }

          requestAnimationFrame(attempt);
        };

        requestAnimationFrame(attempt);
      }),
    [images],
  );

  /**
   * Opens whatever a stuck file needs somebody to look at, and points at it.
   *
   * A note is its own answer — open it. A picture is not: it has no note of
   * its own, it lives inside one, and the one thing the reader needs is to be
   * standing in front of that note with the image in view.
   *
   * Which note that is used to be decided by `content.includes(filename)`,
   * which is a substring search for a bare name. It matched a note that merely
   * wrote the words `sunset.png` in a sentence, matched `archive/sunset.png`
   * in a different folder as readily as the picture actually queued, and, when
   * several notes were candidates, opened whichever came first. Every
   * reference form is resolved against the note holding it now, so the match
   * is the file and not its name.
   *
   * Opening the note was also only half the errand: in a note of any length,
   * "it is in here somewhere" is the same complaint the button was added to
   * answer, moved one step later. The image is scrolled to and ringed.
   */
  const locateUnsynced = useCallback(
    async (path: string) => {
      if (!imageTypeFor(path)) {
        await notebook.openNote(path);
        return;
      }

      const name = path.split("/").pop() ?? path;
      const notes = await notebook.allNotes();
      const holders = notes.filter((note) =>
        referencedPaths(note.path, note.content).includes(path),
      );
      const holder = holders[0];

      if (!holder) {
        setNotice(
          `${name} is not referenced by any note any more. Removing it will unblock everything else.`,
        );
        return;
      }

      await notebook.openNote(holder.path);

      // Also used in more than one note, which changes what removing it means.
      const alsoIn = holders.length > 1 ? ` It is used in ${holders.length} notes.` : "";

      const outcome = await revealWhenDrawn(holder.path, path);

      setNotice(
        outcome === "revealed"
          ? `${name} is here, in ${holder.path}.${alsoIn}`
          : // Raw markdown draws no images, so there is nothing on screen to
            // ring. Saying which note it is in beats a silent no-op.
            `${name} is in ${holder.path}. Switch to Rich or Split view to see it.${alsoIn}`,
      );
    },
    [notebook, revealWhenDrawn],
  );

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
          const created = await notebook.createNote(value || "Untitled note", folder);
          track("note_created");
          if (!created) return;

          /**
           * Where it went, said out loud and pointed at.
           *
           * The sidebar now opens the folders above a new note and scrolls to
           * it, which answers "where is it" for anybody looking at the sidebar
           * — but not for anybody who has it collapsed, or who is on a phone
           * where the tree is a drawer over the note. So the path is stated
           * too, and the sidebar is put back if it was folded away.
           */
          setSidebarCollapsed(false);
          setNotice(
            dirname(created.path)
              ? `Created ${created.path}`
              : `Created ${created.path}, at the top of the repository`,
          );
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

  /**
   * Makes a folder, somewhere you choose.
   *
   * `parent` is where the dialog was opened from — the right-click target, or
   * the folder of the note being edited — and it is a starting point rather
   * than a verdict. The picker lists every folder in the tree, so making a
   * subfolder under one you are not currently in no longer means closing this,
   * navigating there, and opening it again.
   */
  const handleCreateFolder = useCallback(
    (parent: string) => {
      const folders = collectFolders(notebook.tree);

      setPrompt({
        title: "New folder",
        label: "Folder name",
        initialValue: "",
        confirmLabel: "Create",
        body: "Folders are made of the notes inside them, so this one appears in your repository as soon as it holds its first note.",
        parent: {
          label: "Inside",
          // The root first, then every existing folder, so "somewhere else"
          // is a choice from a list rather than a path you have to spell.
          options: ["", ...folders],
          initial: folders.includes(parent) ? parent : "",
          rootLabel: notebook.activeWorkspace?.name ?? "Repository root",
        },
        onConfirm: async (value, chosenParent) => {
          const name = value.trim().replace(/^\/+|\/+$/g, "");
          if (!name) return;
          await notebook.createFolder(chosenParent ? `${chosenParent}/${name}` : name);
        },
      });
    },
    [notebook],
  );

  /**
   * Moves a folder under another one, from a drag in the tree.
   *
   * A folder move is a rename in a repository — git tracks files, so every note
   * beneath it moves and the old directory stops existing. `renameFolder`
   * already does exactly that, so this only has to work out the new path and
   * refuse the moves that would destroy the tree.
   */
  const handleMoveFolder = useCallback(
    async (path: string, toFolder: string) => {
      const name = path.split("/").pop();
      if (!name) return;

      // Into itself, into its own descendant, or back where it already is.
      // The first two would rename a folder to a path inside itself and lose
      // every note under it; the third is a no-op worth skipping before it
      // becomes a commit.
      if (toFolder === path || toFolder.startsWith(`${path}/`)) return;
      const target = toFolder ? `${toFolder}/${name}` : name;
      if (target === path) return;

      await notebook.renameFolder(path, target);
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

  /**
   * Disconnects a repository from this device.
   *
   * Worth spelling out in the dialog what this is not: no commit is made, and
   * nothing on GitHub is touched. What goes is this device's copy — the notes
   * cached here, the cached tree, and any queued change that never made it
   * out, which is the one part that is not recoverable and so is counted in
   * the warning rather than left as a surprise.
   */
  /**
   * What this repository has published, and whether the open note is one.
   *
   * Read once per workspace and shared by the panel and the dialog, so both
   * agree — and so publishing leaves a mark somewhere other than the dialog
   * that did it.
   */
  const publishedPages = usePublishedPages(workspace);

  const publishedNote = useMemo(() => {
    if (!note) return undefined;

    const slug = slugifyFilename(stripExtension(note.path.split("/").pop() ?? "note"));
    const page = publishedPages.pages.get(slug);

    return page ? { url: page.url } : undefined;
  }, [note, publishedPages.pages]);

  const handleDisconnectRepo = useCallback(
    (workspace: Workspace) => {
      const unpushed = notebook.sync.pendingCount;
      const isOpen = workspace.id === notebook.activeWorkspace?.id;

      setPrompt({
        title: "Disconnect repository",
        label: "",
        destructive: true,
        confirmLabel: "Disconnect",
        body:
          `“${workspace.name}” will be removed from this device. The repository on GitHub is not touched — ` +
          `everything pushed to it stays there, and connecting it again brings it all back.` +
          (isOpen && unpushed > 0
            ? ` ${unpushed} change${unpushed === 1 ? "" : "s"} here ${
                unpushed === 1 ? "has" : "have"
              } not been pushed yet, and will be lost.`
            : ""),
        onConfirm: async () => {
          await notebook.removeWorkspace(workspace.id);
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
          // By path, not by opening it first: reading the note reaches for
          // GitHub, and a note GitHub will not hand over — expired sign-in, no
          // connection — used to make Delete do nothing at all.
          await notebook.deleteNoteAt(path);
        },
      });
    },
    [notebook],
  );

  /**
   * Points a note's broken images back at the files they meant.
   *
   * Notes written before images were filed beside the note that uses them — or
   * moved by a version of this app that did not carry their links along — refer
   * to paths that hold nothing, and every picture in them is a broken box here
   * and on github.com. The files are still there; only the link is wrong, and
   * that is repairable without asking anybody anything.
   *
   * So it repairs itself, on open, rather than waiting for someone to discover
   * a menu item. A person who opens a note full of broken images wants the
   * images, not a diagnosis — and this is the only kind of edit an editor may
   * reasonably make unbidden: one that restores what the note already said,
   * changing where a link points and never what the note means.
   *
   * It is deliberately timid. Only links that resolve to nothing are touched,
   * only where the file is identifiable beyond doubt, and if the note has moved
   * on since — because somebody kept typing — the repair is dropped rather than
   * written over their work.
   */
  const repairImages = useCallback(
    async (options: { announce: boolean }) => {
      const note = notebook.note;
      if (!note || !hasRelativeImages(note.content)) return;

      const opened = note.content;
      const path = note.path;

      try {
        const result = await repairNoteLinks(
          workspace,
          path,
          opened,
          Object.keys(notebook.assetUrls),
        );

        if (result.fixed.length === 0) {
          if (!options.announce) return;
          setNotice(
            result.unresolved.length > 0
              ? `Nothing in this repository matches ${result.unresolved.length === 1 ? "that link" : "those links"}: ${result.unresolved.slice(0, 3).join(", ")}`
              : "Every image in this note points at a file that exists.",
          );
          return;
        }

        // Typed since it was read: their version is the one that counts.
        if (notebook.note?.path !== path || notebook.note.content !== opened) return;
        // Repairing image links rewrites the note, which is exactly the kind
        // of well-meaning automatic change a locked note is locked against.
        if (notebook.isLocked(path)) return;

        await notebook.saveNote(result.content);
        setNotice(
          `${result.fixed.length} ${result.fixed.length === 1 ? "image was" : "images were"} pointing at the wrong place. Fixed.` +
            (result.unresolved.length > 0
              ? ` ${result.unresolved.length} could not be found.`
              : ""),
        );
      } catch (error) {
        // Silent when nobody asked: a repository that cannot be read right now
        // is not a thing to interrupt somebody's writing about, and the note is
        // no worse off than it was.
        if (!options.announce) return;
        notebook.reportError(
          error instanceof Error ? error.message : "Those images could not be looked up.",
        );
      }
    },
    [notebook, workspace],
  );

  /**
   * Runs the repair once per note, as it is opened.
   *
   * Keyed by the note's path and checked against a set, so switching tabs back
   * and forth does not re-ask, and a note being typed in is never interrupted
   * by a second pass.
   */
  const healed = useRef<Set<string>>(new Set());

  useEffect(() => {
    const path = notebook.note?.path;
    if (!path || healed.current.has(path)) return;

    healed.current.add(path);
    void repairImages({ announce: false });
    // `repairImages` reads the open note through `notebook`, which changes on
    // every keystroke; depending on it here would re-run this on each one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notebook.note?.path]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 8000);
    return () => clearTimeout(timer);
  }, [notice]);

  /**
   * Says so when a note is updated from GitHub behind your back.
   *
   * Notes now refresh themselves when somebody else commits — but text that
   * rewrites itself while you are reading it is unnerving unless something
   * says why, and "which of my open notes just changed" is exactly what you
   * need to know afterwards.
   */
  const remoteChange = notebook.remoteChange;
  const [announcedPull, setAnnouncedPull] = useState<number | null>(null);

  if (remoteChange && remoteChange.at !== announcedPull) {
    setAnnouncedPull(remoteChange.at);
    const names = remoteChange.paths.map((path) => path.split("/").pop() ?? path);
    setNotice(
      names.length === 1
        ? `Updated ${names[0]} with a change from GitHub`
        : `Updated ${names.length} notes with changes from GitHub: ${names.join(", ")}`,
    );
  }

  const handleSignOut = useCallback(async () => {
    // Forgotten before the session goes, so the next person on this
    // browser is not attributed to the one who just left.
    postHogReset();
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
  /**
   * The two actions that belong in the "/" menu and the toolbar but cannot
   * live in the editor package: one has to list the repository, the other has
   * to fetch a web page. Gated exactly as their panel buttons are.
   */
  const editorExtras = useMemo(() => {
    const list: { id: string; label: string; hint: string; icon: React.ReactNode }[] = [];

    if (workspace && !workspace.isLocal) {
      list.push({
        id: "link-file",
        label: "Link a file",
        hint: "A file in this repository, pinned to the revision you read",
        // Drawn to the same recipe as the editor's own block icons — 16px
        // grid, 1.4 stroke, round caps — because it sits between them in the
        // "/" menu, where a thinner, squarer icon read as a rendering fault.
        icon: (
          <ExtraGlyph d="M9 1.75H4.5A1.75 1.75 0 0 0 2.75 3.5v9c0 .97.78 1.75 1.75 1.75h7a1.75 1.75 0 0 0 1.75-1.75V6zM9 1.75V6h4.25M7.1 11.4a1.2 1.2 0 0 0 1.7.1l.9-.9a1.2 1.2 0 0 0-1.7-1.7l-.4.4M8.4 10.1a1.2 1.2 0 0 0-1.7-.1l-.9.9a1.2 1.2 0 0 0 1.7 1.7l.4-.4" />
        ),
      });
    }

    if (user) {
      list.push({
        id: "capture",
        label: "Web source",
        hint: "A page with its address, the time you read it, and an archived copy",
        icon: (
          <ExtraGlyph d="M3.75 2.75h6.5a1 1 0 0 1 1 1V7M3.75 2.75v10.5L6.5 11.2M14 11a3 3 0 1 1-6 0 3 3 0 0 1 6 0M11 9.6v1.5l1 .7" />
        ),
      });
    }

    return list;
  }, [workspace, user]);

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
        id: "pull",
        label: "Check GitHub for changes now",
        group: "Sync",
        keywords: "pull refresh fetch update remote",
        run: () => void notebook.pullRemote(),
      },
      {
        id: "repair-images",
        label: "Find this note's missing images",
        group: "Notes",
        keywords: "broken image link repair fix missing picture",
        run: () => void repairImages({ announce: true }),
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
          id: "lock",
          label: noteLocked ? "Unlock this note" : "Lock this note against editing",
          group: "Notes",
          hint: "⌘⇧L",
          keywords: "lock unlock read only readonly protect freeze",
          run: () => notebook.toggleLocked(note.path),
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

      // Capturing needs a signed-in session for the server to fetch with, not
      // a connected repository: the citation is written into the note, and a
      // local notebook is as entitled to a source that outlives its page.
      if (user) {
        list.push({
          id: "capture",
          label: "Capture a web page as a source…",
          group: "Notes",
          hint: "Records the address, when you read it, and an archived copy",
          keywords:
            "capture clip source citation cite provenance archive wayback snapshot reference url link web page bookmark",
          run: () => setDialog("capture"),
        });

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

        list.push({
          id: "replay",
          label: "Replay how this note was written",
          group: "Notes",
          hint: "Scrub through every revision and watch it grow",
          keywords:
            "replay time travel timeline scrubber watch animate playback evolution growth shape history revisions",
          run: () => setDialog("replay"),
        });

        list.push({
          id: "blame",
          label: "See when each paragraph was written",
          group: "Notes",
          hint: "Dates in the margin, and what else you changed that day",
          keywords:
            "blame who wrote when written provenance attribution authorship age stale old paragraph line origin annotate",
          run: () => setDialog("blame"),
        });

        list.push({
          id: "link-file",
          label: "Link a file from this repository…",
          group: "Notes",
          hint: "Pick a file; the revision you read it at is pinned for you",
          keywords:
            "link file repo repository script code pin revision reference document describes attach",
          run: () => setDialog("link-file"),
        });

        list.push({
          id: "review",
          label: "Review this note as a pull request",
          group: "Notes",
          hint: "Read the comments on this branch, reply, and merge",
          keywords:
            "review pull request pr comments feedback merge approve changes requested critique reviewer discussion conversation",
          run: () => setDialog("review"),
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

      list.push({
        id: "open-pdf",
        label: "Open a PDF…",
        group: "Notes",
        hint: "Reads it beside your note, and quotes from it",
        keywords:
          "pdf paper document read reader cite citation quote source reference article book scan acrobat",
        run: () => void localFiles.openPdf(),
      });
    }

    list.push({
      id: "pdf-where",
      label: pdfBeside ? "Open PDFs in their own tab" : "Open PDFs beside the note instead",
      group: "View",
      hint: pdfBeside
        ? "Full width, which is how most documents want to be read"
        : "Half the window each, for writing straight from a source",
      keywords: "pdf tab window pane beside split side preference where open reader layout",
      run: togglePdfBeside,
    });

    if (reader.status !== "idle") {
      list.push({
        id: "close-pdf",
        label: "Close the PDF",
        group: "View",
        keywords: "pdf close reader hide document",
        run: () => reader.close(),
      });

      if (canSavePdf) {
        list.push({
          id: "save-pdf",
          label: "Save this PDF into my notebook",
          group: "Notes",
          hint: "Commits it beside your note, so citations become real links",
          keywords: "pdf save keep commit notebook repository store add paper document",
          run: () => void savePdfToNotebook(),
        });
      }
    }

    return list;
  }, [
    note,
    title,
    workspace,
    // Signing in adds the capture command; without this the list would keep
    // its signed-out shape until something else happened to invalidate it.
    user,
    // The lock command's label is the state, so it has to be rebuilt when the
    // state changes or the palette offers to lock a note that already is.
    noteLocked,
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
    repairImages,
    localFiles,
    reader,
    pdfBeside,
    togglePdfBeside,
    canSavePdf,
    savePdfToNotebook,
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

        case "l":
          // ⌘⇧L, not ⌘L: the browser's own ⌘L is the address bar, and taking
          // that away from somebody who meant it would be worse than the
          // shortcut not existing.
          if (event.shiftKey && note) {
            event.preventDefault();
            notebook.toggleLocked(note.path);
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
            onDisconnectRepo={handleDisconnectRepo}
            tree={notebook.tree}
            activePath={note?.path ?? null}
            onOpenNote={(path) => {
              // A PDF in the tree opens in the reader. It is in the tree
              // because ForkLeaf can open it; handing it to the notebook would
              // make a note whose body is the raw bytes of a PDF.
              if (isPdfPath(path)) openRepoPdf(path, "");
              else notebook.openNote(path);
              // On a phone the drawer covers the note it just opened.
              setDrawer(null);
            }}
            {...(workspace && !workspace.isLocal
              ? { onOpenPdfBeside: (path: string) => openRepoPdf(path, "", true) }
              : {})}
            {...(localFiles.supported ? { onOpenPdfFile: () => void localFiles.openPdf() } : {})}
            onCreateNote={handleCreate}
            currentFolder={currentFolder}
            onDeleteNote={handleDelete}
            onRenameNote={handleRename}
            onCreateFolder={handleCreateFolder}
            onRenameFolder={handleRenameFolder}
            onDeleteFolder={handleDeleteFolder}
            onMoveNote={handleMoveNote}
            onMoveFolder={handleMoveFolder}
            pinnedPaths={notebook.pinnedPaths}
            {...(notebook.expandedFolders ? { openFolders: notebook.expandedFolders } : {})}
            onOpenFoldersChange={notebook.setExpandedFolders}
            sortMode={notebook.treeOrder.mode}
            onSortModeChange={notebook.setTreeSortMode}
            onReorder={notebook.moveInTree}
            onReorderTo={notebook.dropInTree}
            onResetOrder={notebook.resetTreeOrder}
            manualFolders={manualFolders}
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

              {/* Beside the note it applies to, not in a menu: the whole
                  point is to be able to see at a glance whether the thing you
                  are about to type into will accept it. Absent with no note
                  open, since there would be nothing to lock. */}
              {note && (
                <IconButton
                  onClick={() => notebook.toggleLocked(note.path)}
                  label={
                    noteLocked
                      ? "Unlock this note so it can be edited (⌘⇧L)"
                      : "Lock this note against editing (⌘⇧L)"
                  }
                  className={
                    noteLocked
                      ? "inline-flex bg-[var(--fl-accent-soft)] text-[var(--fl-accent)]"
                      : ""
                  }
                >
                  {noteLocked ? <LockedGlyph /> : <UnlockedGlyph />}
                </IconButton>
              )}

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
          {notice && (
            <div
              role="status"
              className="flex items-center gap-2 border-b border-[var(--fl-border)] bg-[var(--fl-elevated)] px-4 py-2 text-sm text-[var(--fl-text)]"
            >
              <span className="flex-1">{notice}</span>
              <button
                type="button"
                onClick={() => setNotice(null)}
                aria-label="Dismiss"
                className="shrink-0 px-2 text-[var(--fl-muted)]"
              >
                ✕
              </button>
            </div>
          )}

          {[
            { text: notebook.error, dismiss: notebook.dismissError },
            { text: localFiles.error, dismiss: localFiles.clearError },
            { text: readerError, dismiss: () => setReaderError(null) },
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

          {/* An expired sign-in gets a banner rather than only a line in the
              status bar. It stops every push until it is dealt with, and the
              fix is one button — so the button is where the reader is looking,
              not eight point type at the bottom of the window. */}
          {/* Either half of the same fact: a push GitHub refused, or a read
              that came back 401 and ended the session. The second is the more
              common one by far — reading a note full of images is dozens of
              calls, pushing one is a handful — and it used to produce no
              banner at all. */}
          {(notebook.sync.lastErrorCode === "unauthorized" || notebook.sessionExpired) && (
            <div
              role="alert"
              className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[var(--fl-danger)]/30 bg-[var(--fl-danger)]/8 px-4 py-2.5 text-[13px]"
            >
              <p className="w-full min-w-0 text-[var(--fl-text)] sm:w-auto sm:flex-1">
                <strong className="font-semibold">Your GitHub sign-in has expired.</strong>{" "}
                <span className="text-[var(--fl-muted)]">
                  {notebook.sync.pendingCount > 0
                    ? `${notebook.sync.pendingCount} change${notebook.sync.pendingCount === 1 ? "" : "s"} are saved on this device and will push as soon as you are back in.`
                    : "Your notes are safe on this device. Images in them are served from GitHub, so they will not load until you sign in again."}
                </span>
              </p>

              <button
                type="button"
                onClick={signInAgain}
                className="shrink-0 rounded-lg bg-[var(--fl-accent)] px-3 py-1.5 text-[12.5px] font-semibold text-[var(--fl-accent-contrast)] transition-colors hover:bg-[var(--fl-accent-hover)]"
              >
                Sign in again
              </button>
            </div>
          )}

          {/* Not while the sign-in has just expired: "you are working locally"
              is true but is the wrong sentence to lead with, and the banner
              above it already says the useful half. */}
          {!user && !notebook.sessionExpired && (
            <LocalOnlyBanner
              githubAvailable={notebook.session?.githubAvailable ?? false}
              onSignIn={signIn}
              onLearnMore={() => setDialog("help")}
            />
          )}

          {/* ── Canvas ───────────────────────────────────────────────── */}
          <div ref={canvasRef} className="flex min-h-0 flex-1 flex-col">
            {note ? (
              <MarkdownEditor
                key={note.id}
                readOnly={noteLocked}
                extraActions={editorExtras}
                onExtraAction={(id) => setDialog(id === "link-file" ? "link-file" : "capture")}
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

        {/*
          The reader, beside the note.

          Its own panel rather than a dialog over the editor, because the whole
          point is to have both at once: a dialog would mean reading a
          paragraph, dismissing the document, writing about it, and reopening
          it — which is the workflow people use two windows to avoid.

          It takes the properties panel's place at this width rather than
          squeezing a third column in. Three columns of content on a laptop
          leaves the note about forty characters wide, which is not a width
          anybody writes at. Below `lg` it covers the window instead: a
          document page beside a note on a phone is two unreadable columns.

          One element, switched by class, and not two rendered at different
          breakpoints. Two would both mount — Tailwind's `hidden` hides a
          component, it does not stop it existing — so every page of the
          document would be parsed, laid out and drawn to a canvas twice, and
          the copy nobody can see would win half the races for the scroll
          container that `goToPage` looks up by selector.
        */}
        {reader.status !== "idle" && (
          <div className="fl-panel fixed inset-2 z-40 flex overflow-hidden shadow-[var(--fl-shadow-lg)] lg:static lg:z-auto lg:w-[min(46rem,45vw)] lg:shrink-0 lg:shadow-none">
            <PdfReader
              reader={reader}
              initialCitation={readerCitation}
              {...(note ? { onCite: citeIntoNote } : {})}
              onOpenInTab={
                readerPath
                  ? () => {
                      openPdfTab(readerPath, readerCitation);
                      reader.close();
                      setReaderCitation(null);
                      setReaderPath(null);
                    }
                  : null
              }
              onSave={canSavePdf ? () => void savePdfToNotebook() : null}
              saveHint={pdfSaveHint}
              saving={savingPdf}
              onClose={() => {
                reader.close();
                setReaderCitation(null);
                setReaderPath(null);
              }}
            />
          </div>
        )}

        {(!panelCollapsed || drawer === "document") && reader.status === "idle" && (
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
              locked={noteLocked}
              onFrontmatterChange={notebook.updateFrontmatter}
              onRewrite={notebook.saveNote}
              onExport={() => {
                setDrawer(null);
                setDialog("export");
              }}
              onShowHistory={() => {
                setDrawer(null);
                setDialog("history");
              }}
              onReview={
                workspace && !workspace.isLocal
                  ? () => {
                      setDrawer(null);
                      setDialog("review");
                    }
                  : undefined
              }
              onLinkFile={
                workspace && !workspace.isLocal
                  ? () => {
                      setDrawer(null);
                      setDialog("link-file");
                    }
                  : undefined
              }
              onOpenFile={
                workspace && !workspace.isLocal
                  ? (target) => {
                      setDrawer(null);
                      setViewingFile(target);
                    }
                  : undefined
              }
              onCapture={
                user
                  ? () => {
                      setDrawer(null);
                      setDialog("capture");
                    }
                  : undefined
              }
              onPublish={
                workspace && !workspace.isLocal
                  ? () => {
                      setDrawer(null);
                      setDialog("publish");
                    }
                  : undefined
              }
              published={publishedNote}
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
        locked={noteLocked}
        onSwitchBranch={notebook.switchBranch}
        onPropose={() => setDialog("propose")}
        sync={notebook.sync}
        sessionExpired={notebook.sessionExpired}
        workspace={workspace}
        notePath={note?.path ?? null}
        localFile={note ? localFiles.fileFor(note.path) : null}
        cursor={cursor}
        words={words}
        syncPreference={notebook.syncPreference}
        onSyncModeChange={notebook.setSyncMode}
        onSyncNow={() => void retrySync()}
        onShowConflicts={() => setConflictsDismissed(false)}
        onSignIn={signInAgain}
        onDiscardChange={(id) => void notebook.discardChange(id)}
        onLocateChange={(path) => void locateUnsynced(path)}
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

      {(openDialog === "history" || openDialog === "replay" || openDialog === "blame") &&
        note &&
        workspace &&
        !workspace.isLocal && (
          <HistoryDialog
            note={note}
            workspace={workspace}
            initialTab={openDialog === "history" ? "changes" : openDialog}
            onClose={() => setDialog(null)}
            onRestore={notebook.saveNote}
            resolveImageSrc={images.resolve}
          />
        )}

      {openDialog === "review" && note && workspace && !workspace.isLocal && (
        <Dialog
          title="Review &amp; merge"
          subtitle={`${note.path} · ${workspace.repo.owner}/${workspace.repo.repo} · ${workspace.repo.branch}`}
          onClose={() => setDialog(null)}
          wide
        >
          <ReviewPanel
            owner={workspace.repo.owner}
            repo={workspace.repo.repo}
            branch={workspace.repo.branch}
            path={note.path}
            content={note.content}
            onMerged={(base) => {
              // Back to the branch the work just landed on; staying on a
              // merged branch is how the next edit opens a second request
              // against a branch nobody is looking at any more.
              setDialog(null);
              void notebook.switchBranch(base);
            }}
          />
        </Dialog>
      )}

      {/* Every rendered surface at once — the preview, the rich-text editor,
          the file viewer, a revision being compared — because a link is a link
          in all of them and which one is on screen is the reader's choice.
          Signed out it still names the host and the address; only the page's
          own title needs a session to fetch. */}
      <LinkHoverCard within=".fl-prose, .ProseMirror" canRead={Boolean(user)} />

      {viewingFile && workspace && !workspace.isLocal && (
        <RepoFileDialog
          target={viewingFile}
          repo={workspace.repo}
          onClose={() => setViewingFile(null)}
        />
      )}

      {openDialog === "link-file" && workspace && !workspace.isLocal && (
        <LinkFileDialog
          workspace={workspace}
          onClose={() => setDialog(null)}
          onInsert={(link) => {
            const current = notebook.note;
            if (!current) return;
            // The write would be refused upstream anyway; saying so is the
            // difference between a lock and a button that does nothing.
            if (noteLocked) {
              setNotice("This note is locked. Unlock it — ⌘⇧L — to add to it.");
              return;
            }
            // Appended rather than inserted at the caret: the editor owns the
            // selection and this dialog has taken focus away from it.
            const separator = current.content.endsWith("\n") ? "" : "\n";
            void notebook.saveNote(`${current.content}${separator}\n${link}\n`);
            setNotice("Link added to the end of this note.");
          }}
        />
      )}

      {openDialog === "capture" && user && (
        <CaptureDialog
          onClose={() => setDialog(null)}
          onInsert={async (markdown) => {
            const current = notebook.note;
            if (!current) return;
            if (noteLocked) {
              setNotice("This note is locked. Unlock it — ⌘⇧L — to add a source to it.");
              return;
            }
            const separator = current.content.endsWith("\n") ? "" : "\n";
            await notebook.saveNote(`${current.content}${separator}\n${markdown}\n`);
            setNotice("Source added to the end of this note.");
          }}
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
        <PublishDialog
          // A fresh dialog per note: switching notes underneath it must not
          // leave the last one's address on screen as this one's.
          key={note.id}
          workspace={workspace}
          note={note}
          published={publishedNote}
          onSetTarget={async (target) => {
            await notebook.setPublishTarget(target);
            publishedPages.refresh();
          }}
          onChanged={publishedPages.refresh}
          onClose={() => setDialog(null)}
        />
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
          onUseManualSaving={() => {
            notebook.setSyncMode("manual");
            setNotice("Auto-save is off. Edit the note, then open Propose changes again.");
          }}
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

/**
 * The editor's own block-menu icon, for the two blocks that live out here.
 *
 * A copy of the `Glyph` helper in the editor package rather than an import of
 * it: that one is an implementation detail of the block list and is not
 * exported, and the two icons it draws beside these have to match to the pixel.
 */
function ExtraGlyph({ d }: { d: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  );
}

/**
 * A closed padlock — this note will not take a keystroke.
 *
 * Two glyphs rather than one drawn in two colours: colour alone is not a
 * state, and the shackle sitting up off the body is the part that reads as
 * "open" at a glance and at any contrast.
 */
function LockedGlyph() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3.25" y="7" width="9.5" height="7" rx="1.5" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
      <path d="M8 9.75v1.5" />
    </svg>
  );
}

/** The same padlock, open. */
function UnlockedGlyph() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3.25" y="7" width="9.5" height="7" rx="1.5" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 4.9-.6" />
      <path d="M8 9.75v1.5" />
    </svg>
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
