/**
 * The shape of a note over time.
 *
 * Version history answers "what changed in this commit?". It does not answer
 * "how did this page come to exist?" — whether it landed fully formed, grew a
 * paragraph a week for two months, or was gutted and rewritten in March. That
 * second question needs every revision measured on the same axes and laid out
 * against the clock, which is what this builds: one row per revision, carrying
 * its size, its churn against the revision before it, and where it sits in the
 * span of the note's life.
 *
 * Deliberately free of any rendering: the chart geometry lives here as plain
 * numbers so it can be tested without a browser, and the panel is left to turn
 * those numbers into pixels.
 */

import { countWords } from "./analyze";
import { diffLines, diffStats } from "./diff";

/** One revision, as the caller has it: a commit plus the text at that commit. */
export interface RevisionInput {
  sha: string;
  /** ISO 8601 commit date. */
  date: string;
  /**
   * The note as of this commit, or null when it could not be read — a fetch
   * that failed, or a revision not loaded yet.
   */
  text: string | null;
  /** Commit subject, carried through untouched for the panel to display. */
  message?: string;
  authorName?: string;
}

export interface TimelineRevision {
  sha: string;
  date: string;
  message?: string;
  authorName?: string;
  /** 0-based position, oldest first. */
  index: number;
  words: number;
  characters: number;
  lines: number;
  /** Lines added relative to the previous revision. */
  added: number;
  /** Lines removed relative to the previous revision. */
  removed: number;
  /** Net change in words relative to the previous revision. */
  wordDelta: number;
  /**
   * True when this revision's text was not available.
   *
   * Its measurements are carried forward from the last revision that was
   * readable, so the curve holds a flat line across the gap instead of
   * plunging to zero and inventing a rewrite that never happened. The flag is
   * what lets the panel say so rather than quietly showing a lie.
   */
  missing: boolean;
}

export interface Timeline {
  /** Oldest first — the order a replay plays in. */
  revisions: TimelineRevision[];
  /** Largest word count reached, for scaling a chart. Never below 1. */
  maxWords: number;
  /** Largest single-step churn (added + removed). Never below 1. */
  maxChurn: number;
  /** Milliseconds between the first and last revision; 0 for fewer than two. */
  spanMs: number;
  /** Words in the newest revision less words in the oldest. */
  netWords: number;
  /** How many revisions could not be read. */
  missingCount: number;
}

const EMPTY: Timeline = {
  revisions: [],
  maxWords: 1,
  maxChurn: 1,
  spanMs: 0,
  netWords: 0,
  missingCount: 0,
};

function lineCount(text: string): number {
  if (text === "") return 0;
  const normalized = text.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  // A trailing newline ends the last line rather than starting an empty one,
  // which is how `diffLines` counts too — the two must agree or the row would
  // report a line count that its own added/removed figures contradict.
  if (lines[lines.length - 1] === "") lines.pop();
  return lines.length;
}

function timeOf(iso: string): number {
  const value = new Date(iso).getTime();
  // An unparseable date must not poison the sort. Treating it as 0 keeps such
  // a revision at the start rather than throwing the whole timeline away.
  return Number.isFinite(value) ? value : 0;
}

/**
 * Measures a note across its revisions.
 *
 * Input may arrive in any order — GitHub lists commits newest first, which is
 * the opposite of the order a replay wants — so it is sorted by date here.
 * Revisions sharing a timestamp keep the order they were given in, which is
 * the only tie-break available when two commits claim the same second.
 */
