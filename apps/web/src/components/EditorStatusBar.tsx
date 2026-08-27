"use client";

import type { CursorPosition } from "@forkleaf/editor";
import type { SyncMode, SyncPreference, SyncState, Workspace } from "@forkleaf/types";
import { BranchMenu } from "./BranchMenu";
import { SyncModeMenu } from "./SyncModeMenu";

export interface EditorStatusBarProps {
  sync: SyncState;
  workspace: Workspace | null;
  notePath: string | null;
  /**
   * The file on this machine this note came from, if it came from one.
   *
   * Worth its own place in the status bar rather than being folded into the
   * path: a note that writes back to `~/notes/meeting.md` when you press ⌘S
   * behaves differently from every other note, and the only honest place to
   * say so is where the reader already looks to see where they are.
   */
  localFile?: string | null;
  /** Caret position, when a source surface is on screen to report one. */
  cursor: CursorPosition | null;
  /** Word count of the open note. */
  words: number;
  /**
   * True when the open note is locked against editing.
   *
   * Stated here as well as in the header because this is the bar people read
   * to answer "is my writing safe" — and "why is nothing I type appearing" is
   * the same kind of question.
   */
  locked?: boolean;
  /** How this workspace is configured to push, and how to change it. */
  syncPreference: SyncPreference;
  onSyncModeChange: (mode: SyncMode, intervalMinutes?: number) => void | Promise<void>;
  onSyncNow: () => void;
  onShowConflicts: () => void;
  /** Moves the workspace to another branch of the same repository. */
  onSwitchBranch: (branch: string) => void | Promise<void>;
  /** Opens the pull-request flow for the current work. */
  onPropose: () => void;
  /**
   * Starts signing in again, and comes back here afterwards.
   *
   * Needed because "retry" is the wrong offer for an expired token: the queue
   * would push into the same 401 it just failed on, and the status bar would
   * report the same sentence again with nothing having moved. When the reason
   * is the sign-in, the button has to be the sign-in.
   */
  onSignIn: () => void;
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
  localFile,
  cursor,
  words,
  locked = false,
  syncPreference,
  onSyncModeChange,
  onSyncNow,
  onShowConflicts,
  onSwitchBranch,
  onPropose,
  onSignIn,
}: EditorStatusBarProps) {
  /**
   * An expired sign-in is the one failure retrying cannot fix, so it takes
   * over the whole status control rather than sitting behind it.
   */
  const expired = sync.lastErrorCode === "unauthorized";
  const status = describe(sync, expired);

  return (
    <footer className="flex h-8 shrink-0 items-center gap-3 px-4 text-[0.7rem] text-[var(--fl-muted)]">
      <button
        type="button"
        onClick={sync.conflicts.length > 0 ? onShowConflicts : expired ? onSignIn : onSyncNow}
        title={
          sync.conflicts.length > 0
            ? "Resolve conflicts"
            : expired
              ? "Sign in to GitHub again"
              : "Sync now"
        }
        className="flex items-center gap-1.5 rounded px-1.5 py-0.5 hover:bg-[var(--fl-elevated)]"
      >
        <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
        <span className={status.className}>{status.label}</span>
      </button>

      {/* The way out, drawn as a button rather than left as advice inside a
          sentence. Somebody reading "sign in again" in red text has no reason
          to guess that the red text is clickable. */}
      {expired && (
        <button
          type="button"
          onClick={onSignIn}
          className="shrink-0 rounded bg-[var(--fl-accent)] px-2 py-0.5 text-[0.7rem] font-semibold text-[var(--fl-accent-contrast)] transition-colors hover:bg-[var(--fl-accent-hover)]"
        >
          Sign in again
        </button>
      )}

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

      {/* Only when the status control is not already saying it: the same
          sentence printed twice across one bar reads as two problems. */}
      {sync.lastError && sync.status !== "error" && sync.status !== "blocked" && (
        <span
          className="ml-auto truncate text-[var(--fl-danger)]"
          title={sync.lastErrorDetail ?? sync.lastError}
        >
          {sync.lastError}
        </span>
      )}

      {notePath && !sync.lastError && (
        <div className="ml-auto flex shrink-0 items-center gap-3">
          <span className="hidden truncate font-mono lg:inline" title={notePath}>
            {notePath}
          </span>

          {locked && (
            <span
              title="This note is locked against editing. Unlock it from the header, or with ⌘⇧L."
              className="flex shrink-0 items-center gap-1 rounded-full bg-[var(--fl-accent-soft)] px-2 py-0.5 text-[var(--fl-accent)]"
            >
              <svg
                viewBox="0 0 16 16"
                className="h-3 w-3"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="3.5" y="7" width="9" height="6.5" rx="1.4" />
                <path d="M5.75 7V5.2a2.25 2.25 0 0 1 4.5 0V7" />
              </svg>
              Locked
            </span>
          )}

          {localFile && (
            <span
              title={`Saving with ⌘S writes ${localFile} on this computer`}
              className="hidden shrink-0 items-center gap-1 rounded-full bg-[var(--fl-accent-soft)] px-2 py-0.5 text-[var(--fl-accent)] md:inline-flex"
            >
              {localFile}
            </span>
          )}

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

function describe(
  sync: SyncState,
  expired: boolean,
): { label: string; className: string; dot: string } {
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
        // The message already says what happened and that the work is safe;
        // what to press is the only thing left to add — and for an expired
        // token that is not "retry", which is what made the old label a dead
        // end for the one failure people actually hit.
        label: expired
          ? `${sync.lastError ?? "Your GitHub sign-in has expired."} Click to sign in.`
          : `${sync.lastError ?? "Could not push to GitHub."} Click to retry.`,
        className: "text-[var(--fl-danger)] truncate max-w-[500px]",
        dot: "bg-[var(--fl-danger)]",
      };

    case "blocked":
      // The one status that must never be mistaken for progress. These changes
      // have stopped retrying and will not move until somebody asks them to,
      // so the label says what is true and what to do about it.
      return {
        label: expired
          ? `${sync.blockedCount} change${sync.blockedCount === 1 ? "" : "s"} not on GitHub — click to sign in again`
          : `${sync.blockedCount} change${sync.blockedCount === 1 ? "" : "s"} not on GitHub — click to retry`,
        className: "text-[var(--fl-danger)] font-medium",
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
