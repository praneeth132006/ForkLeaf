"use client";

import React from "react";

// ─── EditorStatusBar ────────────────────────────────────────────────────────
// A thin 32px-tall bar pinned to the bottom of the editor viewport.
// Displays sync status (left), current branch (center), and last commit /
// PR link (right).  For guest mode everything is static / placeholder.

export default function EditorStatusBar() {
  // Guest-mode defaults — in production these would come from context / props
  const syncLabel = "Local Only";
  const syncColor = "var(--color-mist)"; // mist for guest mode
  const branchName = "local"; // no real branch for guests
  const lastCommit = "never"; // guest mode has no commits
  const prUrl: string | null = null; // no PR for guests

  return (
    <footer
      className="h-8 shrink-0 flex items-center justify-between px-4 border-t border-[var(--color-chalk)] bg-[var(--color-paper)] text-[10px] select-none"
      role="status"
      aria-label="Editor status bar"
    >
      {/* ── Left: Sync status icon + text ────────────────────────────── */}
      <div className="flex items-center gap-1.5 min-w-0">
        {/* Small coloured dot mirroring the right-panel indicator */}
        <span
          className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
          style={{ backgroundColor: syncColor }}
        />
        {/* Sync label */}
        <span className="text-[var(--color-mist)] font-medium whitespace-nowrap">
          {syncLabel}
        </span>
      </div>

      {/* ── Center: Current branch name in monospace ─────────────────── */}
      <div className="font-mono text-[var(--color-mist)] whitespace-nowrap">
        {branchName}
      </div>

      {/* ── Right: Last commit info + optional PR link ───────────────── */}
      <div className="flex items-center gap-3 min-w-0">
        {/* Last commit timestamp (or "never" for guests) */}
        <span className="text-[var(--color-mist)] whitespace-nowrap">
          Last commit: {lastCommit}
        </span>

        {/* PR link – only rendered when a PR URL exists */}
        {prUrl && (
          <a
            href={prUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--color-trail-teal)] hover:underline whitespace-nowrap font-medium"
          >
            Open PR
          </a>
        )}
      </div>
    </footer>
  );
}
