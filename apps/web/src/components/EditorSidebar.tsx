"use client";

import React, { useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { TreeNode, Workspace, SessionUser } from "@forkleaf/types";
import { FileTree } from "./FileTree";
import { ForkLeafMark } from "./Brand";
import { useDismissable } from "@/hooks/useDismissable";
import { collectFilePaths, collectFolders } from "@/lib/tree";
import { SORT_MODE_LABELS, type TreeSortMode } from "@/lib/tree-order";

export interface EditorSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  onSwitchWorkspace: (workspace: Workspace) => void;
  onConnectRepo: () => void;
  /**
   * Disconnects a repository from this device.
   *
   * The list only ever grew. Every repository ever opened stayed in this menu
   * — a fork tried once, a colleague's repo read for an afternoon — with no
   * way to say "not that one" short of clearing the browser's site data.
   */
  onDisconnectRepo: (workspace: Workspace) => void;
  tree: TreeNode[];
  activePath: string | null;
  onOpenNote: (path: string) => void;
  /** Opens a PDF in the panel beside the note, rather than in its own tab. */
  onOpenPdfBeside?: (path: string) => void;
  /** Opens a PDF from this computer. Absent where the browser cannot. */
  onOpenPdfFile?: () => void;
  onCreateNote: (folder: string) => void;
  /**
   * The folder a new note belongs in when nobody has said otherwise — the
   * folder of the note being edited.
   *
   * Without this, "New note" always meant "new note at the repository root",
   * so someone working inside `Fieldwork/Soil surveys` who pressed the
   * button got a file at the top of their repository. They then had to notice
   * it had happened and drag it back, which on GitHub had already been
   * committed to the wrong place.
   */
  currentFolder: string;
  onDeleteNote: (path: string) => void;
  onRenameNote: (path: string) => void;
  /** Make a folder inside `parent`. An empty string means the repository root. */
  onCreateFolder: (parent: string) => void;
  onRenameFolder: (path: string) => void;
  onDeleteFolder: (path: string) => void;
  /** Moves a note into another folder, from a drag within the tree. */
  onMoveNote: (path: string, toFolder: string) => void;
  /** Moves a folder, and everything under it, from a drag within the tree. */
  onMoveFolder: (path: string, toFolder: string) => void;
  /** How the tree is sorted when nobody has arranged a folder by hand. */
  sortMode: TreeSortMode;
  onSortModeChange: (mode: TreeSortMode) => void;
  /** Moves a row one step up or down inside its own folder. */
  onReorder: (siblings: readonly TreeNode[], path: string, direction: -1 | 1) => void;
  /** Drops a row into the gap above or below one of its own siblings. */
  onReorderTo: (
    siblings: readonly TreeNode[],
    path: string,
    target: string,
    position: "before" | "after",
  ) => void;
  /** Puts one folder's contents back under the automatic sort. */
  onResetOrder: (parent: string) => void;
  /** Folders somebody has arranged by hand. */
  manualFolders: readonly string[];
  /** Notes kept at the top, in the order they were put there. */
  pinnedPaths: readonly string[];
  /** Folders the reader had open last time, in the order they opened them. */
  openFolders?: readonly string[];
  /** Called when that set changes, so it can be remembered for next time. */
  onOpenFoldersChange?: (paths: string[]) => void;
  onTogglePin: (path: string) => void;
  onMovePin: (path: string, direction: -1 | 1) => void;
  user: SessionUser | null;
  onSignIn: () => void;
  onSignOut: () => void;
  onOpenHelp: () => void;
  /** Opens the command palette — the sidebar advertises it, the editor owns it. */
  onOpenPalette: () => void;
  githubAvailable: boolean;
}

/**
 * Left navigation: which repository you are in, and what is inside it.
 *
 * Collapses to an icon rail so the editor can take the full width on a laptop
 * screen without losing the ability to switch notes.
 */
