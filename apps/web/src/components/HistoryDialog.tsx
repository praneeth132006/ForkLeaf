"use client";

import React, { useCallback, useEffect, useState } from "react";
import type { Note, Workspace } from "@forkleaf/types";
import { Dialog } from "./Dialog";
import { listNoteHistory, readNoteAtCommit, type NoteCommitDto } from "@/lib/gateway";

export interface HistoryDialogProps {
  note: Note;
  workspace: Workspace;
  onClose: () => void;
  /** Replaces the note's content with an older revision. */
  onRestore: (content: string) => void | Promise<void>;
}

/**
 * A note's version history, inside the app.
 *
 * Version history was previously a link out to github.com, which is a strange
 * thing to do to someone who is mid-sentence: it costs a tab, a page load, and
 * the reader's place in the document. The data is the same commit list; it just
 * comes through our own proxy and renders here.
 */
export function HistoryDialog({ note, workspace, onClose, onRestore }: HistoryDialogProps) {
  const [commits, setCommits] = useState<NoteCommitDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<NoteCommitDto | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void listNoteHistory(workspace.repo, note.path)
      .then((result) => {
        if (!cancelled) setCommits(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load the history.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [workspace.repo, note.path]);

  const select = useCallback(
    async (commit: NoteCommitDto) => {
      setSelected(commit);
      setPreview(null);
      setLoadingPreview(true);

      try {
        setPreview(await readNoteAtCommit(workspace.repo, note.path, commit.sha));
      } catch {
        setPreview(null);
      } finally {
        setLoadingPreview(false);
      }
    },
    [workspace.repo, note.path],
  );

  const restore = useCallback(async () => {
    if (preview === null) return;

    setRestoring(true);
    try {
      // Restoring writes the old text as a new edit rather than rewriting
      // history, so the version you are replacing stays in the log too.
      await onRestore(preview);
      onClose();
    } finally {
      setRestoring(false);
    }
  }, [preview, onRestore, onClose]);

  return (
    <Dialog
      title="Version history"
      subtitle={`${note.path} · ${workspace.repo.owner}/${workspace.repo.repo}`}
      onClose={onClose}
      wide
    >
      {error && (
        <p role="alert" className="text-[13.5px] text-[var(--fl-danger)]">
          {error}
        </p>
      )}

      {!error && commits === null && (
        <p aria-busy="true" className="py-10 text-center text-[13.5px] text-[var(--fl-muted)]">
          Loading history…
        </p>
      )}

      {commits?.length === 0 && (
        <p className="py-10 text-center text-[13.5px] leading-relaxed text-[var(--fl-muted)]">
          No commits yet for this note.
          <br />
          It will appear here once the first change has been pushed.
        </p>
      )}

      {commits && commits.length > 0 && (
        <div className="grid gap-4 md:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
          <ol className="max-h-[46vh] space-y-1 overflow-y-auto pr-1">
            {commits.map((commit) => (
              <li key={commit.sha}>
                <button
                  type="button"
                  onClick={() => void select(commit)}
                  aria-current={selected?.sha === commit.sha}
                  className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${
                    selected?.sha === commit.sha
                      ? "border-[var(--fl-accent)] bg-[var(--fl-accent-soft)]"
                      : "border-transparent hover:border-[var(--fl-border)] hover:bg-[var(--fl-elevated)]"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--fl-text)]">
                      {commit.byForkLeaf ? "Autosaved" : commit.message || "(no message)"}
                    </span>
                    <span className="shrink-0 font-mono text-[10.5px] text-[var(--fl-muted)]">
                      {commit.sha.slice(0, 7)}
                    </span>
                  </span>
                  <span className="mt-0.5 block truncate text-[11.5px] text-[var(--fl-muted)]">
                    {commit.authorName} · {relative(commit.date)}
                  </span>
                </button>
              </li>
            ))}
          </ol>

          <div className="min-w-0">
            {!selected && (
              <p className="flex h-full min-h-[200px] items-center justify-center rounded-xl border border-dashed border-[var(--fl-border)] px-6 text-center text-[13px] text-[var(--fl-muted)]">
                Pick a version to see what the note looked like then.
              </p>
            )}

            {selected && (
              <div className="flex h-full flex-col">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--fl-muted)]">
                    {new Date(selected.date).toLocaleString()}
                  </p>
                  <button
                    type="button"
                    onClick={() => void restore()}
                    disabled={loadingPreview || preview === null || restoring}
                    className="shrink-0 rounded-lg bg-[var(--fl-accent)] px-3 py-1.5 text-[12.5px] font-semibold text-[var(--fl-accent-contrast)] transition-colors hover:bg-[var(--fl-accent-hover)] disabled:opacity-40"
                  >
                    {restoring ? "Restoring…" : "Restore this version"}
                  </button>
                </div>

                <pre className="max-h-[42vh] flex-1 overflow-auto rounded-xl border border-[var(--fl-border)] bg-[var(--fl-inverse-bg)] px-4 py-3 font-mono text-[12px] leading-[1.6] text-[var(--fl-inverse-text)]">
                  <code>
                    {loadingPreview ? "Loading…" : (preview ?? "This version could not be read.")}
                  </code>
                </pre>
              </div>
            )}
          </div>
        </div>
      )}

      <p className="mt-5 border-t border-[var(--fl-border)] pt-4 text-[12.5px] leading-relaxed text-[var(--fl-muted)]">
        Restoring writes the old text as a new change rather than rewriting the log, so the version
        you are replacing stays in the history too.
      </p>
    </Dialog>
  );
}

function relative(iso: string): string {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (!Number.isFinite(seconds)) return "";
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 2592000) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}
