/**
 * Who wrote each line, and when.
 *
 * `git blame` for prose. The commit list tells you a note changed thirty
 * times; the diff view tells you what one of those changes did. Neither
 * answers the question you have while re-reading your own notes: *when did I
 * learn this?* A paragraph that has sat untouched since March, next to one
 * added last week, looks identical on the page — and the difference is most of
 * what you want to know about whether you still believe it.
 *
 * Computed here rather than fetched, because GitHub's REST API has no blame
 * endpoint and the app is REST throughout. The inputs are the same revision
 * texts the replay already loads and caches, so the second feature costs
 * nothing the first has not already paid for: walk the revisions oldest to
 * newest, diff each against the one before, and every line that survives keeps
 * the commit that introduced it.
 *
 * The limit worth being honest about: a line present in the oldest revision we
 * were given was not necessarily *written* there — it may be older than the
 * window of history we can see. Those lines are flagged `atOrBefore` so the UI
 * can say "at or before" rather than claiming a date it cannot support.
 */

import { diffLines } from "./diff";

/** One revision, as the caller has it. Mirrors `RevisionInput` in ./timeline. */
export interface BlameRevision {
  sha: string;
  /** ISO 8601 commit date. */
  date: string;
  /** The note at this commit, or null when it could not be read. */
  text: string | null;
  message?: string;
  authorName?: string;
  authorLogin?: string | null;
}

/** Where one line of the current text came from. */
export interface BlameLine {
  /** 1-based line number in the newest revision. */
  number: number;
  text: string;
  sha: string;
  date: string;
  message?: string;
  authorName?: string;
  authorLogin?: string | null;
  /**
   * True when this line was already present in the oldest revision available,
   * so the commit named is the earliest we can see rather than the one that
   * wrote it. The real origin may be older.
   */
  atOrBefore: boolean;
}

/**
 * A run of consecutive lines, split the way the document reads.
 *
 * Line-level blame is the correct computation and the wrong unit to show: a
 * wrapped paragraph is one thought, and attributing its four lines separately
 * turns a page of prose into a barcode. Blocks are separated by blank lines —
 * a Markdown paragraph, list, heading or fenced block — which is the unit a
 * reader would point at and ask "when did I write that?".
 */
export interface BlameBlock {
  /** 1-based line number this block starts at. */
  start: number;
  /** 1-based line number this block ends at, inclusive. */
  end: number;
  text: string;
  lines: BlameLine[];
  /** The most recent commit touching this block — when it last changed. */
  newest: BlameLine;
  /** The oldest commit still represented in it — when it first appeared. */
  oldest: BlameLine;
  /** How many distinct commits this block is made of. */
  commitCount: number;
}

export interface Blame {
  lines: BlameLine[];
  blocks: BlameBlock[];
  /** Distinct commits represented in the current text, newest first. */
  commits: { sha: string; date: string; lineCount: number }[];
  /** True when nothing could be attributed — no readable revisions at all. */
  empty: boolean;
}

const EMPTY: Blame = { lines: [], blocks: [], commits: [], empty: true };

