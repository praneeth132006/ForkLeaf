"use client";

import { useEffect, useRef, useState } from "react";
import { remedyFor } from "@forkleaf/store";
import type { SyncState, Workspace } from "@forkleaf/types";

export interface SyncProblemProps {
  sync: SyncState;
  /** True when the sign-in is the thing that is wrong, whatever else is. */
  expired: boolean;
  workspace: Workspace | null;
  /** The label and dot the status bar would have drawn for this state. */
  label: string;
  labelClassName: string;
  dot: string;
  /** Pushes the queue again, right now. */
  onRetry: () => void;
  onSignIn: () => void;
  onShowConflicts: () => void;
  /** Opens the pull-request flow — the way out of a protected branch. */
  onPropose: () => void;
}

/**
 * A failed push, explained rather than announced.
 *
 * The status bar has one line, and one line can only ever say that something
 * went wrong and offer to try again. When the retry then fails for the same
 * reason — a revoked token, a protected branch, a proxy eating requests to
 * api.github.com — that line reprints itself unchanged, and the reader is left
 * pressing a button that visibly does nothing. Nothing in the bar ever names
 * the cause, so there is no other move available to them.
 *
 * This is where the rest of it goes: what GitHub actually said, what that
 * means, the steps that would fix it, and how many times we have now tried.
 * Most of those steps are things only the reader can do — granting access,
 * unarchiving a repository, getting off the network that is blocking GitHub —
 * which is precisely why hiding the reason made the app unusable at the moment
 * it mattered.
 */
