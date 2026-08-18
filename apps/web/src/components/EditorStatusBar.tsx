"use client";

import React from "react";
import type { CursorPosition } from "@forkleaf/editor";
import type { SyncMode, SyncPreference, SyncState, Workspace } from "@forkleaf/types";
import { BranchMenu } from "./BranchMenu";
import { SyncModeMenu } from "./SyncModeMenu";

export interface EditorStatusBarProps {
  sync: SyncState;
  workspace: Workspace | null;
  notePath: string | null;
  /** Caret position, when a source surface is on screen to report one. */
  cursor: CursorPosition | null;
  /** Word count of the open note. */
  words: number;
  /** How this workspace is configured to push, and how to change it. */
  syncPreference: SyncPreference;
  onSyncModeChange: (mode: SyncMode, intervalMinutes?: number) => void | Promise<void>;
  onSyncNow: () => void;
  onShowConflicts: () => void;
  /** Moves the workspace to another branch of the same repository. */
  onSwitchBranch: (branch: string) => void | Promise<void>;
  /** Opens the pull-request flow for the current work. */
  onPropose: () => void;
}

/**
 * The bottom bar: what is happening with the user's data, at a glance.
 *
 * Deliberately explicit about the difference between "saved on this device" and
 * "pushed to GitHub" — an autosaving app that is vague about this is how people
 * end up believing they lost work.
 */
export function EditorStatusBar({
  sync,
  workspace,
  notePath,
  cursor,
  words,
  syncPreference,
  onSyncModeChange,
  onSyncNow,
  onShowConflicts,
  onSwitchBranch,
  onPropose,
}: EditorStatusBarProps) {
  const status = describe(sync);

  return (
    <footer className="flex h-7 shrink-0 items-center gap-3 border-t border-[var(--fl-border)] bg-[var(--fl-bg)] px-3 text-[0.7rem] text-[var(--fl-muted)]">
      <button
        type="button"
        onClick={sync.conflicts.length > 0 ? onShowConflicts : onSyncNow}
        title={sync.conflicts.length > 0 ? "Resolve conflicts" : "Sync now"}
        className="flex items-center gap-1.5 rounded px-1.5 py-0.5 hover:bg-[var(--fl-elevated)]"
      >
        <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
        <span className={status.className}>{status.label}</span>
      </button>

      {workspace?.isLocal && <span className="hidden truncate sm:inline">Local storage</span>}

      {workspace && !workspace.isLocal && (
        <>
          <span className="hidden truncate sm:inline">
            {workspace.repo.owner}/{workspace.repo.repo}
          </span>

          {/* The branch is a control now, not a label: writing documentation
              straight onto a repository's default branch is rarely what anyone
              wants, and there was previously no way to see or change it. */}
          <BranchMenu workspace={workspace} onSwitch={onSwitchBranch} />

          <SyncModeMenu
            preference={syncPreference}
            onChange={onSyncModeChange}
            onSyncNow={onSyncNow}
            pendingCount={sync.pendingCount}
          />

          <button
            type="button"
            onClick={onPropose}
            title="Open a pull request for these changes"
            className="hidden rounded px-1.5 py-0.5 transition-colors hover:bg-[var(--fl-elevated)] hover:text-[var(--fl-text)] sm:inline"
          >
            Propose changes…
          </button>
        </>
      )}

      {sync.lastError && (
        <span className="ml-auto truncate text-[var(--fl-danger)]" title={sync.lastError}>
          {sync.lastError}
        </span>
      )}

      {notePath && !sync.lastError && (
        <div className="ml-auto flex shrink-0 items-center gap-3">
          <span className="hidden truncate font-mono lg:inline" title={notePath}>
            {notePath}
          </span>

          {/* Only shown when a source surface is live: rich text has no lines
              to count, and a stale reading is worse than none. */}
          {cursor && (
            <span className="hidden tabular-nums sm:inline">
              Ln {cursor.line}, Col {cursor.column}
            </span>
          )}

          {/* Facts about the bytes on disk. ForkLeaf always writes UTF-8 with
              LF endings, so these are statements rather than settings. */}
          <span className="hidden md:inline">UTF-8</span>
          <span className="hidden md:inline">LF</span>
          <span className="hidden md:inline">Markdown</span>

          <span className="tabular-nums">
            {words.toLocaleString()} {words === 1 ? "word" : "words"}
          </span>
        </div>
      )}
    </footer>
  );
}

function describe(sync: SyncState): { label: string; className: string; dot: string } {
  if (sync.conflicts.length > 0) {
    return {
      label: `${sync.conflicts.length} conflict${sync.conflicts.length === 1 ? "" : "s"} — click to resolve`,
      className: "text-[var(--fl-danger)] font-medium",
      dot: "bg-[var(--fl-danger)]",
    };
  }

  switch (sync.status) {
    case "syncing":
      return {
        label: "Saving to GitHub…",
        className: "",
        dot: "bg-[var(--fl-warn)] animate-pulse",
      };

    case "pending":
      return {
        // Naming both halves is the point: nothing has been lost. In manual
        // mode the queue is not a delay to apologise for, it is the setting
        // working, so the wording stops implying something is running late.
        label:
          sync.mode === "manual"
            ? `Saved locally · ${sync.pendingCount} waiting for you`
            : `Saved locally · ${sync.pendingCount} to push`,
        className: "",
        dot: "bg-[var(--fl-warn)]",
      };

    case "offline":
      return {
        label: `Offline · ${sync.pendingCount} change${sync.pendingCount === 1 ? "" : "s"} queued`,
        className: "",
        dot: "bg-[var(--fl-muted)]",
      };

    case "error":
      return {
        label: "Couldn't sync — click to retry",
        className: "text-[var(--fl-danger)]",
        dot: "bg-[var(--fl-danger)]",
      };

    case "local":
      return { label: "Saved on this device", className: "", dot: "bg-[var(--fl-muted)]" };

    case "conflict":
      return {
        label: "Conflict",
        className: "text-[var(--fl-danger)]",
        dot: "bg-[var(--fl-danger)]",
      };

    case "idle":
    default:
      return {
        label: sync.lastSyncedAt
          ? `All changes saved ${relative(sync.lastSyncedAt)}`
          : "All changes saved",
        className: "",
        dot: "bg-[var(--fl-accent)]",
      };
  }
}

function relative(iso: string): string {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