export function buildTimeline(input: readonly RevisionInput[]): Timeline {
  if (input.length === 0) return EMPTY;

  const ordered = input
    .map((revision, position) => ({ revision, position }))
    .sort((a, b) => timeOf(a.revision.date) - timeOf(b.revision.date) || a.position - b.position)
    .map((entry) => entry.revision);

  const revisions: TimelineRevision[] = [];
  let maxWords = 0;
  let maxChurn = 0;
  let missingCount = 0;

  // The last text actually read, which is what a missing revision is measured
  // against — and what the one after it is diffed against, so a gap costs the
  // curve nothing but its own step.
  let previousText: string | null = null;
  let previous: TimelineRevision | null = null;

  for (const [index, entry] of ordered.entries()) {
    const text = entry.text;

    if (text === null) {
      missingCount += 1;
      revisions.push({
        sha: entry.sha,
        date: entry.date,
        message: entry.message,
        authorName: entry.authorName,
        index,
        words: previous?.words ?? 0,
        characters: previous?.characters ?? 0,
        lines: previous?.lines ?? 0,
        added: 0,
        removed: 0,
        wordDelta: 0,
        missing: true,
      });
      // `previous` intentionally stays where it was: the next readable
      // revision should be compared with the last readable one, not with a row
      // whose numbers were copied from somewhere else.
      continue;
    }

    const words = countWords(text);
    const { added, removed } =
      previousText === null
        ? // The first readable revision has nothing before it. Counting its
          // whole body as additions is what `git log --stat` shows for a file's
          // first commit, and it makes the opening spike of a replay honest.
          { added: lineCount(text), removed: 0 }
        : diffStats(diffLines(previousText, text));

    const row: TimelineRevision = {
      sha: entry.sha,
      date: entry.date,
      message: entry.message,
      authorName: entry.authorName,
      index,
      words,
      characters: text.length,
      lines: lineCount(text),
      added,
      removed,
      wordDelta: previous === null ? words : words - previous.words,
      missing: false,
    };

    revisions.push(row);
    maxWords = Math.max(maxWords, words);
    maxChurn = Math.max(maxChurn, added + removed);
    previousText = text;
    previous = row;
  }

  const first = revisions[0];
  const last = revisions[revisions.length - 1];

  return {
    revisions,
    maxWords: Math.max(1, maxWords),
    maxChurn: Math.max(1, maxChurn),
    spanMs: first && last ? Math.max(0, timeOf(last.date) - timeOf(first.date)) : 0,
    netWords: first && last ? last.words - first.words : 0,
    missingCount,
  };
}

export interface SparklineGeometry {
  /** `d` for a stroked path along the top of the series. */
  line: string;
  /** `d` for the same series closed to the baseline, to fill underneath. */
  area: string;
  /** Where each revision sits, so the panel can put a marker on it. */
  points: { x: number; y: number }[];
}

/**
 * Turns a series into SVG path geometry.
 *
 * Points are spread evenly rather than by timestamp. A note written in a burst
 * three years ago and touched once last week would otherwise pile thirty
 * revisions into two pixels and leave the rest of the chart empty — the
 * scrubber steps commit by commit, so the chart is drawn commit by commit to
 * match it.
 */
export function sparkline(
  values: readonly number[],
  width: number,
  height: number,
  max?: number,
): SparklineGeometry {
  const points: { x: number; y: number }[] = [];
  if (values.length === 0 || width <= 0 || height <= 0) {
    return { line: "", area: "", points };
  }

  const ceiling = Math.max(1, max ?? Math.max(...values));
  const step = values.length === 1 ? 0 : width / (values.length - 1);

  for (const [index, value] of values.entries()) {
    // A single revision has nowhere to travel, so it is centred instead of
    // pinned to the left edge where it would read as the start of a line.
    const x = values.length === 1 ? width / 2 : index * step;
    const ratio = Math.min(1, Math.max(0, value / ceiling));
    points.push({ x: round(x), y: round(height - ratio * height) });
  }

  const line = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`)
    .join(" ");
  const firstPoint = points[0]!;
  const lastPoint = points[points.length - 1]!;
  const area = `${line} L${lastPoint.x} ${round(height)} L${firstPoint.x} ${round(height)} Z`;

  return { line, area, points };
}

function round(value: number): number {
  // Two decimals is finer than any display can resolve and keeps the `d`
  // attribute from filling with floating-point noise.
  return Math.round(value * 100) / 100;
}