export function EditorSidebar(props: EditorSidebarProps) {
  const [filter, setFilter] = useState("");
  const [showWorkspaces, setShowWorkspaces] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [showFolders, setShowFolders] = useState(false);
  const [showSort, setShowSort] = useState(false);
  const [showMore, setShowMore] = useState(false);

  /**
   * Each menu closes on Escape and on a click anywhere else.
   *
   * None of them did. A dropdown that only shuts when you click the exact
   * button that opened it is one people leave open — they click elsewhere,
   * nothing happens, and the panel sits over whatever they were reaching for.
   */
  const workspacesRef = useRef<HTMLDivElement | null>(null);
  const foldersRef = useRef<HTMLDivElement | null>(null);
  const accountRef = useRef<HTMLDivElement | null>(null);
  const sortRef = useRef<HTMLDivElement | null>(null);
  const moreRef = useRef<HTMLDivElement | null>(null);

  useDismissable(workspacesRef, showWorkspaces, () => setShowWorkspaces(false));
  useDismissable(foldersRef, showFolders, () => setShowFolders(false));
  useDismissable(accountRef, showAccount, () => setShowAccount(false));
  useDismissable(sortRef, showSort, () => setShowSort(false));
  useDismissable(moreRef, showMore, () => setShowMore(false));
  const searchRef = useRef<HTMLInputElement>(null);

  /**
   * Drops a filename filter that would hide the note just selected.
   *
   * The filter narrows the tree to matching filenames, so a note created while
   * one was typed — or opened from ⌘K, which searches everything — landed
   * somewhere the sidebar was refusing to draw. The tree said "Nothing matches
   * ‘soil’" about a note that certainly existed.
   *
   * Only when the selection moves, and only when it does not match: clearing
   * the field whenever the two disagreed would empty it as it was being typed,
   * because a half-typed filter rarely matches the note already open.
   */
  const [filteredFor, setFilteredFor] = useState(props.activePath);

  if (props.activePath !== filteredFor) {
    setFilteredFor(props.activePath);
    const path = props.activePath;
    if (filter && path && !path.toLowerCase().includes(filter.toLowerCase())) {
      setFilter("");
    }
  }

  // Every folder at every depth, so "new note" can mean "new note somewhere in
  // particular" without making the reader find the folder first. Listing only
  // the top level meant a note could never be put in a subfolder from here.
  const folders = useMemo(() => collectFolders(props.tree), [props.tree]);

  // A pinned note that has since been deleted or renamed elsewhere is dropped
  // from the list rather than shown as a row that opens nothing.
  const pinned = useMemo(() => {
    const existing = new Set(collectFilePaths(props.tree));
    return props.pinnedPaths.filter((path) => existing.has(path));
  }, [props.pinnedPaths, props.tree]);

  if (props.collapsed) {
    return (
      <nav className="flex w-12 shrink-0 flex-col items-center gap-1 py-2.5">
        <Link
          href="/"
          title="ForkLeaf home"
          className="mb-1 flex h-8 w-8 items-center justify-center rounded-lg text-[var(--fl-accent)] transition-colors hover:bg-[var(--fl-elevated)]"
        >
          <ForkLeafMark className="h-5 w-5" />
        </Link>
        <RailButton label="Expand sidebar" onClick={props.onToggle}>
          <svg
            viewBox="0 0 16 16"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          >
            <path d="M2.5 4h11M2.5 8h11M2.5 12h11" />
          </svg>
        </RailButton>
        <RailButton
          label={props.currentFolder ? `New note in ${props.currentFolder}` : "New note"}
          onClick={() => props.onCreateNote(props.currentFolder)}
        >
          <svg
            viewBox="0 0 16 16"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          >
            <path d="M8 3.5v9M3.5 8h9" />
          </svg>
        </RailButton>
        <RailButton label="Search notes and commands (⌘K)" onClick={props.onOpenPalette}>
          <svg
            viewBox="0 0 16 16"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          >
            <circle cx="7" cy="7" r="4.25" />
            <path d="m10.2 10.2 3.05 3.05" />
          </svg>
        </RailButton>
        <Link
          href="/dashboard"
          title="Dashboard (⌘⇧D)"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--fl-muted)] transition-colors hover:bg-[var(--fl-elevated)] hover:text-[var(--fl-text)]"
        >
          <DashboardGlyph />
          <span className="sr-only">Dashboard</span>
        </Link>
        <RailButton label="Help" onClick={props.onOpenHelp} className="mt-auto">
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
        </RailButton>
      </nav>
    );
  }

  return (
    <nav className="flex w-64 shrink-0 flex-col">
      {/* ── Workspace switcher ────────────────────────────────────────── */}
      <div className="relative border-b border-[var(--fl-border)] p-2" ref={workspacesRef}>
        <div className="flex items-center gap-1">
          {/* The leaf reads as a logo, so it behaves like one and goes home.
              It used to open the workspace menu, which left the editor with no
              way back to the landing page at this width. */}
          <Link
            href="/"
            title="ForkLeaf home"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--fl-accent-soft)] text-[var(--fl-accent)] transition-opacity hover:opacity-80"
          >
            <ForkLeafMark className="h-4 w-4" />
            <span className="sr-only">ForkLeaf home</span>
          </Link>

          <button
            type="button"
            onClick={() => setShowWorkspaces((value) => !value)}
            aria-expanded={showWorkspaces}
            aria-haspopup="true"
            className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-[var(--fl-elevated)]"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-[var(--fl-text)]">
                {props.activeWorkspace?.name ?? "No workspace"}
              </span>
              <span className="block truncate text-[11px] text-[var(--fl-muted)]">
                {props.activeWorkspace?.isLocal
                  ? "This device only"
                  : `${props.activeWorkspace?.repo.owner}/${props.activeWorkspace?.repo.repo}`}
              </span>
            </span>
            <ChevronDown />
          </button>

          <RailButton label="Collapse sidebar" onClick={props.onToggle}>
            <svg
              viewBox="0 0 16 16"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9.5 4 5.5 8l4 4" />
            </svg>
          </RailButton>
        </div>

        {showWorkspaces && (
          <div
            aria-label="Connected repositories"
            className="absolute left-2 right-2 top-full z-30 mt-1 overflow-hidden rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-1 shadow-[var(--fl-shadow-lg)]"
          >
            {props.workspaces.map((workspace) => (
              /* Two buttons, so the row is a group rather than an option: a
                 listbox option cannot contain a control of its own, and
                 disconnecting is not a way of choosing. */
              <div key={workspace.id} className="flex items-center gap-0.5">
                <button
                  type="button"
                  aria-current={workspace.id === props.activeWorkspace?.id}
                  onClick={() => {
                    props.onSwitchWorkspace(workspace);
                    setShowWorkspaces(false);
                  }}
                  className={`block min-w-0 flex-1 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-[var(--fl-elevated)] ${
                    workspace.id === props.activeWorkspace?.id
                      ? "text-[var(--fl-accent)]"
                      : "text-[var(--fl-text)]"
                  }`}
                >
                  <span className="block truncate text-[13px] font-medium">{workspace.name}</span>
                  <span className="block truncate text-[11px] text-[var(--fl-muted)]">
                    {workspace.isLocal
                      ? "This device only"
                      : `${workspace.repo.owner}/${workspace.repo.repo} · ${workspace.repo.branch}`}
                  </span>
                </button>

                {/* Not offered for the on-device workspace: it is where notes
                    go when there is nowhere else, and there would be nothing
                    left to disconnect it to. */}
                {!workspace.isLocal && (
                  <button
                    type="button"
                    aria-label={`Disconnect ${workspace.name}`}
                    title={`Disconnect ${workspace.name} from this device`}
                    onClick={() => {
                      props.onDisconnectRepo(workspace);
                      setShowWorkspaces(false);
                    }}
                    className="shrink-0 rounded-lg p-1.5 text-[var(--fl-muted)] transition-colors hover:bg-[var(--fl-elevated)] hover:text-[var(--fl-danger)]"
                  >
                    <svg
                      viewBox="0 0 16 16"
                      className="h-3.5 w-3.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    >
                      <path d="M4 4l8 8M12 4l-8 8" />
                    </svg>
                  </button>
                )}
              </div>
            ))}

            {props.user ? (
              <button
                type="button"
                onClick={() => {
                  props.onConnectRepo();
                  setShowWorkspaces(false);
                }}
                className="mt-1 block w-full border-t border-[var(--fl-border)] px-2.5 pb-1 pt-2 text-left text-[13px] font-medium text-[var(--fl-accent)]"
              >
                Connect another repository…
              </button>
            ) : (
              <p className="mt-1 border-t border-[var(--fl-border)] px-2.5 pb-1 pt-2 text-[11.5px] leading-snug text-[var(--fl-muted)]">
                Sign in with GitHub to connect a repository.
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── New note ──────────────────────────────────────────────────── */}
      {/* Creating a note is the one thing someone opens this app to do, and it
          used to be a 34px square sharing a row with the search field. */}
      <div className="relative flex items-stretch gap-1.5 px-2 pt-2" ref={foldersRef}>
        <button
          type="button"
          onClick={() => props.onCreateNote(props.currentFolder)}
          title={
            props.currentFolder
              ? `New note in ${props.currentFolder} (⌘⇧N)`
              : "New note at the top of the repository (⌘⇧N)"
          }
          className="flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg bg-[var(--fl-accent)] px-3 py-2 text-[13px] font-semibold text-[var(--fl-accent-contrast)] transition-colors hover:bg-[var(--fl-accent-hover)]"
        >
          <svg
            viewBox="0 0 16 16"
            aria-hidden="true"
            className="h-3.5 w-3.5 shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
          >
            <path d="M8 3.5v9M3.5 8h9" />
          </svg>
          New Note
        </button>

        {/* Opening a PDF was reachable only from the command palette, which
            means it was reachable only by people who already knew it existed.
            It sits beside "New note" because it is the same kind of act: the
            other way a document gets into the notebook. */}
        {props.onOpenPdfFile && (
          <button
            type="button"
            onClick={props.onOpenPdfFile}
            title="Open a PDF from this computer"
            aria-label="Open a PDF from this computer"
            className="flex w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--fl-border)] text-[var(--fl-muted)] transition-colors hover:border-[var(--fl-border-strong)] hover:text-[var(--fl-text)]"
          >
            <svg
              viewBox="0 0 16 16"
              aria-hidden="true"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinejoin="round"
              strokeLinecap="round"
            >
              <path d="M3.4 2.4h5.2l3.5 3.5v7.2a.9.9 0 0 1-.9.9H3.4a.9.9 0 0 1-.9-.9V3.3a.9.9 0 0 1 .9-.9Z" />
              <path d="M8.6 2.4v3.5h3.5" />
              <path d="M5 8.4h5.6M5 10.4h5.6M5 12.3h3.4" />
            </svg>
          </button>
        )}

        <button
          type="button"
          onClick={() => props.onCreateFolder(props.currentFolder)}
          title={props.currentFolder ? `New folder in ${props.currentFolder}` : "New folder"}
          aria-label="New folder"
          className="flex w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--fl-border)] text-[var(--fl-muted)] transition-colors hover:border-[var(--fl-border-strong)] hover:text-[var(--fl-text)]"
        >
          <svg
            viewBox="0 0 16 16"
            aria-hidden="true"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          >
            <path d="M1.75 4.25c0-.83.67-1.5 1.5-1.5h2.4c.5 0 .96.24 1.25.65l.6.85h5.25c.83 0 1.5.67 1.5 1.5v6.5c0 .83-.67 1.5-1.5 1.5H3.25c-.83 0-1.5-.67-1.5-1.5z" />
            <path d="M8 7.75v4M6 9.75h4" />
          </svg>
        </button>

        {folders.length > 0 && (
          <button
            type="button"
            onClick={() => setShowFolders((value) => !value)}
            aria-expanded={showFolders}
            aria-haspopup="menu"
            title="New note in a folder"
            aria-label="New note in a folder"
            className="flex w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--fl-accent)] text-[var(--fl-accent-contrast)] transition-colors hover:bg-[var(--fl-accent-hover)]"
          >
            <ChevronDown className="text-current" />
          </button>
        )}

        {showFolders && (
          <div
            role="menu"
            className="absolute left-2 right-2 top-full z-30 mt-1 overflow-hidden rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-1 shadow-[var(--fl-shadow-lg)]"
          >
            <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--fl-muted)]">
              New note in
            </p>
            {/* The root is a destination like any other, and now that the
                button itself follows the open note it is the one place that
                would otherwise have become unreachable from here. */}
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                props.onCreateNote("");
                setShowFolders(false);
              }}
              className="block w-full truncate rounded-lg px-2.5 py-1.5 text-left text-[12.5px] text-[var(--fl-text)] transition-colors hover:bg-[var(--fl-elevated)]"
            >
              {props.activeWorkspace?.name ?? "Repository root"}
            </button>
            {folders.map((folder) => (
              <button
                key={folder}
                type="button"
                role="menuitem"
                onClick={() => {
                  props.onCreateNote(folder);
                  setShowFolders(false);
                }}
                style={{ paddingLeft: `${0.625 + folder.split("/").length * 0.6}rem` }}
                className="block w-full truncate rounded-lg py-1.5 pr-2.5 text-left text-[12.5px] text-[var(--fl-text)] transition-colors hover:bg-[var(--fl-elevated)]"
              >
                {folder.split("/").pop()}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Filter ────────────────────────────────────────────────────── */}
      {/* This narrows the tree by filename. Searching by title, across every
          note whether or not it is open, is what ⌘K is for — the button below
          says so rather than leaving people to discover it. */}
      <div className="relative px-2 pt-2">
        <SearchGlyph />
        <input
          ref={searchRef}
          type="search"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Filter by filename…"
          aria-label="Filter notes by filename"
          className="fl-input w-full !pl-8"
        />
      </div>

      <div className="px-2 pb-1 pt-1.5">
        <button
          type="button"
          onClick={props.onOpenPalette}
          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] text-[var(--fl-muted)] transition-colors hover:bg-[var(--fl-elevated)] hover:text-[var(--fl-text)]"
        >
          <span className="min-w-0 flex-1 truncate">Search everything by title</span>
          <kbd className="shrink-0 rounded border border-[var(--fl-border)] px-1 py-px font-sans text-[10px]">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* ── Tree ──────────────────────────────────────────────────────── */}
      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-2">
        {/* Pinned notes, above the tree.
            A repository has no file order of its own — git sorts the tree —
            so an order the app invented would have to be written into the
            repository as a manifest nothing else reads. Pinning is the honest
            version of "put these where I can reach them": a handful of notes,
            in an order somebody chose, kept with the other per-device
            preferences rather than committed. */}
        {pinned.length > 0 && (
          <>
            <p className="px-2 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--fl-muted)]">
              Pinned
            </p>
            <ul className="mb-2 space-y-px">
              {pinned.map((path, index) => (
                <li key={path} className="group/pin flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => props.onOpenNote(path)}
                    title={path}
                    className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-[5px] text-left text-[14px] transition-colors hover:bg-[var(--fl-elevated)] ${
                      props.activePath === path
                        ? "bg-[var(--fl-elevated)] text-[var(--fl-text)]"
                        : "text-[var(--fl-muted)]"
                    }`}
                  >
                    <PinGlyph />
                    <span className="min-w-0 flex-1 truncate">{nameOf(path)}</span>
                  </button>

                  {/* Reordering is the only thing about this list anybody
                      chose, so it is directly editable. Shown on hover and on
                      keyboard focus — a control reachable only by hovering is
                      not reachable by keyboard at all. */}
                  <span className="flex shrink-0 opacity-0 transition-opacity focus-within:opacity-100 group-hover/pin:opacity-100">
                    <PinMoveButton
                      label={`Move ${nameOf(path)} up`}
                      disabled={index === 0}
                      onClick={() => props.onMovePin(path, -1)}
                      direction="up"
                    />
                    <PinMoveButton
                      label={`Move ${nameOf(path)} down`}
                      disabled={index === pinned.length - 1}
                      onClick={() => props.onMovePin(path, 1)}
                      direction="down"
                    />
                    <PinMoveButton
                      label={`Unpin ${nameOf(path)}`}
                      onClick={() => props.onTogglePin(path)}
                      direction="unpin"
                    />
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        {/* The heading is also where the order is chosen, because the order is
            a fact about this list and nowhere else in the app is about it.
            Buried in a settings screen it would be a preference nobody found;
            here it is next to the thing it changes. */}
        <div className="relative flex items-center gap-1 px-2 pb-1.5 pt-1" ref={sortRef}>
          <p className="min-w-0 flex-1 truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--fl-muted)]">
            {props.activeWorkspace?.isLocal ? "Notes" : "Repository"}
          </p>

          <button
            type="button"
            onClick={() => setShowSort((value) => !value)}
            aria-expanded={showSort}
            aria-haspopup="menu"
            title={`Sort: ${SORT_MODE_LABELS[props.sortMode]}`}
            aria-label={`Change the order. Currently ${SORT_MODE_LABELS[props.sortMode]}.`}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--fl-muted)] transition-colors hover:bg-[var(--fl-elevated)] hover:text-[var(--fl-text)]"
          >
            <SortGlyph />
          </button>

          {showSort && (
            <div
              role="menu"
              className="absolute right-1 top-full z-30 w-64 rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-1 shadow-xl"
            >
              <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--fl-muted)]">
                Sort by
              </p>

              {(Object.keys(SORT_MODE_LABELS) as TreeSortMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  role="menuitemradio"
                  aria-checked={props.sortMode === mode}
                  onClick={() => {
                    props.onSortModeChange(mode);
                    setShowSort(false);
                  }}
                  className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors hover:bg-[var(--fl-elevated)] ${
                    props.sortMode === mode ? "text-[var(--fl-text)]" : "text-[var(--fl-muted)]"
                  }`}
                >
                  {/* Hidden from assistive technology: `aria-checked` already
                      says which one is on, and a tick in the accessible name
                      makes the row read as "tick, Date created". */}
                  <span aria-hidden="true" className="w-3 shrink-0 text-[var(--fl-accent)]">
                    {props.sortMode === mode ? "✓" : ""}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{SORT_MODE_LABELS[mode]}</span>
                </button>
              ))}

              <p className="border-t border-[var(--fl-border)] px-2.5 pb-1.5 pt-2 text-[11.5px] leading-relaxed text-[var(--fl-muted)]">
                Drag a note or folder onto the gap above or below one of its neighbours to arrange a
                folder by hand, or use Move up and Move down in its right-click menu.
              </p>

              {/* Only when there is something to undo. An always-present
                  "reset" on a tree nobody has touched is a button that does
                  nothing, sitting where a reader has to read past it. */}
              {props.manualFolders.length > 0 && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    for (const folder of props.manualFolders) props.onResetOrder(folder);
                    setShowSort(false);
                  }}
                  className="mt-0.5 flex w-full items-center rounded-lg px-2.5 py-1.5 text-left text-[13px] text-[var(--fl-muted)] transition-colors hover:bg-[var(--fl-elevated)] hover:text-[var(--fl-text)]"
                >
                  Reset {props.manualFolders.length === 1 ? "the folder" : "all folders"} arranged
                  by hand
                </button>
              )}
            </div>
          )}
        </div>

        <FileTree
          nodes={props.tree}
          activePath={props.activePath}
          onOpen={props.onOpenNote}
          {...(props.onOpenPdfBeside ? { onOpenBeside: props.onOpenPdfBeside } : {})}
          onDelete={props.onDeleteNote}
          onRename={props.onRenameNote}
          onCreateIn={props.onCreateNote}
          onCreateFolder={props.onCreateFolder}
          onMoveNote={props.onMoveNote}
          onMoveFolder={props.onMoveFolder}
          onReorder={props.onReorder}
          onReorderTo={props.onReorderTo}
          onResetOrder={props.onResetOrder}
          manualFolders={props.manualFolders}
          onTogglePin={props.onTogglePin}
          pinnedPaths={props.pinnedPaths}
          onRenameFolder={props.onRenameFolder}
          onDeleteFolder={props.onDeleteFolder}
          {...(props.openFolders ? { openFolders: props.openFolders } : {})}
          {...(props.onOpenFoldersChange ? { onOpenFoldersChange: props.onOpenFoldersChange } : {})}
          filter={filter}
        />
      </div>

      {/* ── Footer: the ways out, help, account ───────────────────────── */}
      <div className="border-t border-[var(--fl-border)] p-2">
        {/* Three rows became one.

            The editor used to be a room with no marked exits, so exits were
            added — and then each new one took another row off the bottom of the
            tree. Three of them, stacked, spent a third of the footer on things
            nobody clicks while they are writing, and the file list is what this
            column is for.

            One button that says what is behind it, opening upwards over the
            note rather than over the tree. The ⌘⇧D shortcut still goes straight
            to the dashboard without passing through here — a menu is the way in
            for somebody who does not know the shortcut, not a step added for
            somebody who does. */}
        <div className="relative" ref={moreRef}>
          <button
            type="button"
            onClick={() => setShowMore((value) => !value)}
            aria-expanded={showMore}
            aria-haspopup="menu"
            className={`mb-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[12.5px] transition-colors hover:bg-[var(--fl-elevated)] hover:text-[var(--fl-text)] ${
              showMore ? "bg-[var(--fl-elevated)] text-[var(--fl-text)]" : "text-[var(--fl-muted)]"
            }`}
          >
            <MoreGlyph />
            <span className="min-w-0 flex-1 truncate text-left">More</span>
            <ChevronGlyph open={showMore} />
          </button>

          {showMore && (
            /* Upwards. A menu opening down from a control this close to the
               bottom would hang off the window. */
            <div
              role="menu"
              className="absolute bottom-full left-0 z-30 mb-1 w-56 rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-1 shadow-xl"
            >
              <Link
                href="/dashboard"
                role="menuitem"
                onClick={() => setShowMore(false)}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] text-[var(--fl-muted)] transition-colors hover:bg-[var(--fl-elevated)] hover:text-[var(--fl-text)]"
              >
                <DashboardGlyph className="h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate text-left">Dashboard</span>
                <kbd className="shrink-0 rounded border border-[var(--fl-border)] px-1 py-px font-sans text-[10px]">
                  ⌘⇧D
                </kbd>
              </Link>

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setShowMore(false);
                  props.onOpenHelp();
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] text-[var(--fl-muted)] transition-colors hover:bg-[var(--fl-elevated)] hover:text-[var(--fl-text)]"
              >
                <HelpGlyph />
                <span className="min-w-0 flex-1 truncate text-left">Help &amp; shortcuts</span>
              </button>

              {/* Beneath help, because it is what you reach for when help did
                  not have it. */}
              <Link
                href="/support"
                role="menuitem"
                onClick={() => setShowMore(false)}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] text-[var(--fl-muted)] transition-colors hover:bg-[var(--fl-elevated)] hover:text-[var(--fl-text)]"
              >
                <SupportGlyph />
                <span className="min-w-0 flex-1 truncate text-left">Support</span>
              </Link>
            </div>
          )}
        </div>

        {props.user ? (
          <div className="relative" ref={accountRef}>
            {/* One card, one button, one thing it does: open the account menu.

                It used to be two controls wearing a single card — the avatar and
                name went straight to the profile, the gear beside them opened a
                menu whose first item also went to the profile. Nothing marked the
                boundary, so which of the two you got depended on where inside the
                card your cursor happened to land. The menu is the honest version:
                every destination is named in it, including the profile. */}
            <button
              type="button"
              onClick={() => setShowAccount((value) => !value)}
              aria-expanded={showAccount}
              aria-haspopup="menu"
              title="Account"
              aria-label="Account"
              className="flex w-full items-center gap-2.5 rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] px-2.5 py-2 text-left transition-colors hover:bg-[var(--fl-elevated)]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- avatars are
                  remote GitHub URLs; next/image would need a domain allowlist for
                  every possible avatar host. */}
              <img
                src={props.user.avatarUrl}
                alt=""
                width={30}
                height={30}
                className="h-[30px] w-[30px] shrink-0 rounded-full"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-medium text-[var(--fl-text)]">
                  {props.user.name ?? props.user.login}
                </span>
                <span className="block truncate text-[11px] text-[var(--fl-muted)]">
                  @{props.user.login}
                </span>
              </span>
              <GearGlyph className="shrink-0 text-[var(--fl-muted)]" />
            </button>

            {showAccount && (
              <div
                role="menu"
                className="absolute bottom-full left-0 right-0 z-30 mb-1 overflow-hidden rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-1 shadow-[var(--fl-shadow-lg)]"
              >
                <MenuLink href="/profile">Your profile</MenuLink>
                <MenuLink href="/docs">Documentation</MenuLink>
                <button
                  type="button"
                  role="menuitem"
                  onClick={props.onSignOut}
                  className="block w-full rounded-lg px-2.5 py-1.5 text-left text-[13px] text-[var(--fl-text)] transition-colors hover:bg-[var(--fl-elevated)]"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        ) : props.githubAvailable ? (
          <button
            type="button"
            onClick={props.onSignIn}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--fl-accent)] px-3 py-2 text-[13px] font-semibold text-[var(--fl-accent-contrast)] transition-colors hover:bg-[var(--fl-accent-hover)]"
          >
            <GitHubGlyph />
            Continue with GitHub
          </button>
        ) : (
          <p className="px-2 text-[11.5px] leading-snug text-[var(--fl-muted)]">
            GitHub sign-in is unavailable here. Notes stay on this device, and nothing else changes.
          </p>
        )}
      </div>
    </nav>
  );
}

