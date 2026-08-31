"use client";

import { useCallback, useMemo, useState } from "react";
import { Preview } from "@forkleaf/editor";
import type { RepoRef, TreeNode } from "@forkleaf/types";
import { Dialog } from "@/components/Dialog";
import { readNotebookAt, readNoteAtCommit, type NoteCommitDto } from "@/lib/gateway";
import { collectFilePaths } from "@/lib/tree";
import { relativeTime } from "@/lib/relative-time";

/**
 * The whole notebook, as it was on a day you choose.
 *
 * A note's history answers "how did this page come to be?" one page at a time.
 * This answers the question people ask when they are trying to remember rather
 * than to audit: what did I know when I made that decision? Which notes even
 * existed in March? The per-note history cannot answer either, because both
 * are about the shape of the notebook rather than about one file in it.
 *
 * Nothing here is new machinery. Git already holds every version of every
 * file; a tree read at an old commit is the same call as a tree read at the
 * newest one, and the notes come back through the same route the history panel
 * already uses. All that was missing was somewhere to ask.
 *
 * Read-only, deliberately and visibly. Restoring an old version of one note is
 * a thing the history panel does well and this does not do at all — a button
 * that rolled a whole notebook back to March would be the single most
 * dangerous control in the app.
 */

export interface TimeMachineDialogProps {
  onClose: () => void;
  repo: RepoRef;
  /** Today, so the picker cannot ask for a notebook that has not happened. */
  today?: string;
}

type State =
  | { kind: "idle" }
  | { kind: "reading" }
  | { kind: "found"; commit: NoteCommitDto | null; tree: TreeNode[]; date: string }
  | { kind: "error"; message: string };

export function TimeMachineDialog({ onClose, repo, today }: TimeMachineDialogProps) {
  const now = today ?? new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(now);
  const [state, setState] = useState<State>({ kind: "idle" });

  /** The note being read, and its text at that commit. */
  const [open, setOpen] = useState<{ path: string; text: string | null } | null>(null);
  const [reading, setReading] = useState<string | null>(null);

  const go = useCallback(async () => {
    setState({ kind: "reading" });
    setOpen(null);

    try {
      const { commit, tree } = await readNotebookAt(repo, date);
      setState({ kind: "found", commit, tree, date });
    } catch (problem: unknown) {
      setState({
        kind: "error",
        message:
          problem instanceof Error
            ? problem.message
            : "That day could not be read from the repository.",
      });
    }
  }, [repo, date]);

  const paths = useMemo(
    () => (state.kind === "found" ? collectFilePaths(state.tree).sort() : []),
    [state],
  );

  const read = useCallback(
    async (path: string) => {
      if (state.kind !== "found" || !state.commit) return;

      setReading(path);
      setOpen(null);
      try {
        const text = await readNoteAtCommit(repo, path, state.commit.sha);
        setOpen({ path, text });
      } catch {
        // Said in place of the note rather than as an alarm: the rest of the
        // day is still readable, and this is one file in it.
        setOpen({ path, text: null });
      } finally {
        setReading(null);
      }
    },
    [repo, state],
  );

  return (
    <Dialog
      title="Your notebook, on a day you choose"
      subtitle="Every note as it was — read-only, straight out of the repository's history"
      onClose={onClose}
      wide
      steady
    >
      <div className="flex min-h-0 flex-col gap-3 text-[13px]">
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--fl-muted)]">
              Show me
            </span>
            <input
              type="date"
              value={date}
              max={now}
              onChange={(event) => setDate(event.target.value)}
              className="rounded-lg border border-[var(--fl-border)] bg-[var(--fl-surface)] px-2.5 py-1.5 text-[13px] text-[var(--fl-text)] outline-none focus:border-[var(--fl-accent)]"
            />
          </label>

          <button
            type="button"
            onClick={() => void go()}
            disabled={state.kind === "reading" || !date}
            className="fl-btn fl-btn-primary !py-1.5 disabled:opacity-60"
          >
            {state.kind === "reading" ? "Reading…" : "Go there"}
          </button>

          {state.kind === "found" && state.commit && (
            <p className="text-[11.5px] text-[var(--fl-muted)]">
              As of{" "}
              <span className="font-mono text-[11px] text-[var(--fl-text)]">
                {state.commit.sha.slice(0, 7)}
              </span>{" "}
              — {state.commit.message || "(no message)"}, {relativeTime(state.commit.date)}
            </p>
          )}
        </div>

        {state.kind === "error" && (
          <p role="alert" className="text-[var(--fl-danger)]">
            {state.message}
          </p>
        )}

        {state.kind === "found" && !state.commit && (
          <p className="text-[var(--fl-muted)]">
            Nothing had been committed to this repository by {state.date}. A notebook has a first
            day.
          </p>
        )}

        {state.kind === "found" && state.commit && (
          <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-[minmax(12rem,18rem)_1fr]">
            <div className="min-h-0 overflow-y-auto rounded-xl border border-[var(--fl-border)] p-1.5">
              <p className="px-1.5 pb-1 text-[11px] text-[var(--fl-muted)]">
                {paths.length} {paths.length === 1 ? "file" : "files"} that day
              </p>
              <ul>
                {paths.map((path) => (
                  <li key={path}>
                    <button
                      type="button"
                      onClick={() => void read(path)}
                      aria-current={open?.path === path}
                      className={`block w-full truncate rounded px-1.5 py-1 text-left font-mono text-[11px] transition-colors ${
                        open?.path === path
                          ? "bg-[var(--fl-accent-soft)] text-[var(--fl-text)]"
                          : "text-[var(--fl-muted)] hover:bg-[var(--fl-elevated)] hover:text-[var(--fl-text)]"
                      }`}
                    >
                      {path}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="min-h-0 overflow-y-auto rounded-xl border border-[var(--fl-border)] p-3">
              {reading && (
                <p aria-busy="true" className="text-[var(--fl-muted)]">
                  Reading {reading}…
                </p>
              )}

              {!reading && !open && (
                <p className="text-[var(--fl-muted)]">
                  Pick a note to read it as it was. Nothing here can be edited — this is the
                  repository&rsquo;s own history, not a copy of it.
                </p>
              )}

              {!reading && open && open.text === null && (
                <p className="text-[var(--fl-muted)]">
                  {open.path} could not be read at that commit.
                </p>
              )}

              {!reading && open?.text != null && <Preview markdown={open.text} />}
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
