"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Note, Workspace } from "@forkleaf/types";
import { Dialog } from "./Dialog";
import { DiffView } from "./DiffView";
import { listNoteHistory, readNoteAtCommit, type NoteCommitDto } from "@/lib/gateway";

export interface HistoryDialogProps {
  note: Note;
  workspace: Workspace;
  onClose: () => void;
  /** Replaces the note's content with an older revision. */
  onRestore: (content: string) => void | Promise<void>;
}

/** What a selected revision is being compared against. */
type Baseline = "previous" | "current" | "pinned";

/**
 * A note's version history.
 *
 * The previous version listed commits and, on selection, printed the whole file
 * as it was then. That answers "what did this look like?" but not "what
 * changed?", which is the question people actually open history to ask — so the
 * body is now a diff, and what it is measured against is the reader's choice:
 * the commit before it, the working copy, or any other revision they pin.
 */
export function HistoryDialog({ note, workspace, onClose, onRestore }: HistoryDialogProps) {
  const [commits, setCommits] = useState<NoteCommitDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<NoteCommitDto | null>(null);
  const [pinned, setPinned] = useState<NoteCommitDto | null>(null);
  const [baseline, setBaseline] = useState<Baseline>("previous");
  const [mode, setMode] = useState<"unified" | "split">("split");
  const [restoring, setRestoring] = useState(false);

  // Revisions are fetched once each and kept, so flipping between versions or
  // baselines does not re-hit the API for text already on screen.
  const [texts, setTexts] = useState<Record<string, string | null>>({});
  // Tracks what has been requested, so a second render while a fetch is in
  // flight does not start the same request again.
  const requested = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;

    void listNoteHistory(workspace.repo, note.path)
      .then((result) => {
        if (cancelled) return;
        setCommits(result);
        if (result[0]) setSelected(result[0]);
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

  const previous = useMemo(() => {
    if (!commits || !selected) return null;
    const index = commits.findIndex((commit) => commit.sha === selected.sha);
    // The list is newest first, so "the commit before this one" is the next entry.
    return index >= 0 ? (commits[index + 1] ?? null) : null;
  }, [commits, selected]);

  const compareAgainst = baseline === "pinned" ? pinned : baseline === "previous" ? previous : null;

  // Whichever revisions the current comparison needs. `current` compares
  // against the working copy, which is already in memory.
  const needed = useMemo(
    () =>
      [selected?.sha, baseline === "current" ? undefined : compareAgainst?.sha].filter(
        (sha): sha is string => typeof sha === "string",
      ),
    [selected?.sha, baseline, compareAgainst?.sha],
  );

  // Derived rather than stored: "loading" is precisely "something we need has
  // not arrived yet", and keeping it as state meant setting it synchronously
  // inside the effect, which cascades an extra render on every selection.
  const loading = needed.some((sha) => !(sha in texts));

  useEffect(() => {
    const missing = needed.filter((sha) => !requested.current.has(sha));
    if (missing.length === 0) return;

    for (const sha of missing) requested.current.add(sha);
    let cancelled = false;

    void Promise.all(
      missing.map(async (sha) => {
        try {
          return [sha, await readNoteAtCommit(workspace.repo, note.path, sha)] as const;
        } catch {
          return [sha, null] as const;
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      setTexts((current) => ({ ...current, ...Object.fromEntries(entries) }));
    });

    return () => {
      cancelled = true;
    };
  }, [needed, workspace.repo, note.path]);

  const selectedText = selected ? texts[selected.sha] : null;
  const baselineText =
    baseline === "current" ? note.content : compareAgainst ? texts[compareAgainst.sha] : "";

  const restore = useCallback(async () => {
    if (typeof selectedText !== "string") return;

    setRestoring(true);
    try {
      // Restoring writes the old text as a new edit rather than rewriting
      // history, so the version you are replacing stays in the log too.
      await onRestore(selectedText);
      onClose();
    } finally {
      setRestoring(false);
    }
  }, [selectedText, onRestore, onClose]);

  const baselineLabel =
    baseline === "current"
      ? "Working copy"
      : baseline === "pinned"
        ? pinned
          ? `${pinned.sha.slice(0, 7)}`
          : "Nothing pinned"
        : previous
          ? `${previous.sha.slice(0, 7)}`
          : "Nothing before this";

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
        <div className="grid gap-4 md:grid-cols-[minmax(0,290px)_minmax(0,1fr)]">
          <ol className="max-h-[56vh] space-y-1 overflow-y-auto pr-1">
            {commits.map((commit, index) => (
              <li key={commit.sha}>
                <CommitRow
                  commit={commit}
                  isNewest={index === 0}
                  selected={selected?.sha === commit.sha}
                  pinned={pinned?.sha === commit.sha}
                  onSelect={() => setSelected(commit)}
                  onPin={() => {
                    setPinned(commit);
                    setBaseline("pinned");
                  }}
                />
              </li>
            ))}
          </ol>

          <div className="flex min-h-0 flex-col">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5 text-[12px] text-[var(--fl-muted)]">
                Compare with
                <select
                  value={baseline}
                  onChange={(event) => setBaseline(event.target.value as Baseline)}
                  className="rounded-md border border-[var(--fl-border)] bg-[var(--fl-surface)] px-2 py-1 text-[12px] text-[var(--fl-text)] outline-none focus:border-[var(--fl-accent)]"
                >
                  <option value="previous">the previous version</option>
                  <option value="current">what I have now</option>
                  <option value="pinned" disabled={!pinned}>
                    {pinned ? `pinned ${pinned.sha.slice(0, 7)}` : "a pinned version"}
                  </option>
                </select>
              </label>

              <div
                role="tablist"
                aria-label="Diff layout"
                className="flex rounded-lg border border-[var(--fl-border)] p-0.5"
              >
                {(["split", "unified"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={mode === value}
                    onClick={() => setMode(value)}
                    className={`rounded-[6px] px-2.5 py-1 text-[12px] font-medium capitalize transition-colors ${
                      mode === value
                        ? "bg-[var(--fl-accent)] text-[var(--fl-accent-contrast)]"
                        : "text-[var(--fl-muted)] hover:text-[var(--fl-text)]"
                    }`}
                  >
                    {value}
                  </button>
                ))}
              </div>

              {/* The one thing the in-app view cannot show is everything else
                  that commit touched, so it links out rather than pretending. */}
              {selected && (
                <a
                  href={`https://github.com/${workspace.repo.owner}/${workspace.repo.repo}/commit/${selected.sha}`}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-auto shrink-0 rounded-lg px-2 py-1.5 text-[12.5px] text-[var(--fl-muted)] underline decoration-[var(--fl-border-strong)] underline-offset-[3px] transition-colors hover:text-[var(--fl-text)]"
                >
                  Whole commit on GitHub
                </a>
              )}

              <button
                type="button"
                onClick={() => void restore()}
                disabled={typeof selectedText !== "string" || restoring}
                className="shrink-0 rounded-lg bg-[var(--fl-accent)] px-3 py-1.5 text-[12.5px] font-semibold text-[var(--fl-accent-contrast)] transition-colors hover:bg-[var(--fl-accent-hover)] disabled:opacity-40"
              >
                {restoring ? "Restoring…" : "Restore this version"}
              </button>
            </div>

            {loading && (
              <p aria-busy="true" className="py-10 text-center text-[13px] text-[var(--fl-muted)]">
                Loading revisions…
              </p>
            )}

            {!loading && selectedText === null && (
              <p className="py-10 text-center text-[13px] text-[var(--fl-danger)]">
                This version could not be read.
              </p>
            )}

            {!loading && typeof selectedText === "string" && (
              <DiffView
                oldText={typeof baselineText === "string" ? baselineText : ""}
                newText={selectedText}
                oldLabel={baselineLabel}
                newLabel={selected ? `${selected.sha.slice(0, 7)} (selected)` : "Selected"}
                mode={mode}
                className="max-h-[52vh]"
              />
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

/**
 * One commit in the list.
 *
 * Carries more than the old row did — author, avatar, absolute and relative
 * time, the short SHA, and whether it was an autosave — because "Autosaved ·
 * 3d ago" on its own is not enough to pick a version out of a list of thirty.
 */
function CommitRow({
  commit,
  isNewest,
  selected,
  pinned,
  onSelect,
  onPin,
}: {
  commit: NoteCommitDto;
  isNewest: boolean;
  selected: boolean;
  pinned: boolean;
  onSelect: () => void;
  onPin: () => void;
}) {
  return (
    <div
      className={`rounded-lg border transition-colors ${
        selected
          ? "border-[var(--fl-accent)] bg-[var(--fl-accent-soft)]"
          : "border-transparent hover:border-[var(--fl-border)] hover:bg-[var(--fl-elevated)]"
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected}
        className="w-full px-3 py-2.5 text-left"
      >
        <span className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--fl-text)]">
            {commit.byForkLeaf && !commit.message ? "Autosaved" : commit.message || "(no message)"}
          </span>
          {isNewest && (
            <span className="shrink-0 rounded bg-[var(--fl-accent)]/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--fl-accent)]">
              Latest
            </span>
          )}
        </span>

        <span className="mt-1 flex items-center gap-1.5">
          {commit.avatarUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={commit.avatarUrl} alt="" width={14} height={14} className="rounded-full" />
          )}
          <span className="min-w-0 flex-1 truncate text-[11.5px] text-[var(--fl-muted)]">
            {commit.authorName}
            {commit.authorLogin ? ` (@${commit.authorLogin})` : ""}
          </span>
        </span>

        <span className="mt-0.5 flex items-center gap-2 text-[11px] text-[var(--fl-muted)]">
          <time dateTime={commit.date} title={new Date(commit.date).toLocaleString()}>
            {relative(commit.date)}
          </time>
          <span aria-hidden="true">·</span>
          <span className="font-mono text-[10.5px]">{commit.sha.slice(0, 7)}</span>
          {commit.byForkLeaf && (
            <>
              <span aria-hidden="true">·</span>
              <span>via ForkLeaf</span>
            </>
          )}
        </span>
      </button>

      <div className="flex justify-end px-3 pb-2">
        <button
          type="button"
          onClick={onPin}
          className={`rounded px-1.5 py-0.5 text-[11px] transition-colors ${
            pinned
              ? "text-[var(--fl-accent)]"
              : "text-[var(--fl-muted)] hover:text-[var(--fl-text)]"
          }`}
        >
          {pinned ? "Pinned as baseline" : "Compare against this"}
        </button>
      </div>
    </div>
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
