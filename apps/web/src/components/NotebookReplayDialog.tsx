"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RepoRef } from "@forkleaf/types";
import { Dialog } from "@/components/Dialog";
import { readNotebookAt } from "@/lib/gateway";
import { mapPool } from "@/lib/pool";
import {
  REPLAY_SPANS,
  diffFrames,
  dotSize,
  notesInTree,
  replayDates,
  replayOrder,
  type ReplayChange,
  type ReplayFrame,
} from "@/lib/notebook-replay";

/**
 * Watch the notebook being written.
 *
 * A row of snapshots of the repository, from a span you choose up to today,
 * played one after another: every note a dot sized by how much is in it, new
 * ones lit as they arrive, ones that grew or shrank marked as they change.
 * Read-only, and built from the repository's trees alone — see
 * `notebook-replay.ts` for why that is enough.
 */

export interface NotebookReplayDialogProps {
  onClose: () => void;
  repo: RepoRef;
  /** Opens a note from the replay, as it is today. */
  onOpenNote: (path: string) => void;
  /** Today, so tests can hold the clock still. */
  today?: string;
}

/** Snapshots read at once; a span is a dozen or so, so this is a few rounds. */
const CONCURRENCY = 3;
const PLAY_MS = 900;

const CHANGE_STYLE: Record<ReplayChange, string> = {
  new: "bg-[var(--fl-accent)] ring-2 ring-[var(--fl-accent)] ring-offset-1 ring-offset-[var(--fl-bg)]",
  grew: "bg-emerald-500/80",
  shrank: "bg-amber-500/80",
  same: "bg-[var(--fl-muted)]/35",
};

const CHANGE_LABEL: Record<ReplayChange, string> = {
  new: "New",
  grew: "Grew",
  shrank: "Shrank",
  same: "Unchanged",
};

type Load =
  | { kind: "idle" }
  | { kind: "loading"; done: number; total: number }
  | { kind: "ready"; frames: ReplayFrame[] }
  | { kind: "error"; message: string };

