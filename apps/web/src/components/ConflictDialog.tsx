"use client";

import { useState } from "react";
import type { Conflict, ConflictResolution } from "@forkleaf/types";
import { diffLines, diffStats } from "@forkleaf/markdown-engine";
import { Dialog } from "./Dialog";
import { DiffView } from "./DiffView";

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
 *
 * Which means the reader has to be able to see what they would be throwing
 * away. Two truncated columns of raw text could not answer that: the versions
 * are usually near-identical, and the few lines that differ were exactly what
 * was hardest to find. So the default view is the difference, with the full
 * text available for anyone who wants to read it in one piece.
 */
export function ConflictDialog({ conflicts, onResolve, onClose }: ConflictDialogProps) {
  return (
    <Dialog title="This note changed in two places" onClose={onClose} wide>
      <p className="mb-4 text-sm leading-relaxed text-[var(--fl-muted)]">
        Your copy and the copy on GitHub have both changed since they were last in sync. Nothing has
        been overwritten yet — below is what differs between them.
      </p>

      <div className="space-y-8">
        {conflicts.map((conflict) => (
          <ConflictSection
            key={`${conflict.workspaceId}:${conflict.path}`}
            conflict={conflict}
            onResolve={onResolve}
          />
        ))}
      </div>
    </Dialog>
  );
}

function ConflictSection({
  conflict,
  onResolve,
}: {
  conflict: Conflict;
  onResolve: (path: string, resolution: ConflictResolution) => void;
}) {
  const [showFull, setShowFull] = useState(false);
  const stats = diffStats(diffLines(conflict.remoteContent, conflict.localContent));

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 className="min-w-0 flex-1 truncate font-mono text-sm text-[var(--fl-text)]">
          {conflict.path}
        </h3>
        <p className="shrink-0 text-[12px] text-[var(--fl-muted)]">
          Yours differs by <span className="font-mono text-[var(--fl-accent)]">+{stats.added}</span>{" "}
          <span className="font-mono text-[var(--fl-danger)]">−{stats.removed}</span>
        </p>
        <button
          type="button"
          onClick={() => setShowFull((value) => !value)}
          className="shrink-0 text-[12px] text-[var(--fl-accent)] underline underline-offset-2"
        >
          {showFull ? "Show only what differs" : "Show both in full"}
        </button>
      </div>

      {showFull ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <FullText label="Your version" content={conflict.localContent} accent="warn" />
          <FullText label="Version on GitHub" content={conflict.remoteContent} accent="accent" />
        </div>
      ) : (
        <DiffView
          // GitHub's copy is the baseline: the question being asked is "what
          // would keeping mine change?", not the reverse.
          oldText={conflict.remoteContent}
          newText={conflict.localContent}
          oldLabel="On GitHub"
          newLabel="Yours"
          mode="split"
          className="max-h-[42vh]"
        />
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
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
          Nothing is lost either way — the version you do not keep stays in the repository&rsquo;s
          commit history. &ldquo;Keep both&rdquo; saves yours alongside as a copy.
        </span>
      </div>
    </section>
  );
}

function FullText({
  label,
  content,
  accent,
}: {
  label: string;
  content: string;
  accent: "warn" | "accent";
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-[var(--fl-muted)]">
        {label}
      </p>
      <pre
        style={{ borderColor: accent === "warn" ? "var(--fl-warn)" : "var(--fl-accent)" }}
        className="max-h-[38vh] overflow-auto rounded-md border-l-4 bg-[var(--fl-inverse-bg)] p-2.5 font-mono text-[12px] leading-relaxed text-[var(--fl-inverse-text)]"
      >
        {content || "(empty)"}
      </pre>
    </div>
  );
}
