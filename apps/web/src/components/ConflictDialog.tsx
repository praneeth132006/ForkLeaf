"use client";

import React from "react";
import type { Conflict, ConflictResolution } from "@forkleaf/types";
import { Dialog } from "./Dialog";

export interface ConflictDialogProps {
  conflicts: Conflict[];
  onResolve: (path: string, resolution: ConflictResolution) => void;
  onClose: () => void;
}

/**
 * Conflict resolution.
 *
 * Reached when the same note changed both here and on GitHub — another device,
 * a direct edit on github.com, a teammate's pull request. The app never picks
 * silently, because either choice can throw away work someone deliberately did.
 */
export function ConflictDialog({ conflicts, onResolve, onClose }: ConflictDialogProps) {
  return (
    <Dialog title="This note changed in two places" onClose={onClose} wide>
      <p className="mb-4 text-sm text-[var(--fl-muted)]">
        Your copy and the copy on GitHub have both changed since they were last in sync. Nothing has
        been overwritten — choose what to keep.
      </p>

      <div className="space-y-6">
        {conflicts.map((conflict) => (
          <section key={`${conflict.workspaceId}:${conflict.path}`}>
            <h3 className="mb-2 font-mono text-sm text-[var(--fl-text)]">{conflict.path}</h3>

            <div className="grid gap-3 sm:grid-cols-2">
              <Version label="Your version" content={conflict.localContent} accent="amber" />
              <Version label="Version on GitHub" content={conflict.remoteContent} accent="teal" />
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onResolve(conflict.path, "keep-local")}
                className="rounded-md bg-[var(--fl-accent)] px-3 py-1.5 text-sm font-medium text-[var(--fl-accent-contrast)] hover:opacity-90"
              >
                Keep mine
              </button>
              <button
                type="button"
                onClick={() => onResolve(conflict.path, "keep-remote")}
                className="rounded-md border border-[var(--fl-border)] px-3 py-1.5 text-sm text-[var(--fl-text)] hover:bg-[var(--fl-elevated)]"
              >
                Use GitHub&apos;s
              </button>
              <button
                type="button"
                onClick={() => onResolve(conflict.path, "keep-both")}
                className="rounded-md border border-[var(--fl-border)] px-3 py-1.5 text-sm text-[var(--fl-text)] hover:bg-[var(--fl-elevated)]"
              >
                Keep both
              </button>
              <span className="self-center text-xs text-[var(--fl-muted)]">
                “Keep both” saves yours alongside as a copy.
              </span>
            </div>
          </section>
        ))}
      </div>
    </Dialog>
  );
}

function Version({
  label,
  content,
  accent,
}: {
  label: string;
  content: string;
  accent: "amber" | "teal";
}) {
  const border = accent === "amber" ? "var(--fl-warn)" : "var(--fl-accent)";

  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-[var(--fl-muted)]">
        {label}
      </p>
      <pre
        style={{ borderColor: border }}
        className="max-h-48 overflow-auto rounded-md border-l-4 bg-[var(--fl-elevated)] p-2 text-xs leading-relaxed text-[var(--fl-text)]"
      >
        {content.slice(0, 2000) || "(empty)"}
      </pre>
    </div>
  );
}
