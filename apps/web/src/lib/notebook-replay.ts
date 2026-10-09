import type { TreeNode } from "@forkleaf/types";

/**
 * The whole notebook, replayed.
 *
 * The time machine shows one day. This shows the days in between: a row of
 * snapshots of the repository's tree, taken at even steps back from today, and
 * what changed from each to the next — which notes appeared, which grew, which
 * shrank and which went away. Scrubbing through them is watching the notebook
 * get written.
 *
 * Built from trees alone, never from file contents. A tree lists every file
 * with its size in one request, so a year of monthly snapshots is twelve reads
 * however many notes there are; reading the notes themselves at every step
 * would be thousands, and size is what "grew" means anyway.
 */

/** One note, at one moment. */
export interface ReplayNote {
  path: string;
  /** Bytes, as the repository stores it. */
  size: number;
}

/** What happened to a note between one snapshot and the next. */
export type ReplayChange = "new" | "grew" | "shrank" | "same";

export interface ReplayFrame {
  /** `YYYY-MM-DD`: the day this snapshot shows the end of. */
  date: string;
  /** The commit it was read at; null before the first one. */
  sha: string | null;
  notes: ReplayNote[];
}

export interface ReplayDiff {
  /** Every note in the frame, with what happened to it since the one before. */
  notes: (ReplayNote & { change: ReplayChange })[];
  /** Notes in the frame before that are not in this one. */
  removed: string[];
  totalBytes: number;
}

/** How far back a replay goes, and how often it looks. */
export interface ReplaySpan {
  id: string;
  label: string;
  steps: number;
  /** Days between one snapshot and the next. */
  every: number;
}

export const REPLAY_SPANS: readonly ReplaySpan[] = [
  { id: "month", label: "Last month, day by day", steps: 15, every: 2 },
  { id: "quarter", label: "Last 3 months, week by week", steps: 13, every: 7 },
  { id: "year", label: "Last year, month by month", steps: 13, every: 30 },
  { id: "years", label: "Last 3 years, by quarter", steps: 13, every: 91 },
];

/** Notes, as the replay counts them: markdown, outside hidden folders. */
const isNote = (path: string) =>
  /\.mdx?$/i.test(path) && !path.split("/").some((part) => part.startsWith("."));

/**
 * The days to take snapshots on, oldest first, ending today.
 *
 * Counted back from today rather than forward from a start date, so the last
 * frame is always the notebook as it is now — which is where anybody watching
 * expects a replay to end.
 */
export function replayDates(today: string, span: ReplaySpan): string[] {
  const end = Date.parse(`${today}T00:00:00Z`);
  const day = 24 * 60 * 60 * 1000;
  const dates: string[] = [];
  for (let step = span.steps - 1; step >= 0; step -= 1) {
    dates.push(new Date(end - step * span.every * day).toISOString().slice(0, 10));
  }
  return dates;
}

/** The notes in a tree, sorted by path. */
export function notesInTree(tree: readonly TreeNode[]): ReplayNote[] {
  const notes: ReplayNote[] = [];
  const walk = (nodes: readonly TreeNode[]) => {
    for (const node of nodes) {
      if (node.kind === "file" && isNote(node.path)) {
        notes.push({ path: node.path, size: node.size ?? 0 });
      }
      walk(node.children ?? []);
    }
  };
  walk(tree);
  return notes.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * What changed between two snapshots.
 *
 * The first frame has nothing before it, so everything in it is "same" rather
 * than "new": a replay that opens with the whole notebook flashing as freshly
 * written says something untrue about all of it.
 */
export function diffFrames(previous: ReplayFrame | null, current: ReplayFrame): ReplayDiff {
  const before = new Map((previous?.notes ?? []).map((note) => [note.path, note.size]));
  const now = new Set(current.notes.map((note) => note.path));

  const notes = current.notes.map((note) => {
    const was = before.get(note.path);
    let change: ReplayChange = "same";
    if (previous && was === undefined) change = "new";
    else if (was !== undefined && note.size > was) change = "grew";
    else if (was !== undefined && note.size < was) change = "shrank";
    return { ...note, change };
  });

  return {
    notes,
    removed: [...before.keys()].filter((path) => !now.has(path)).sort(),
    totalBytes: current.notes.reduce((sum, note) => sum + note.size, 0),
  };
}

/**
 * The order notes are drawn in: by the frame they first appear in, then by
 * path. Kept the same across every frame, so a note stays where it is while the
 * notebook grows around it, and new notes arrive at the end like new writing.
 */
export function replayOrder(frames: readonly ReplayFrame[]): string[] {
  const order: string[] = [];
  const seen = new Set<string>();
  for (const frame of frames) {
    for (const note of frame.notes) {
      if (seen.has(note.path)) continue;
      seen.add(note.path);
      order.push(note.path);
    }
  }
  return order;
}

/** A dot's diameter in pixels: area follows size, within limits a grid can hold. */
export function dotSize(bytes: number): number {
  return Math.round(Math.min(34, Math.max(6, Math.sqrt(bytes) / 2.2)));
}
