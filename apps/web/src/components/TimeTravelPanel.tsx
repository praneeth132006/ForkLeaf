"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildTimeline, diffLines, sparkline, type RevisionInput } from "@forkleaf/markdown-engine";
import { Preview } from "@forkleaf/editor";
import type { NoteCommitDto } from "@/lib/gateway";
import type { RevisionTexts } from "@/hooks/useRevisionTexts";
import { relativeTime, durationLabel } from "@/lib/relative-time";

/**
 * The SHA given to the unsaved working copy when it differs from the newest
 * commit. Not a hex string, so it can never collide with a real object name.
 */
export const WORKING_COPY_SHA = "working-copy";

/** Milliseconds per step at 1×. Slow enough to read a paragraph appearing. */
const STEP_MS = 900;

const SPEEDS = [0.5, 1, 2, 4] as const;
type Speed = (typeof SPEEDS)[number];

const CHART_WIDTH = 1000;
const CHART_HEIGHT = 64;

export interface TimeTravelPanelProps {
  /** The note's commits, newest first — the order the history API returns. */
  commits: readonly NoteCommitDto[];
  /** Shared revision cache, so switching tabs re-uses what has been fetched. */
  revisions: RevisionTexts;
  /** The note as it stands right now, unsaved edits included. */
  workingCopy: string;
  /** Maps an image `src` in the note to something the browser can load. */
  resolveImageSrc?: (src: string) => string;
  /** Writes the revision on screen back into the note as a new change. */
  onRestore: (content: string) => void | Promise<void>;
}

/**
 * A note's history as a thing you can watch happen.
 *
 * The diff pane answers "what changed in this commit?" one commit at a time.
 * That is the right tool for reviewing a change and the wrong one for the
 * question people actually have about their own notes months later: how did
 * this page come to be? A page that arrived whole in one sitting and a page
 * assembled from ten years of scraps look identical in a commit list, and
 * nothing else in a notes app will tell you which one you are looking at.
 *
 * So: every revision measured on one axis, drawn as a curve, with a scrubber
 * that plays through them. The curve is the shape of the thinking — the
 * plateaus, the night it doubled, the week it was cut in half — and the
 * playhead lets you stop on any of those and read what was actually there.
 */
