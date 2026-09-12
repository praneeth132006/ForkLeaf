"use client";

import { useState } from "react";
import { Preview } from "@forkleaf/editor";
import type { RepoRef } from "@forkleaf/types";
import { Dialog } from "@/components/Dialog";
import { readNotebookAt, readNoteAtCommit } from "@/lib/gateway";
import { collectFilePaths } from "@/lib/tree";
import { daysBefore, deletedSince, type DeletedNote } from "@/lib/deleted-notes";

/**
 * Notes that have been deleted, and a button that puts one back.
 *
 * Restoring writes the note as it last stood, at the path it had, as an
 * ordinary new change — so bringing a note back is itself in the history, and
 * deleting it again is exactly as easy as it was the first time. Nothing is
 * rewound; the rest of the notebook is not touched.
 */

export interface DeletedNotesDialogProps {
  onClose: () => void;
  repo: RepoRef;
  /** Every file in the notebook now, including changes not yet pushed. */
  currentPaths: readonly string[];
  /** Writes the note back; resolves to the path it landed at, or null. */
  onRestore: (path: string, raw: string) => Promise<string | null>;
  onOpenNote: (path: string) => void;
  /** For tests; defaults to the clock. */
  now?: Date;
}

const RANGES = [
  { days: 7, label: "the last week" },
  { days: 30, label: "the last month" },
  { days: 90, label: "the last three months" },
  { days: 365, label: "the last year" },
];

type State =
  | { kind: "idle" }
  | { kind: "reading" }
  | { kind: "found"; sha: string | null; date: string; notes: DeletedNote[] }
  | { kind: "error"; message: string };

export function DeletedNotesDialog({
  onClose,
  repo,
  currentPaths,
  onRestore,
  onOpenNote,
  now,
}: DeletedNotesDialogProps) {
  const [days, setDays] = useState(30);
  const [state, setState] = useState<State>({ kind: "idle" });
  const [open, setOpen] = useState<{ path: string; text: string | null } | null>(null);
  const [restored, setRestored] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const look = async () => {
    setState({ kind: "reading" });
    setOpen(null);
    setProblem(null);
    const date = daysBefore(now ?? new Date(), days);
    try {
      const { commit, tree } = await readNotebookAt(repo, date);
      setState({
        kind: "found",
        sha: commit?.sha ?? null,
        date,
        notes: commit ? deletedSince(collectFilePaths(tree), currentPaths) : [],
      });
    } catch (error: unknown) {
      setState({
        kind: "error",
        message: error instanceof Error ? error.message : "The history could not be read.",
      });
    }
  };

  const textOf = async (sha: string, path: string) => {
    if (open?.path === path && open.text !== null) return open.text;
    return await readNoteAtCommit(repo, path, sha);
  };

  const preview = async (path: string) => {
    if (state.kind !== "found" || !state.sha) return;
    setBusy(path);
    try {
      setOpen({ path, text: await textOf(state.sha, path) });
    } catch {
      setOpen({ path, text: null });
    } finally {
      setBusy(null);
    }
  };

  const restore = async (path: string) => {
    if (state.kind !== "found" || !state.sha) return;
    setBusy(path);
    setProblem(null);
    try {
      const text = await textOf(state.sha, path);
      if (text === null) throw new Error(`${path} could not be read from the history.`);
      const landed = await onRestore(path, text);
      if (!landed) throw new Error(`${path} could not be written back.`);
      setRestored((current) => ({ ...current, [path]: landed }));
    } catch (error: unknown) {
      setProblem(error instanceof Error ? error.message : `${path} could not be brought back.`);
    } finally {
      setBusy(null);
    }
  };

  const found = state.kind === "found" ? state : null;

  return (
    <Dialog
      title="Bring back a deleted note"
      subtitle="Notes that existed on an earlier day and are gone now, straight from the history"
      onClose={onClose}
      wide
      steady
    >
      <div className="flex min-h-0 flex-col gap-3 text-[13px]">
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--fl-muted)]">
              Deleted in
            </span>
            <select
              value={days}
              onChange={(event) => setDays(Number(event.target.value))}
              className="rounded-lg border border-[var(--fl-border)] bg-[var(--fl-surface)] px-2.5 py-1.5 text-[13px] text-[var(--fl-text)] outline-none focus:border-[var(--fl-accent)]"
            >
              {RANGES.map((range) => (
                <option key={range.days} value={range.days}>
                  {range.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => void look()}
            disabled={state.kind === "reading"}
            className="fl-btn fl-btn-primary !py-1.5 disabled:opacity-60"
          >
            {state.kind === "reading" ? "Reading the history…" : "Find deleted notes"}
          </button>
        </div>

        {state.kind === "error" && (
          <p role="alert" className="text-[var(--fl-danger)]">
            {state.message}
          </p>
        )}
        {problem && (
          <p role="alert" className="text-[var(--fl-danger)]">
            {problem}
          </p>
        )}

        {found && found.notes.length === 0 && (
          <p className="text-[var(--fl-muted)]">
            {found.sha
              ? `Every note that existed on ${found.date} is still here.`
              : `Nothing had been committed by ${found.date}.`}{" "}
            A note made and deleted in between is not listed; pick a longer range to look further
            back.
          </p>
        )}

        {found && found.notes.length > 0 && (
          <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-[minmax(14rem,20rem)_1fr]">
            <ul className="min-h-0 space-y-1 overflow-y-auto rounded-xl border border-[var(--fl-border)] p-1.5">
              {found.notes.map((note) => (
                <li key={note.path} className="rounded-lg p-1.5 hover:bg-[var(--fl-elevated)]">
                  <button
                    type="button"
                    onClick={() => void preview(note.path)}
                    aria-current={open?.path === note.path}
                    className="block w-full truncate text-left font-mono text-[11.5px] text-[var(--fl-text)]"
                  >
                    {note.path}
                  </button>
                  {note.movedTo && (
                    <span className="block truncate text-[11px] text-[var(--fl-muted)]">
                      Probably moved to {note.movedTo}
                    </span>
                  )}
                  <div className="mt-1 flex gap-1.5">
                    {restored[note.path] ? (
                      <button
                        type="button"
                        onClick={() => onOpenNote(restored[note.path]!)}
                        className="rounded border border-[var(--fl-border)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--fl-accent)]"
                      >
                        Restored — open it
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void restore(note.path)}
                        disabled={busy !== null}
                        aria-label={`Bring back ${note.path}`}
                        className="rounded border border-[var(--fl-border)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--fl-text)] hover:bg-[var(--fl-surface)] disabled:opacity-50"
                      >
                        Bring it back
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>

            <div className="min-h-0 overflow-y-auto rounded-xl border border-[var(--fl-border)] p-3">
              {busy && !open && <p className="text-[var(--fl-muted)]">Reading {busy}…</p>}
              {!busy && !open && (
                <p className="text-[var(--fl-muted)]">
                  Pick a note to read it as it was on {found.date}.
                </p>
              )}
              {open && open.text === null && (
                <p className="text-[var(--fl-muted)]">{open.path} could not be read.</p>
              )}
              {open?.text != null && <Preview markdown={open.text} />}
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
