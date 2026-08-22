"use client";

import React, { useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { TreeNode, Workspace, SessionUser } from "@forkleaf/types";
import { FileTree } from "./FileTree";
import { ForkLeafMark } from "./Brand";

export interface EditorSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  onSwitchWorkspace: (workspace: Workspace) => void;
  onConnectRepo: () => void;
  tree: TreeNode[];
  activePath: string | null;
  onOpenNote: (path: string) => void;
  onCreateNote: (folder: string) => void;
  onDeleteNote: (path: string) => void;
  onRenameNote: (path: string) => void;
  /** Make a folder inside `parent`. An empty string means the repository root. */
  onCreateFolder: (parent: string) => void;
  onRenameFolder: (path: string) => void;
  onDeleteFolder: (path: string) => void;
  /** Moves a note into another folder, from a drag within the tree. */
  onMoveNote: (path: string, toFolder: string) => void;
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
  const searchRef = useRef<HTMLInputElement>(null);

  // Every folder at every depth, so "new note" can mean "new note somewhere in
  // particular" without making the reader find the folder first. Listing only
  // the top level meant a note could never be put in a subfolder from here.
  const folders = useMemo(() => collectFolders(props.tree), [props.tree]);

  if (props.collapsed) {
    return (
      <nav className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-[var(--fl-border)] bg-[var(--fl-bg)] py-2.5">
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
        <RailButton label="New note" onClick={() => props.onCreateNote("")}>
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
    <nav className="flex w-64 shrink-0 flex-col border-r border-[var(--fl-border)] bg-[var(--fl-bg)]">
      {/* ── Workspace switcher ────────────────────────────────────────── */}
      <div className="relative border-b border-[var(--fl-border)] p-2">
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
            aria-haspopup="listbox"
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
            role="listbox"
            className="absolute left-2 right-2 top-full z-30 mt-1 overflow-hidden rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-1 shadow-[var(--fl-shadow-lg)]"
          >
            {props.workspaces.map((workspace) => (
              <button
                key={workspace.id}
                type="button"
                role="option"
                aria-selected={workspace.id === props.activeWorkspace?.id}
                onClick={() => {
                  props.onSwitchWorkspace(workspace);
                  setShowWorkspaces(false);
                }}
                className={`block w-full rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-[var(--fl-elevated)] ${
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
      <div className="relative flex items-stretch gap-1.5 px-2 pt-2">
        <button
          type="button"
          onClick={() => props.onCreateNote("")}
          title="New note (⌘⇧N)"
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

        <button
          type="button"
          onClick={() => props.onCreateFolder("")}
          title="New folder"
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

      {/* ── Out of the editor ─────────────────────────────────────────── */}
      {/* The editor used to be a room with no marked exits: once you were in
          it, the only way back to the rest of the app was the logo, and the
          dashboard could not be reached at all. */}
      <div className="px-2 pb-1">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] text-[var(--fl-text)] transition-colors hover:bg-[var(--fl-elevated)]"
        >
          <DashboardGlyph />
          <span className="min-w-0 flex-1 truncate">Dashboard</span>
          <kbd className="shrink-0 rounded border border-[var(--fl-border)] px-1 py-px font-sans text-[10px] text-[var(--fl-muted)]">
            ⌘⇧D
          </kbd>
        </Link>
      </div>

      {/* ── Tree ──────────────────────────────────────────────────────── */}
      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-2">
        <p className="px-2 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--fl-muted)]">
          {props.activeWorkspace?.isLocal ? "Notes" : "Repository"}
        </p>
        <FileTree
          nodes={props.tree}
          activePath={props.activePath}
          onOpen={props.onOpenNote}
          onDelete={props.onDeleteNote}
          onRename={props.onRenameNote}
          onCreateIn={props.onCreateNote}
          onCreateFolder={props.onCreateFolder}
          onMoveNote={props.onMoveNote}
          onRenameFolder={props.onRenameFolder}
          onDeleteFolder={props.onDeleteFolder}
          filter={filter}
        />
      </div>

      {/* ── Footer: repo shortcut, help, account ──────────────────────── */}
      <div className="border-t border-[var(--fl-border)] p-2">
        <button
          type="button"
          onClick={props.onOpenHelp}
          className="mb-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[12.5px] text-[var(--fl-muted)] transition-colors hover:bg-[var(--fl-elevated)] hover:text-[var(--fl-text)]"
        >
          <svg
            viewBox="0 0 16 16"
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          >
            <circle cx="8" cy="8" r="6.25" />
            <path d="M6.2 6.2a1.9 1.9 0 1 1 2.3 2.2v1.1M8.5 12h.01" />
          </svg>
          <span className="min-w-0 flex-1 truncate text-left">Help &amp; shortcuts</span>
        </button>

        {props.user ? (
          <div className="relative">
            <div className="flex items-center gap-2.5 rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] px-2.5 py-2">
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
              <button
                type="button"
                onClick={() => setShowAccount((value) => !value)}
                aria-expanded={showAccount}
                aria-haspopup="menu"
                title="Account"
                aria-label="Account"
                className="shrink-0 rounded-lg p-1 text-[var(--fl-muted)] transition-colors hover:bg-[var(--fl-elevated)] hover:text-[var(--fl-text)]"
              >
                <GearGlyph />
              </button>
            </div>

            {showAccount && (
              <div className="absolute bottom-full left-0 right-0 z-30 mb-1 overflow-hidden rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-1 shadow-[var(--fl-shadow-lg)]">
                <MenuLink href="/profile">Your profile</MenuLink>
                <MenuLink href="/docs">Documentation</MenuLink>
                <button
                  type="button"
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
            GitHub sign-in is not configured here. Notes stay on this device —{" "}
            <Link href="/docs/self-hosting" className="text-[var(--fl-accent)] underline">
              set it up
            </Link>
            .
          </p>
        )}
      </div>
    </nav>
  );
}

function DashboardGlyph() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="h-4 w-4 shrink-0 text-[var(--fl-muted)]"
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

/** Every folder path in the tree, depth-first, so nesting reads in order. */
function collectFolders(nodes: TreeNode[]): string[] {
  const paths: string[] = [];

  const walk = (list: TreeNode[]) => {
    for (const node of list) {
      if (node.kind !== "folder") continue;
      paths.push(node.path);
      walk(node.children ?? []);
    }
  };

  walk(nodes);
  return paths;
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

function GearGlyph() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    >
      <circle cx="8" cy="8" r="2.1" />
      <path d="M8 1.75h.01l.35 1.6a5 5 0 0 1 1.3.54l1.4-.86 1.42 1.42-.86 1.4c.24.4.42.84.54 1.3l1.6.35v2l-1.6.35a5 5 0 0 1-.54 1.3l.86 1.4-1.42 1.42-1.4-.86a5 5 0 0 1-1.3.54l-.35 1.6h-2l-.35-1.6a5 5 0 0 1-1.3-.54l-1.4.86-1.42-1.42.86-1.4a5 5 0 0 1-.54-1.3l-1.6-.35v-2l1.6-.35c.12-.46.3-.9.54-1.3l-.86-1.4 1.42-1.42 1.4.86a5 5 0 0 1 1.3-.54l.35-1.6Z" />
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