export function SyncProblem({
  sync,
  expired,
  workspace,
  label,
  labelClassName,
  dot,
  onRetry,
  onSignIn,
  onShowConflicts,
  onPropose,
}: SyncProblemProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  // Click-away and Escape, matching the menus beside it in this bar.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!copied) return;
    const handle = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(handle);
  }, [copied]);

  const code = expired ? "unauthorized" : sync.lastErrorCode;
  const remedy = remedyFor(code, sync.lastErrorDetail);
  const conflicted = sync.conflicts.length > 0;
  /**
   * True when the reason above is already GitHub's own words.
   *
   * A failure we cannot classify has nothing to explain it *but* the raw
   * message, so that goes at the top where the reason belongs — and printing
   * it again under "Details" would read as two separate things having gone
   * wrong.
   */
  const quoted = Boolean(sync.lastErrorDetail && remedy.reason.includes(sync.lastErrorDetail));
  const syncing = sync.status === "syncing";

  const headline = conflicted
    ? `${sync.conflicts.length} note${sync.conflicts.length === 1 ? "" : "s"} changed here and on GitHub`
    : (sync.lastError ?? "Could not push to GitHub.");

  const details = [
    `ForkLeaf sync failure`,
    `Kind: ${code ?? "unknown"}`,
    sync.lastErrorDetail ? `GitHub said: ${sync.lastErrorDetail}` : null,
    sync.lastErrorAt ? `Last attempt: ${sync.lastErrorAt}` : null,
    `Failed attempts since last success: ${sync.failedAttempts}`,
    `Unpushed changes: ${sync.pendingCount} (${sync.blockedCount} stopped retrying)`,
    workspace && !workspace.isLocal
      ? `Repository: ${workspace.repo.owner}/${workspace.repo.repo}@${workspace.repo.branch}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  const copyDetails = () => {
    void navigator.clipboard?.writeText(details).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  };

  return (
    <div ref={root} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="What went wrong, and what to do about it"
        className="flex min-w-0 items-center gap-1.5 rounded px-1.5 py-0.5 hover:bg-[var(--fl-elevated)]"
      >
        <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
        <span className={labelClassName}>{label}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Sync problem"
          className="absolute bottom-full left-0 z-40 mb-1.5 w-[24rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] shadow-[var(--fl-shadow-lg)]"
        >
          <div className="border-b border-[var(--fl-border)] px-3 py-2.5">
            <p className="text-[12.5px] font-semibold leading-snug text-[var(--fl-text)]">
              {headline}
            </p>
            {/* Said before anything else, because it is the only question that
                matters while the rest is being read. */}
            <p className="mt-1 text-[11.5px] leading-relaxed text-[var(--fl-muted)]">
              {sync.pendingCount === 0
                ? "Everything you have written is saved on this device."
                : `${sync.pendingCount} change${sync.pendingCount === 1 ? " is" : "s are"} saved on this device and not yet on GitHub. Nothing has been lost.`}
            </p>
          </div>

          {!conflicted && (
            <div className="border-b border-[var(--fl-border)] px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--fl-muted)]">
                Why
              </p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-[var(--fl-text)]">
                {remedy.reason}
              </p>
            </div>
          )}

          <div className="border-b border-[var(--fl-border)] px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--fl-muted)]">
              What to do
            </p>
            <ol className="mt-1.5 list-decimal space-y-1.5 pl-4 text-[11.5px] leading-relaxed text-[var(--fl-text)] marker:text-[var(--fl-muted)]">
              {(conflicted ? remedyFor("conflict").steps : remedy.steps).map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>

          <div className="flex flex-wrap gap-1.5 border-b border-[var(--fl-border)] px-3 py-2.5">
            {conflicted ? (
              <Primary
                onClick={() => {
                  onShowConflicts();
                  setOpen(false);
                }}
              >
                Resolve conflicts
              </Primary>
            ) : expired ? (
              <Primary
                onClick={() => {
                  onSignIn();
                  setOpen(false);
                }}
              >
                Sign in to GitHub again
              </Primary>
            ) : (
              <Primary onClick={onRetry} disabled={syncing}>
                {syncing ? "Trying…" : "Try again now"}
              </Primary>
            )}

            {/* Retrying an expired token pushes into the same refusal, so it
                stops being the offer — but a reader who disagrees can still
                make it, from a button that no longer pretends to be the fix. */}
            {!conflicted && expired && (
              <Secondary onClick={onRetry} disabled={syncing}>
                {syncing ? "Trying…" : "Try again anyway"}
              </Secondary>
            )}

            {/* The way past a protected branch, offered where the branch is
                named as the cause rather than left to be found. */}
            {code === "forbidden" && workspace && !workspace.isLocal && (
              <Secondary
                onClick={() => {
                  onPropose();
                  setOpen(false);
                }}
              >
                Open a pull request instead
              </Secondary>
            )}

            {workspace && !workspace.isLocal && (
              <Secondary
                as="a"
                href={`https://github.com/${workspace.repo.owner}/${workspace.repo.repo}`}
              >
                Open repository
              </Secondary>
            )}

            <Secondary onClick={copyDetails}>{copied ? "Copied" : "Copy details"}</Secondary>
          </div>

          {/* The machine's own words, kept but demoted. `GitRPC::BadObjectState`
              is no use to somebody writing notes and every use to whoever ends
              up reading the bug report. */}
          <div className="px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--fl-muted)]">
              Details
            </p>
            <dl className="mt-1.5 space-y-1 text-[11px] leading-relaxed">
              <Detail term="Kind">{code ?? "unknown"}</Detail>
              {sync.lastErrorDetail && !quoted && (
                <Detail term="GitHub said">
                  <span className="break-words font-mono text-[10.5px]">
                    {sync.lastErrorDetail}
                  </span>
                </Detail>
              )}
              {sync.failedAttempts > 0 && (
                <Detail term="Attempts">
                  {sync.failedAttempts} failed in a row
                  {sync.lastErrorAt ? `, last ${when(sync.lastErrorAt)}` : ""}
                </Detail>
              )}
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}

function Primary({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-md bg-[var(--fl-accent)] px-2.5 py-1 text-[11.5px] font-semibold text-[var(--fl-accent-contrast)] transition-colors hover:bg-[var(--fl-accent-hover)] disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function Secondary({
  children,
  onClick,
  disabled,
  as,
  href,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  as?: "a";
  href?: string;
}) {
  const className =
    "rounded-md border border-[var(--fl-border)] px-2.5 py-1 text-[11.5px] font-medium text-[var(--fl-text)] transition-colors hover:bg-[var(--fl-elevated)] disabled:opacity-40";

  if (as === "a") {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className}>
        {children}
      </a>
    );
  }

  return (
    <button type="button" onClick={onClick} disabled={disabled} className={className}>
      {children}
    </button>
  );
}

function Detail({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-[var(--fl-muted)]">{term}</dt>
      <dd className="min-w-0 flex-1 text-[var(--fl-text)]">{children}</dd>
    </div>
  );
}

function when(iso: string): string {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
