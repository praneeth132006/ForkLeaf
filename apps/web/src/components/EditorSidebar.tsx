"use client";

import React, { useState } from "react";
import type { TreeNode, Workspace, SessionUser } from "@mdnotion/types";
import { FileTree } from "./FileTree";

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
  user: SessionUser | null;
  onSignIn: () => void;
  onSignOut: () => void;
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

  if (props.collapsed) {
    return (
      <nav className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-[var(--color-border)] bg-[var(--color-paper)] py-3">
        <button
          type="button"
          onClick={props.onToggle}
          title="Expand sidebar"
          aria-label="Expand sidebar"
          className="rounded-md p-2 text-[var(--color-mist)] hover:bg-[var(--color-chalk)] hover:text-[var(--color-ink)]"
        >
          ☰
        </button>
        <button
          type="button"
          onClick={() => props.onCreateNote("")}
          title="New note"
          aria-label="New note"
          className="rounded-md p-2 text-[var(--color-mist)] hover:bg-[var(--color-chalk)] hover:text-[var(--color-ink)]"
        >
          ＋
        </button>
      </nav>
    );
  }

  return (
    <nav className="flex w-64 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-paper)]">
      {/* ── Workspace switcher ────────────────────────────────────────── */}
      <div className="relative border-b border-[var(--color-border)] p-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShowWorkspaces((value) => !value)}
            aria-expanded={showWorkspaces}
            aria-haspopup="listbox"
            className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-[var(--color-chalk)]"
          >
            <span
              aria-hidden="true"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-[var(--color-trail-teal)] font-serif text-sm font-bold text-[var(--color-paper)]"
            >
              {props.activeWorkspace?.name.charAt(0).toUpperCase() ?? "M"}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-[var(--color-ink)]">
                {props.activeWorkspace?.name ?? "No workspace"}
              </span>
              <span className="block truncate text-[0.7rem] text-[var(--color-mist)]">
                {props.activeWorkspace?.isLocal
                  ? "This device only"
                  : `${props.activeWorkspace?.repo.owner}/${props.activeWorkspace?.repo.repo}`}
              </span>
            </span>
            <span aria-hidden="true" className="shrink-0 text-[0.6rem] text-[var(--color-mist)]">
              ▼
            </span>
          </button>

          <button
            type="button"
            onClick={props.onToggle}
            title="Collapse sidebar"
            aria-label="Collapse sidebar"
            className="shrink-0 rounded-md p-1.5 text-[var(--color-mist)] hover:bg-[var(--color-chalk)] hover:text-[var(--color-ink)]"
          >
            ‹
          </button>
        </div>

        {showWorkspaces && (
          <div
            role="listbox"
            className="absolute left-2 right-2 top-full z-30 mt-1 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl"
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
                className={`block w-full px-3 py-2 text-left text-sm hover:bg-[var(--color-chalk)] ${
                  workspace.id === props.activeWorkspace?.id
                    ? "font-medium text-[var(--color-trail-teal)]"
                    : "text-[var(--color-ink)]"
                }`}
              >
                <span className="block truncate">{workspace.name}</span>
                <span className="block truncate text-[0.7rem] text-[var(--color-mist)]">
                  {workspace.isLocal
                    ? "This device only"
                    : `${workspace.repo.owner}/${workspace.repo.repo}`}
                </span>
              </button>
            ))}

            {props.user && (
              <button
                type="button"
                onClick={() => {
                  props.onConnectRepo();
                  setShowWorkspaces(false);
                }}
                className="block w-full border-t border-[var(--color-border)] px-3 py-2 text-left text-sm text-[var(--color-trail-teal)] hover:bg-[var(--color-chalk)]"
              >
                Connect another repository…
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Search and new note ───────────────────────────────────────── */}
      <div className="flex items-center gap-1 p-2">
        <input
          type="search"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Search notes…"
          aria-label="Search notes"
          className="min-w-0 flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-trail-teal)]"
        />
        <button
          type="button"
          onClick={() => props.onCreateNote("")}
          title="New note"
          aria-label="New note"
          className="shrink-0 rounded-md bg-[var(--color-signal-amber)] px-2.5 py-1.5 text-sm font-semibold text-[var(--color-basalt)] hover:opacity-90"
        >
          ＋
        </button>
      </div>

      {/* ── Tree ──────────────────────────────────────────────────────── */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <FileTree
          nodes={props.tree}
          activePath={props.activePath}
          onOpen={props.onOpenNote}
          onDelete={props.onDeleteNote}
          onRename={props.onRenameNote}
          onCreateIn={props.onCreateNote}
          filter={filter}
        />
      </div>

      {/* ── Account ───────────────────────────────────────────────────── */}
      <div className="border-t border-[var(--color-border)] p-2">
        {props.user ? (
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- avatars are
                remote GitHub URLs; next/image would need a domain allowlist for
                every possible avatar host. */}
            <img
              src={props.user.avatarUrl}
              alt=""
              width={24}
              height={24}
              className="h-6 w-6 shrink-0 rounded-full"
            />
            <span className="min-w-0 flex-1 truncate text-sm text-[var(--color-ink)]">
              {props.user.name ?? props.user.login}
            </span>
            <button
              type="button"
              onClick={props.onSignOut}
              className="shrink-0 rounded px-2 py-1 text-xs text-[var(--color-mist)] hover:bg-[var(--color-chalk)] hover:text-[var(--color-ink)]"
            >
              Sign out
            </button>
          </div>
        ) : props.githubAvailable ? (
          <button
            type="button"
            onClick={props.onSignIn}
            className="w-full rounded-md bg-[var(--color-basalt)] px-3 py-2 text-sm font-medium text-[var(--color-paper)] hover:opacity-90"
          >
            Continue with GitHub
          </button>
        ) : (
          <p className="px-1 text-[0.7rem] leading-snug text-[var(--color-mist)]">
            Notes are saved on this device. Set up GitHub sign-in to sync them — see the README.
          </p>
        )}
      </div>
    </nav>
  );
}