function DashboardGlyph({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    >
      <rect x="2" y="2" width="5" height="5" rx="1.25" />
      <rect x="9" y="2" width="5" height="5" rx="1.25" />
      <rect x="2" y="9" width="5" height="5" rx="1.25" />
      <rect x="9" y="9" width="5" height="5" rx="1.25" />
    </svg>
  );
}

/** `Fieldwork/intro.md` → `intro`, which is what the row is called. */
function nameOf(path: string): string {
  return (path.split("/").pop() ?? path).replace(/\.mdx?$/i, "");
}

/** Three dots: the one mark that means "and the rest" without naming them. */
function MoreGlyph() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3.5 w-3.5" fill="currentColor">
      <circle cx="3.5" cy="8" r="1.25" />
      <circle cx="8" cy="8" r="1.25" />
      <circle cx="12.5" cy="8" r="1.25" />
    </svg>
  );
}

/** Points the way the menu opens, so the button says where to look. */
function ChevronGlyph({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 12 12"
      aria-hidden="true"
      className={`h-3 w-3 shrink-0 transition-transform duration-150 ${open ? "" : "rotate-180"}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2.5 7.5 6 4l3.5 3.5" />
    </svg>
  );
}

function HelpGlyph() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="h-3.5 w-3.5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    >
      <circle cx="8" cy="8" r="6.25" />
      <path d="M6.2 6.2a1.9 1.9 0 1 1 2.3 2.2v1.1M8.5 12h.01" />
    </svg>
  );
}

/** An envelope: the one glyph nobody has to be taught means "write to us". */
function SupportGlyph() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="h-3.5 w-3.5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="3.5" width="12" height="9" rx="1.4" />
      <path d="m2.6 4.6 4.6 3.5a1.3 1.3 0 0 0 1.6 0l4.6-3.5" />
    </svg>
  );
}

/** Three rules, shortest last: the universal "this list has an order" mark. */
function SortGlyph() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    >
      <path d="M3 4.5h10M3 8h6.5M3 11.5h3.5" />
    </svg>
  );
}

function PinGlyph() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="h-[17px] w-[17px] shrink-0 text-[var(--fl-accent)]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9.6 1.9 14.1 6.4l-2 .5-2.4 2.4-.4 3.2-3.4-3.4-3.9 3.9 3.9-3.9L2.5 5.7l3.2-.4L8.1 2.9z" />
    </svg>
  );
}

function PinMoveButton({
  label,
  onClick,
  disabled,
  direction,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  direction: "up" | "down" | "unpin";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="rounded p-1 text-[var(--fl-muted)] transition-colors hover:bg-[var(--fl-elevated)] hover:text-[var(--fl-text)] disabled:opacity-30 disabled:hover:bg-transparent"
    >
      <svg
        viewBox="0 0 16 16"
        aria-hidden="true"
        className="h-3 w-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {direction === "up" && <path d="M8 12.5v-9M4 7.5 8 3.5l4 4" />}
        {direction === "down" && <path d="M8 3.5v9M4 8.5l4 4 4-4" />}
        {direction === "unpin" && <path d="m4 4 8 8M12 4l-8 8" />}
      </svg>
    </button>
  );
}

function RailButton({
  label,
  onClick,
  children,
  className = "",
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--fl-muted)] transition-colors hover:bg-[var(--fl-elevated)] hover:text-[var(--fl-text)] ${className}`}
    >
      {children}
    </button>
  );
}

function MenuLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="block rounded-lg px-2.5 py-1.5 text-[13px] text-[var(--fl-text)] transition-colors hover:bg-[var(--fl-elevated)]"
    >
      {children}
    </Link>
  );
}

function SearchGlyph() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--fl-muted)]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
    >
      <circle cx="7" cy="7" r="4.5" />
      <path d="m10.5 10.5 3 3" />
    </svg>
  );
}

/**
 * A cog: two concentric circles about (8, 8) and eight teeth at multiples of
 * 45°, so it is symmetric by construction.
 *
 * The hand-written outline it replaces was not. Its teeth were laid out with
 * relative moves that did not close back to where they started, which pushed
 * the outline a fraction to the left of the hub — enough that the hole looked
 * off-centre to the right at 16px, which is exactly how it was reported.
 */
function GearGlyph({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className={`h-4 w-4 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="8" cy="8" r="4.15" />
      <circle cx="8" cy="8" r="1.55" />
      <path d="M8 3.85V2.1M8 12.15V13.9M3.85 8H2.1M12.15 8H13.9" />
      <path d="M5.07 5.07 3.83 3.83M10.93 10.93l1.24 1.24M10.93 5.07l1.24-1.24M5.07 10.93l-1.24 1.24" />
    </svg>
  );
}

function ChevronDown({ className = "text-[var(--fl-muted)]" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className={`h-3.5 w-3.5 shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m4.5 6.5 3.5 3.5 3.5-3.5" />
    </svg>
  );
}

function GitHubGlyph() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      className="h-3.5 w-3.5 shrink-0"
    >
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.4 7.4 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}