function splitLines(text: string): string[] {
  if (text === "") return [];
  const normalized = text.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  // A trailing newline ends the last line rather than starting an empty one,
  // matching how `diffLines` counts.
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

function timeOf(iso: string): number {
  const value = new Date(iso).getTime();
  return Number.isFinite(value) ? value : 0;
}

/** The origin of one line, before it is paired back up with its text. */
interface Origin {
  sha: string;
  date: string;
  message?: string;
  authorName?: string;
  authorLogin?: string | null;
  atOrBefore: boolean;
}

/**
 * Attributes every line of the newest revision to the commit that introduced it.
 *
 * Revisions may arrive in any order — the history API returns them newest
 * first — and are sorted here, ties keeping their input order.
 *
 * Unreadable revisions are skipped rather than treated as an empty file, which
 * would attribute the entire note to whichever commit came after the gap.
 */
export function buildBlame(input: readonly BlameRevision[]): Blame {
  const readable = input
    .map((revision, position) => ({ revision, position }))
    .filter((entry) => entry.revision.text !== null)
    .sort((a, b) => timeOf(a.revision.date) - timeOf(b.revision.date) || a.position - b.position)
    .map((entry) => entry.revision);

  if (readable.length === 0) return EMPTY;

  const first = readable[0]!;
  let origins: Origin[] = splitLines(first.text!).map(() => ({
    sha: first.sha,
    date: first.date,
    message: first.message,
    authorName: first.authorName,
    authorLogin: first.authorLogin,
    // Everything in the oldest revision we can see predates our window.
    atOrBefore: true,
  }));

  let previousText = first.text!;

  for (const revision of readable.slice(1)) {
    const text = revision.text!;
    const next: Origin[] = [];
    let oldIndex = 0;

    for (const line of diffLines(previousText, text)) {
      if (line.kind === "delete") {
        // Gone from the new revision: its origin goes with it.
        oldIndex += 1;
        continue;
      }

      if (line.kind === "add") {
        next.push({
          sha: revision.sha,
          date: revision.date,
          message: revision.message,
          authorName: revision.authorName,
          authorLogin: revision.authorLogin,
          atOrBefore: false,
        });
        continue;
      }

      // Unchanged: it keeps whatever origin it already had. A line that
      // survives fifty commits still belongs to the one that wrote it, which
      // is the whole point of blame.
      next.push(
        origins[oldIndex] ?? {
          sha: revision.sha,
          date: revision.date,
          message: revision.message,
          authorName: revision.authorName,
          authorLogin: revision.authorLogin,
          atOrBefore: false,
        },
      );
      oldIndex += 1;
    }

    origins = next;
    previousText = text;
  }

  const texts = splitLines(previousText);
  const lines: BlameLine[] = texts.map((text, index) => {
    const origin = origins[index]!;
    return {
      number: index + 1,
      text,
      sha: origin.sha,
      date: origin.date,
      message: origin.message,
      authorName: origin.authorName,
      authorLogin: origin.authorLogin,
      atOrBefore: origin.atOrBefore,
    };
  });

  return {
    lines,
    blocks: toBlocks(lines),
    commits: tally(lines),
    empty: lines.length === 0,
  };
}

/**
 * Groups blamed lines into the blocks a reader sees.
 *
 * Blank lines are boundaries and belong to no block: a gap between paragraphs
 * carries no writing, and attributing it produces a stripe of colour between
 * every two paragraphs for a change nobody made.
 */
export function toBlocks(lines: readonly BlameLine[]): BlameBlock[] {
  const blocks: BlameBlock[] = [];
  let run: BlameLine[] = [];

  const flush = () => {
    if (run.length === 0) return;

    let newest = run[0]!;
    let oldest = run[0]!;
    for (const line of run) {
      if (timeOf(line.date) > timeOf(newest.date)) newest = line;
      if (timeOf(line.date) < timeOf(oldest.date)) oldest = line;
    }

    blocks.push({
      start: run[0]!.number,
      end: run[run.length - 1]!.number,
      text: run.map((line) => line.text).join("\n"),
      lines: run,
      newest,
      oldest,
      commitCount: new Set(run.map((line) => line.sha)).size,
    });
    run = [];
  };

  for (const line of lines) {
    if (line.text.trim() === "") flush();
    else run.push(line);
  }
  flush();

  return blocks;
}

/** Distinct commits in the current text, newest first, with their line counts. */
function tally(lines: readonly BlameLine[]): { sha: string; date: string; lineCount: number }[] {
  const counts = new Map<string, { sha: string; date: string; lineCount: number }>();

  for (const line of lines) {
    const existing = counts.get(line.sha);
    if (existing) existing.lineCount += 1;
    else counts.set(line.sha, { sha: line.sha, date: line.date, lineCount: 1 });
  }

  return [...counts.values()].sort((a, b) => timeOf(b.date) - timeOf(a.date));
}

/**
 * How old a line is, as a fraction from 0 (oldest on the page) to 1 (newest).
 *
 * For shading the gutter: the useful comparison in a blamed document is
 * relative, not absolute. A note written across one afternoon and a note
 * written across four years should both use the whole range, because in each
 * the question is the same — which parts here are the old ones?
 */
export function ageRatio(date: string, oldest: string, newest: string): number {
  const from = timeOf(oldest);
  const to = timeOf(newest);
  // Everything written at once is uniformly new rather than uniformly old:
  // a flat document should not render as though all of it were ancient.
  if (to <= from) return 1;
  return Math.min(1, Math.max(0, (timeOf(date) - from) / (to - from)));
}

/**
 * What a paragraph said before the change that produced it.
 *
 * Blame answers "when did I write this?". The more interesting question, and
 * the one people actually ask of their own notes, is the one after it: what
 * did it say before? A paragraph you rewrote in March is a paragraph you
 * changed your mind about, and seeing what you changed your mind *from* is
 * usually the most interesting thing on the page.
 *
 * Null when this block was added rather than rewritten. That is a real
 * distinction and worth keeping: "you wrote this in March" and "in March you
 * replaced something else with this" are different facts about the same
 * paragraph, and inventing a previous wording for the first would be a lie.
 */
export interface PriorWording {
  text: string;
  /** The revision it said that in. */
  sha: string;
  date: string;
}

export function priorWording(
  input: readonly BlameRevision[],
  currentText: string,
  block: Pick<BlameBlock, "start" | "end" | "newest">,
): PriorWording | null {
  const revisions = [...input]
    .filter((revision) => revision.text !== null)
    .sort((a, b) => timeOf(a.date) - timeOf(b.date));

  const changed = revisions.findIndex((revision) => revision.sha === block.newest.sha);
  // Either the commit that wrote this block is outside the window of history
  // we can see, or it is the oldest thing in it — in both cases there is no
  // "before" to show, and guessing at one is exactly the wrong move.
  if (changed <= 0) return null;

  const previous = revisions[changed - 1];
  if (!previous?.text) return null;

  const replaced = replacedWithin(previous.text, currentText, block);
  return replaced === null ? null : { text: replaced, sha: previous.sha, date: previous.date };
}

/**
 * The lines the block replaced, from a diff of the two revisions.
 *
 * A deletion belongs to the block when it sits inside the block's span in the
 * *new* text — tracked by the last new line number the walk has passed, since
 * a deleted line has no new number of its own. Anything deleted elsewhere in
 * the note is somebody else's paragraph and none of this block's business.
 */
export function replacedWithin(
  previousText: string,
  currentText: string,
  block: { start: number; end: number },
): string | null {
  const removed: string[] = [];
  // Deletions before the first new line still belong to a block that starts at
  // line 1, so the walk begins just above it rather than at it.
  let at = 0;

  for (const line of diffLines(previousText, currentText)) {
    if (line.newNumber !== null) {
      at = line.newNumber;
      continue;
    }

    // A deletion sitting at the top edge of the block counts: the lines it
    // replaced were above the first line the block now occupies.
    if (at >= block.start - 1 && at <= block.end) removed.push(line.text);
  }

  const text = removed.join("\n").trim();
  return text === "" ? null : text;
}
