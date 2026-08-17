"use client";

import React, { useState } from "react";
import Link from "next/link";
import type { TreeNode, Workspace, SessionUser } from "@forkleaf/types";
import { FileTree } from "./FileTree";
import { ForkLeafMark } from "./Brand";
import { PlanBadge } from "./PlanBadge";
import { repoUrl } from "@/lib/github-links";

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
  onOpenHelp: () => void;
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
          <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="M2.5 4h11M2.5 8h11M2.5 12h11" />
          </svg>
        </RailButton>
        <RailButton label="New note" onClick={() => props.onCreateNote("")}>
          <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
            <path d="M8 3.5v9M3.5 8h9" />
          </svg>
        </RailButton>
        <RailButton label="Help" onClick={props.onOpenHelp} className="mt-auto">
          <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <circle cx="8" cy="8" r="6.25" />
            <path d="M6.2 6.2a1.9 1.9 0 1 1 2.3 2.2v1.1M8.5 12h.01" />
          </svg>
        </RailButton>
      </nav>
    );
  }

  const activeRepo = repoUrl(props.activeWorkspace);

  return (
    <nav className="flex w-64 shrink-0 flex-col border-r border-[var(--fl-border)] bg-[var(--fl-bg)]">
      {/* ── Workspace switcher ────────────────────────────────────────── */}
      <div className="relative border-b border-[var(--fl-border)] p-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShowWorkspaces((value) => !value)}
            aria-expanded={showWorkspaces}
            aria-haspopup="listbox"
            className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-[var(--fl-elevated)]"
          >
            <span
              aria-hidden="true"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--fl-accent-soft)] text-[var(--fl-accent)]"
            >
              <ForkLeafMark className="h-4 w-4" />
            </span>
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
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
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

      {/* ── Search and new note ───────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 p-2">
        <input
          type="search"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Search notes…"
          aria-label="Search notes"
          className="fl-input min-w-0 flex-1"
        />
        <button
          type="button"
          onClick={() => props.onCreateNote("")}
          title="New note (⌘⇧N)"
          aria-label="New note"
          className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg bg-[var(--fl-accent)] text-[var(--fl-accent-contrast)] transition-colors hover:bg-[var(--fl-accent-hover)]"
        >
          <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
            <path d="M8 3.5v9M3.5 8h9" />
          </svg>
        </button>
      </div>

      {/* ── Tree ──────────────────────────────────────────────────────── */}
      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-2">
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

      {/* ── Footer: repo shortcut, help, account ──────────────────────── */}
      <div className="border-t border-[var(--fl-border)] p-2">
        {activeRepo && (
          <a
            href={activeRepo}
            target="_blank"
            rel="noreferrer"
            className="mb-1 flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12.5px] text-[var(--fl-muted)] transition-colors hover:bg-[var(--fl-elevated)] hover:text-[var(--fl-text)]"
          >
            <GitHubGlyph />
            <span className="min-w-0 flex-1 truncate">View notes on GitHub</span>
            <span aria-hidden="true">↗</span>
          </a>
        )}

        <button
          type="button"
          onClick={props.onOpenHelp}
          className="mb-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[12.5px] text-[var(--fl-muted)] transition-colors hover:bg-[var(--fl-elevated)] hover:text-[var(--fl-text)]"
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <circle cx="8" cy="8" r="6.25" />
            <path d="M6.2 6.2a1.9 1.9 0 1 1 2.3 2.2v1.1M8.5 12h.01" />
          </svg>
          <span className="min-w-0 flex-1 truncate text-left">Help &amp; shortcuts</span>
        </button>

        {props.user ? (
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowAccount((value) => !value)}
              aria-expanded={showAccount}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-[var(--fl-elevated)]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- avatars are
                  remote GitHub URLs; next/image would need a domain allowlist for
                  every possible avatar host. */}
              <img
                src={props.user.avatarUrl}
                alt=""
                width={22}
                height={22}
                className="h-[22px] w-[22px] shrink-0 rounded-full"
              />
              <span className="min-w-0 flex-1 truncate text-left text-[12.5px] text-[var(--fl-text)]">
                {props.user.name ?? props.user.login}
              </span>
              <PlanBadge />
            </button>

            {showAccount && (
              <div className="absolute bottom-full left-0 right-0 z-30 mb-1 overflow-hidden rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-1 shadow-[var(--fl-shadow-lg)]">
                <MenuLink href="/account">Account &amp; plan</MenuLink>
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

function ChevronDown() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5 shrink-0 text-[var(--fl-muted)]"
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
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className="h-3.5 w-3.5 shrink-0">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.4 7.4 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}
