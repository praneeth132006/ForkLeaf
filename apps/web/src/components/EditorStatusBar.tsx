"use client";

import React from "react";
import type { SyncState, Workspace } from "@forkleaf/types";
import { BranchMenu } from "./BranchMenu";

export interface EditorStatusBarProps {
  sync: SyncState;
  workspace: Workspace | null;
  notePath: string | null;
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

      {notePath && (
        <span className="ml-auto hidden truncate font-mono md:inline" title={notePath}>
          {notePath}
        </span>
      )}

      {sync.lastError && (
        <span className="ml-auto truncate text-[var(--fl-danger)]" title={sync.lastError}>
          {sync.lastError}
        </span>
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
        // Naming both halves is the point: nothing has been lost.
        label: `Saved locally · ${sync.pendingCount} to push`,
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