export function TimeTravelPanel({
  commits,
  revisions,
  workingCopy,
  resolveImageSrc,
  onRestore,
}: TimeTravelPanelProps) {
  const [index, setIndex] = useState(0);
  const [wantsToPlay, setWantsToPlay] = useState(false);
  const [speed, setSpeed] = useState<Speed>(1);
  const [view, setView] = useState<"rendered" | "source">("rendered");
  const [restoring, setRestoring] = useState(false);
  const chartRef = useRef<SVGSVGElement>(null);

  const shas = useMemo(() => commits.map((commit) => commit.sha), [commits]);
  const { texts, has, request, prefetch } = revisions;

  // A replay needs the whole history, so it asks for the whole history — a few
  // at a time, in the background, while the reader looks at the first frame.
  useEffect(() => {
    prefetch(shas);
  }, [shas, prefetch]);

  const newestText = commits[0] ? texts[commits[0].sha] : undefined;

  /**
   * The frames of the replay, oldest first.
   *
   * The working copy is appended as its own frame when it differs from the
   * newest commit — otherwise the replay would stop short of what is actually
   * on screen in the editor, which reads as a bug. It is left out until the
   * newest revision has arrived, because until then there is nothing to
   * compare against and every note would sprout a spurious final frame.
   */
  const inputs = useMemo<RevisionInput[]>(() => {
    const frames: RevisionInput[] = commits
      .map((commit) => ({
        sha: commit.sha,
        date: commit.date,
        text: has(commit.sha) ? (texts[commit.sha] ?? null) : null,
        message: commit.byForkLeaf && !commit.message ? "Autosaved" : commit.message,
        authorName: commit.authorName,
      }))
      .reverse();

    if (typeof newestText === "string" && newestText !== workingCopy) {
      frames.push({
        sha: WORKING_COPY_SHA,
        // Now, so it sorts after every commit however the clocks disagree.
        date: new Date().toISOString(),
        text: workingCopy,
        message: "Unsaved working copy",
      });
    }

    return frames;
  }, [commits, texts, has, newestText, workingCopy]);

  const timeline = useMemo(() => buildTimeline(inputs), [inputs]);
  const frames = timeline.revisions;
  const last = Math.max(0, frames.length - 1);

  // A frame can disappear from under the playhead — the working-copy frame
  // does exactly that the moment the note is saved — so the index is clamped
  // rather than trusted.
  const position = Math.min(index, last);
  const current = frames[position];
  const previous = position > 0 ? frames[position - 1] : null;

  /**
   * The text this frame's changes are measured against.
   *
   * Not simply the frame before it: that frame may be one we could not read,
   * and `buildTimeline` already skips over such gaps when counting what a
   * revision added. The source view has to skip the same ones, or a revision
   * whose predecessor failed to load would report "+4 lines" in the readout
   * and highlight none of them in the body.
   *
   * `null` means there is nothing to compare against at all, which is a
   * different thing from comparing against an empty file — the opening frame
   * is shown plain rather than lit up end to end.
   */
  const baselineText = useMemo(() => {
    for (let at = position - 1; at >= 0; at -= 1) {
      const frame = frames[at];
      if (!frame || frame.missing) continue;
      return frame.sha === WORKING_COPY_SHA ? workingCopy : (texts[frame.sha] ?? null);
    }
    return null;
  }, [frames, position, texts, workingCopy]);

  const currentText = current
    ? current.sha === WORKING_COPY_SHA
      ? workingCopy
      : texts[current.sha]
    : undefined;
  const currentLoaded = current ? current.sha === WORKING_COPY_SHA || has(current.sha) : false;

  const loadedCount = shas.filter((sha) => sha in texts).length;
  const loading = loadedCount < shas.length;

  // Derived, not stored: reaching the last frame *is* the end of playback, and
  // storing that as state would mean an effect writing state to correct itself
  // one render after the fact.
  const playing = wantsToPlay && position < last;

  const step = useCallback(
    (delta: number) => {
      setWantsToPlay(false);
      setIndex((at) => Math.min(Math.max(0, at + delta), last));
    },
    [last],
  );

  const seek = useCallback(
    (to: number) => {
      setWantsToPlay(false);
      setIndex(Math.min(Math.max(0, to), last));
    },
    [last],
  );

  const toggle = useCallback(() => {
    if (frames.length < 2) return;
    if (playing) {
      setWantsToPlay(false);
      return;
    }
    // Pressing play at the end restarts rather than doing nothing, which is
    // what every other transport control on a computer does.
    if (position >= last) setIndex(0);
    setWantsToPlay(true);
  }, [frames.length, playing, position, last]);

  // ── Playback ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!playing) return;

    const next = frames[position + 1];
    if (!next) return;

    // Never advance onto a frame whose text has not arrived: playback would
    // flash a blank page and carry on. Waiting is not a stall — the effect
    // re-runs the moment the fetch lands, and a fetch that fails is recorded
    // as unreadable, which also counts as arrived.
    if (next.sha !== WORKING_COPY_SHA && !has(next.sha)) {
      request([next.sha]);
      return;
    }

    const timer = setTimeout(() => setIndex(position + 1), STEP_MS / speed);
    return () => clearTimeout(timer);
  }, [playing, position, last, frames, speed, has, request]);

  // ── Chart geometry ────────────────────────────────────────────────────────
  const geometry = useMemo(
    () =>
      sparkline(
        frames.map((frame) => frame.words),
        CHART_WIDTH,
        CHART_HEIGHT,
        timeline.maxWords,
      ),
    [frames, timeline.maxWords],
  );

  const seekFromPointer = useCallback(
    (clientX: number) => {
      const box = chartRef.current?.getBoundingClientRect();
      if (!box || box.width === 0 || frames.length === 0) return;
      const ratio = (clientX - box.left) / box.width;
      seek(Math.round(ratio * last));
    },
    [frames.length, last, seek],
  );

  const restore = useCallback(async () => {
    if (typeof currentText !== "string") return;
    setWantsToPlay(false);
    setRestoring(true);
    try {
      await onRestore(currentText);
    } finally {
      setRestoring(false);
    }
  }, [currentText, onRestore]);

  if (frames.length === 0) {
    return (
      <p className="py-10 text-center text-[13.5px] text-[var(--fl-muted)]">
        Nothing to replay yet.
      </p>
    );
  }

  const churnRatio = current ? (current.added + current.removed) / timeline.maxChurn : 0;

  return (
    <div className="flex min-h-0 flex-col gap-3">
      {/* ── Chart ─────────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-[var(--fl-border)] bg-[var(--fl-elevated)] p-3">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="text-[12px] font-medium text-[var(--fl-text)]">
            {frames.length} {frames.length === 1 ? "revision" : "revisions"}
            {timeline.spanMs > 0 && (
              <span className="font-normal text-[var(--fl-muted)]">
                {" "}
                over {durationLabel(timeline.spanMs)}
              </span>
            )}
          </p>
          <p className="text-[11.5px] text-[var(--fl-muted)]">
            peak {timeline.maxWords.toLocaleString()} words
            {timeline.netWords !== 0 && (
              <>
                {" · "}
                <span
                  className={
                    timeline.netWords > 0 ? "text-[var(--fl-accent)]" : "text-[var(--fl-danger)]"
                  }
                >
                  {timeline.netWords > 0 ? "+" : "−"}
                  {Math.abs(timeline.netWords).toLocaleString()} net
                </span>
              </>
            )}
          </p>
        </div>

        <svg
          ref={chartRef}
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`Word count across ${frames.length} revisions, peaking at ${timeline.maxWords} words`}
          className="h-16 w-full cursor-pointer touch-none"
          onPointerDown={(event) => {
            // Optional: not every environment implements pointer capture, and
            // losing it costs only the drag-outside-the-box case.
            event.currentTarget.setPointerCapture?.(event.pointerId);
            seekFromPointer(event.clientX);
          }}
          onPointerMove={(event) => {
            // Only while dragging — `buttons` is 0 for a plain hover.
            if (event.buttons === 1) seekFromPointer(event.clientX);
          }}
        >
          {geometry.area && (
            <path d={geometry.area} fill="var(--fl-accent)" opacity="0.14" stroke="none" />
          )}
          {geometry.line && (
            <path
              d={geometry.line}
              fill="none"
              stroke="var(--fl-accent)"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round"
            />
          )}

          {/* Revisions we could not read are marked, so a flat stretch of the
              curve is never mistaken for a week when nothing was written. */}
          {frames.map((frame, at) =>
            frame.missing && geometry.points[at] ? (
              <circle
                key={frame.sha}
                cx={geometry.points[at]!.x}
                cy={CHART_HEIGHT - 3}
                r="2"
                fill="var(--fl-muted)"
                opacity="0.5"
              />
            ) : null,
          )}

          {geometry.points[position] && (
            <g>
              <line
                x1={geometry.points[position]!.x}
                y1="0"
                x2={geometry.points[position]!.x}
                y2={CHART_HEIGHT}
                stroke="var(--fl-accent)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
                opacity="0.65"
              />
              <circle
                cx={geometry.points[position]!.x}
                cy={geometry.points[position]!.y}
                r="4"
                fill="var(--fl-accent)"
                stroke="var(--fl-surface)"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          )}
        </svg>

        <input
          type="range"
          min={0}
          max={last}
          step={1}
          value={position}
          disabled={frames.length < 2}
          onChange={(event) => seek(Number(event.target.value))}
          aria-label="Revision"
          aria-valuetext={
            current
              ? `Revision ${position + 1} of ${frames.length}, ${new Date(current.date).toLocaleString()}`
              : undefined
          }
          className="mt-1 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-[var(--fl-border-strong)] accent-[var(--fl-accent)] disabled:cursor-default disabled:opacity-40"
        />
      </div>

      {/* ── Transport ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => step(-1)}
          disabled={position === 0}
          aria-label="Previous revision"
          title="Previous revision"
          className="rounded-lg border border-[var(--fl-border)] p-1.5 text-[var(--fl-text)] transition-colors hover:bg-[var(--fl-elevated)] disabled:opacity-35"
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
            <path d="M11.5 2.5v11L4 8l7.5-5.5ZM3.5 2.5h1.5v11H3.5z" />
          </svg>
        </button>

        <button
          type="button"
          onClick={toggle}
          disabled={frames.length < 2}
          aria-label={playing ? "Pause replay" : "Play replay"}
          aria-pressed={playing}
          title={playing ? "Pause" : "Play"}
          className="rounded-lg bg-[var(--fl-accent)] px-3 py-1.5 text-[var(--fl-accent-contrast)] transition-colors hover:bg-[var(--fl-accent-hover)] disabled:opacity-35"
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
            {playing ? <path d="M4 2.5h3v11H4zM9 2.5h3v11H9z" /> : <path d="M4 2.5 13 8l-9 5.5z" />}
          </svg>
        </button>

        <button
          type="button"
          onClick={() => step(1)}
          disabled={position >= last}
          aria-label="Next revision"
          title="Next revision"
          className="rounded-lg border border-[var(--fl-border)] p-1.5 text-[var(--fl-text)] transition-colors hover:bg-[var(--fl-elevated)] disabled:opacity-35"
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
            <path d="M4.5 2.5 12 8l-7.5 5.5zM11 2.5h1.5v11H11z" />
          </svg>
        </button>

        <label className="flex items-center gap-1.5 text-[12px] text-[var(--fl-muted)]">
          Speed
          <select
            value={speed}
            onChange={(event) => setSpeed(Number(event.target.value) as Speed)}
            className="rounded-md border border-[var(--fl-border)] bg-[var(--fl-surface)] px-1.5 py-1 text-[12px] text-[var(--fl-text)] outline-none focus:border-[var(--fl-accent)]"
          >
            {SPEEDS.map((value) => (
              <option key={value} value={value}>
                {value}×
              </option>
            ))}
          </select>
        </label>

        <div
          role="tablist"
          aria-label="Replay view"
          className="flex rounded-lg border border-[var(--fl-border)] p-0.5"
        >
          {(["rendered", "source"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={view === value}
              onClick={() => setView(value)}
              className={`rounded-[6px] px-2.5 py-1 text-[12px] font-medium capitalize transition-colors ${
                view === value
                  ? "bg-[var(--fl-accent)] text-[var(--fl-accent-contrast)]"
                  : "text-[var(--fl-muted)] hover:text-[var(--fl-text)]"
              }`}
            >
              {value}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => void restore()}
          disabled={
            typeof currentText !== "string" || restoring || current?.sha === WORKING_COPY_SHA
          }
          className="ml-auto shrink-0 rounded-lg bg-[var(--fl-accent)] px-3 py-1.5 text-[12.5px] font-semibold text-[var(--fl-accent-contrast)] transition-colors hover:bg-[var(--fl-accent-hover)] disabled:opacity-40"
        >
          {restoring ? "Restoring…" : "Restore this version"}
        </button>
      </div>

      {/* ── Readout ───────────────────────────────────────────────────────── */}
      {current && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-[var(--fl-elevated)] px-3 py-2 text-[12px]">
          <span className="font-medium text-[var(--fl-text)]">
            {position + 1}/{frames.length}
          </span>
          <span className="font-mono text-[11px] text-[var(--fl-muted)]">
            {current.sha === WORKING_COPY_SHA ? "working copy" : current.sha.slice(0, 7)}
          </span>
          <time
            dateTime={current.date}
            title={new Date(current.date).toLocaleString()}
            className="text-[var(--fl-muted)]"
          >
            {relativeTime(current.date)}
          </time>
          {current.authorName && (
            <span className="text-[var(--fl-muted)]">{current.authorName}</span>
          )}
          <span className="text-[var(--fl-text)]">{current.words.toLocaleString()} words</span>
          {previous && current.wordDelta !== 0 && (
            <span
              className={
                current.wordDelta > 0 ? "text-[var(--fl-accent)]" : "text-[var(--fl-danger)]"
              }
            >
              {current.wordDelta > 0 ? "+" : "−"}
              {Math.abs(current.wordDelta).toLocaleString()}
            </span>
          )}
          <span className="text-[var(--fl-muted)]">
            <span className="text-[var(--fl-accent)]">+{current.added}</span>{" "}
            <span className="text-[var(--fl-danger)]">−{current.removed}</span> lines
          </span>
          {/* A bar rather than a number: the point is which revisions were the
              busy ones, and that is a comparison, not a quantity. */}
          <span
            aria-hidden="true"
            className="h-1 w-10 overflow-hidden rounded-full bg-[var(--fl-border-strong)]"
          >
            <span
              className="block h-full rounded-full bg-[var(--fl-accent)]"
              style={{ width: `${Math.round(Math.min(1, churnRatio) * 100)}%` }}
            />
          </span>
          {current.message && (
            <span
              className="min-w-0 flex-1 truncate text-[var(--fl-muted)]"
              title={current.message}
            >
              {current.message}
            </span>
          )}
          {loading && (
            <span className="shrink-0 text-[11px] text-[var(--fl-muted)]">
              loading {loadedCount}/{shas.length}
            </span>
          )}
        </div>
      )}

      {/* ── The note, as it was ───────────────────────────────────────────── */}
      <div className="min-h-[220px] overflow-y-auto rounded-xl border border-[var(--fl-border)] p-4 max-h-[42vh]">
        {!currentLoaded && (
          <p aria-busy="true" className="py-10 text-center text-[13px] text-[var(--fl-muted)]">
            Loading this revision…
          </p>
        )}

        {currentLoaded && typeof currentText !== "string" && (
          <p className="py-10 text-center text-[13px] text-[var(--fl-danger)]">
            This revision could not be read. The replay holds the previous one in its place.
          </p>
        )}

        {currentLoaded && typeof currentText === "string" && currentText.trim() === "" && (
          <p className="py-10 text-center text-[13px] text-[var(--fl-muted)]">
            The note was empty at this point.
          </p>
        )}

        {currentLoaded && typeof currentText === "string" && currentText.trim() !== "" && (
          <>
            {view === "rendered" ? (
              <Preview markdown={currentText} resolveImageSrc={resolveImageSrc} />
            ) : (
              <SourceFrame text={currentText} previousText={baselineText} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * The revision's source with this step's new lines lit up.
 *
 * Rendered markdown is the honest answer to "what did the page look like", but
 * it hides the thing a replay is for: watching writing arrive. Highlighting the
 * lines this revision introduced, in place, in the whole document, shows where
 * in the page the growth happened — which the diff pane, showing hunks out of
 * context, cannot.
 */
function SourceFrame({ text, previousText }: { text: string; previousText: string | null }) {
  const lines = useMemo(() => {
    if (previousText === null) {
      return text.split("\n").map((content) => ({ content, added: false }));
    }
    return diffLines(previousText, text)
      .filter((line) => line.kind !== "delete")
      .map((line) => ({ content: line.text, added: line.kind === "add" }));
  }, [text, previousText]);

  return (
    <pre className="whitespace-pre-wrap break-words font-mono text-[12.5px] leading-relaxed text-[var(--fl-text)]">
      {lines.map((line, at) => (
        <span
          key={at}
          className={
            line.added
              ? "-mx-1 block rounded-sm bg-[var(--fl-accent)]/15 px-1"
              : "block px-1 opacity-70"
          }
        >
          {line.content === "" ? " " : line.content}
        </span>
      ))}
    </pre>
  );
}