function kilobytes(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(bytes < 10_240 ? 1 : 0)} KB`;
}

export function NotebookReplayDialog({
  onClose,
  repo,
  onOpenNote,
  today,
}: NotebookReplayDialogProps) {
  const now = today ?? new Date().toISOString().slice(0, 10);
  const [spanId, setSpanId] = useState(REPLAY_SPANS[2]!.id);
  const [load, setLoad] = useState<Load>({ kind: "idle" });
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

  const start = useCallback(async () => {
    const span = REPLAY_SPANS.find((each) => each.id === spanId) ?? REPLAY_SPANS[2]!;
    const dates = replayDates(now, span);

    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setPlaying(false);
    setLoad({ kind: "loading", done: 0, total: dates.length });

    try {
      let done = 0;
      const frames = await mapPool(
        dates,
        CONCURRENCY,
        async (date): Promise<ReplayFrame> => {
          const { commit, tree } = await readNotebookAt(repo, date);
          done += 1;
          if (!controller.signal.aborted) {
            setLoad({ kind: "loading", done, total: dates.length });
          }
          return { date, sha: commit?.sha ?? null, notes: commit ? notesInTree(tree) : [] };
        },
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;

      // Days before the first commit show nothing, and a replay that opens on
      // a run of empty frames looks broken. It starts on the first day there
      // was anything, unless there never was.
      const first = frames.findIndex((frame) => frame.notes.length > 0);
      const kept = first > 0 ? frames.slice(first) : frames;

      setLoad({ kind: "ready", frames: kept });
      setIndex(0);
      setPlaying(kept.length > 1);
    } catch (problem: unknown) {
      if (controller.signal.aborted) return;
      setLoad({
        kind: "error",
        message:
          problem instanceof Error ? problem.message : "The history could not be read just now.",
      });
    }
  }, [repo, spanId, now]);

  const frames = useMemo(() => (load.kind === "ready" ? load.frames : []), [load]);
  const order = useMemo(() => replayOrder(frames), [frames]);
  const position = useMemo(() => new Map(order.map((path, at) => [path, at])), [order]);

  const frame = frames[index] ?? null;
  const diff = useMemo(
    () => (frame ? diffFrames(frames[index - 1] ?? null, frame) : null),
    [frames, frame, index],
  );
  const ordered = useMemo(
    () =>
      diff
        ? [...diff.notes].sort((a, b) => (position.get(a.path) ?? 0) - (position.get(b.path) ?? 0))
        : [],
    [diff, position],
  );

  useEffect(() => {
    if (!playing || frames.length < 2) return;
    const timer = window.setTimeout(() => {
      if (index >= frames.length - 1) setPlaying(false);
      else setIndex(index + 1);
    }, PLAY_MS);
    return () => window.clearTimeout(timer);
  }, [playing, index, frames.length]);

  const counts = useMemo(() => {
    const found: Record<ReplayChange, number> = { new: 0, grew: 0, shrank: 0, same: 0 };
    for (const note of diff?.notes ?? []) found[note.change] += 1;
    return found;
  }, [diff]);

  return (
    <Dialog
      title="Replay your notebook"
      subtitle="Watch notes appear and grow, straight out of the repository's history"
      onClose={onClose}
      wide
      steady
    >
      <div className="flex min-h-0 flex-col gap-3 text-[13px]">
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--fl-muted)]">
              Replay
            </span>
            <select
              value={spanId}
              onChange={(event) => setSpanId(event.target.value)}
              disabled={load.kind === "loading"}
              className="rounded-lg border border-[var(--fl-border)] bg-[var(--fl-surface)] px-2.5 py-1.5 text-[13px] text-[var(--fl-text)] outline-none focus:border-[var(--fl-accent)]"
            >
              {REPLAY_SPANS.map((span) => (
                <option key={span.id} value={span.id}>
                  {span.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => void start()}
            disabled={load.kind === "loading"}
            className="fl-btn fl-btn-primary !py-1.5 disabled:opacity-60"
          >
            {load.kind === "loading"
              ? `Reading ${load.done} of ${load.total}…`
              : load.kind === "ready"
                ? "Read again"
                : "Start"}
          </button>
        </div>

        {load.kind === "idle" && (
          <p className="text-[var(--fl-muted)]">
            Choose how far back to go. Each step reads the notebook as it stood that day — only the
            list of files and their sizes, so even a long replay is a dozen requests.
          </p>
        )}

        {load.kind === "error" && (
          <p role="alert" className="text-[var(--fl-danger)]">
            {load.message}
          </p>
        )}

        {load.kind === "ready" && frames.every((each) => each.notes.length === 0) && (
          <p className="text-[var(--fl-muted)]">
            There were no notes in this repository in that time. Try a longer span.
          </p>
        )}

        {frame && diff && frames.some((each) => each.notes.length > 0) && (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  if (index >= frames.length - 1) setIndex(0);
                  setPlaying(!playing);
                }}
                className="fl-btn fl-btn-ghost !py-1"
                aria-label={playing ? "Pause" : "Play"}
              >
                {playing ? "Pause" : index >= frames.length - 1 ? "Play again" : "Play"}
              </button>
              <input
                type="range"
                min={0}
                max={frames.length - 1}
                value={index}
                onChange={(event) => {
                  setPlaying(false);
                  setIndex(Number(event.target.value));
                }}
                aria-label="Day in the replay"
                className="min-w-[10rem] flex-1 accent-[var(--fl-accent)]"
              />
              <span className="font-mono text-[12px] text-[var(--fl-text)]">{frame.date}</span>
            </div>

            <p className="text-[12px] text-[var(--fl-muted)]" aria-live="polite">
              {diff.notes.length} {diff.notes.length === 1 ? "note" : "notes"} ·{" "}
              {kilobytes(diff.totalBytes)}
              {index > 0 &&
                ` · ${counts.new} new, ${counts.grew} grew, ${counts.shrank} shrank${
                  diff.removed.length ? `, ${diff.removed.length} removed` : ""
                }`}
            </p>

            <div className="min-h-[12rem] flex-1 overflow-y-auto rounded-xl border border-[var(--fl-border)] p-3">
              <ul className="flex flex-wrap items-center gap-1.5">
                {ordered.map((note) => {
                  const size = dotSize(note.size);
                  return (
                    <li key={note.path} className="flex items-center justify-center">
                      <button
                        type="button"
                        onClick={() => onOpenNote(note.path)}
                        title={`${note.path} · ${kilobytes(note.size)} · ${CHANGE_LABEL[note.change]}`}
                        aria-label={`${note.path}, ${CHANGE_LABEL[note.change].toLowerCase()}`}
                        style={{ width: size, height: size }}
                        className={`rounded-full transition-all duration-500 ${CHANGE_STYLE[note.change]}`}
                      />
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="flex flex-wrap gap-3 text-[11.5px] text-[var(--fl-muted)]">
              {(["new", "grew", "shrank", "same"] as const).map((change) => (
                <span key={change} className="flex items-center gap-1.5">
                  <span
                    className={`inline-block h-2.5 w-2.5 rounded-full ${CHANGE_STYLE[change]}`}
                  />
                  {CHANGE_LABEL[change]}
                </span>
              ))}
              <span>· Bigger dot, longer note · Click a dot to open the note as it is today</span>
            </div>

            {diff.removed.length > 0 && (
              <p className="text-[11.5px] text-[var(--fl-muted)]">
                Removed since the step before: {diff.removed.join(", ")}
              </p>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}
