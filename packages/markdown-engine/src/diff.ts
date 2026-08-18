/**
 * Line diff between two revisions of a note.
 *
 * Version history and conflict resolution both had the same weakness: they
 * showed two blobs of text side by side and left the reader to spot what moved.
 * For anything longer than a screen that is not a comparison, it is a spot-the-
 * difference puzzle. This produces the change itself.
 *
 * Myers' O(ND) algorithm, which is what git uses. The cost is proportional to
 * the size of the *difference* rather than the size of the files, so the common
 * case — a couple of edited lines in a long note — is close to linear.
 */

export type ChangeKind = "context" | "add" | "delete";

export interface DiffLine {
  kind: ChangeKind;
  text: string;
  /** 1-based line number in the old revision; null for added lines. */
  oldNumber: number | null;
  /** 1-based line number in the new revision; null for deleted lines. */
  newNumber: number | null;
}

export interface DiffHunk {
  oldStart: number;
  newStart: number;
  lines: DiffLine[];
}

export interface DiffStats {
  added: number;
  removed: number;
  /** True when the two revisions are identical. */
  identical: boolean;
}

/**
 * Beyond this many lines a side, fall back to a whole-file replacement rather
 * than diffing. Myers is fast, but a pathological pair of very large files can
 * still cost O(n²), and blocking the UI thread is worse than a coarse answer.
 */
const MAX_DIFF_LINES = 20_000;

function splitLines(text: string): string[] {
  if (text === "") return [];
  // A trailing newline denotes the end of the last line, not an empty one.
  const normalized = text.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/**
 * The shortest edit script between two line arrays, as Myers describes it.
 *
 * Returns the trace of furthest-reaching paths, which `backtrack` walks in
 * reverse to recover the actual operations.
 */
function shortestEdit(a: string[], b: string[]): Map<number, number>[] {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  const v = new Map<number, number>([[1, 0]]);
  const trace: Map<number, number>[] = [];

  for (let d = 0; d <= max; d += 1) {
    trace.push(new Map(v));

    for (let k = -d; k <= d; k += 2) {
      // Move down when we are on the lower boundary, or when the path coming
      // from below has reached further than the one coming from the left.
      const down = k === -d || (k !== d && (v.get(k - 1) ?? 0) < (v.get(k + 1) ?? 0));
      let x = down ? (v.get(k + 1) ?? 0) : (v.get(k - 1) ?? 0) + 1;
      let y = x - k;

      // Follow the diagonal for as long as the lines match — this is the part
      // that makes the cost track the difference rather than the file size.
      while (x < n && y < m && a[x] === b[y]) {
        x += 1;
        y += 1;
      }

      v.set(k, x);

      if (x >= n && y >= m) return trace;
    }
  }

  return trace;
}

/** Walks the trace backwards, emitting one operation per step. */
function backtrack(a: string[], b: string[], trace: Map<number, number>[]): DiffLine[] {
  const out: DiffLine[] = [];
  let x = a.length;
  let y = b.length;

  for (let d = trace.length - 1; d >= 0; d -= 1) {
    const v = trace[d]!;
    const k = x - y;

    const down = k === -d || (k !== d && (v.get(k - 1) ?? 0) < (v.get(k + 1) ?? 0));
    const prevK = down ? k + 1 : k - 1;
    const prevX = v.get(prevK) ?? 0;
    const prevY = prevX - prevK;

    while (x > prevX && y > prevY) {
      x -= 1;
      y -= 1;
      out.push({ kind: "context", text: a[x]!, oldNumber: x + 1, newNumber: y + 1 });
    }

    if (d === 0) break;

    if (down) {
      y -= 1;
      out.push({ kind: "add", text: b[y]!, oldNumber: null, newNumber: y + 1 });
    } else {
      x -= 1;
      out.push({ kind: "delete", text: a[x]!, oldNumber: x + 1, newNumber: null });
    }
  }

  return out.reverse();
}

/** Every line of both revisions, tagged with what happened to it. */
export function diffLines(oldText: string, newText: string): DiffLine[] {
  const a = splitLines(oldText);
  const b = splitLines(newText);

  if (a.length > MAX_DIFF_LINES || b.length > MAX_DIFF_LINES) {
    return [
      ...a.map((text, i) => ({
        kind: "delete" as const,
        text,
        oldNumber: i + 1,
        newNumber: null,
      })),
      ...b.map((text, i) => ({ kind: "add" as const, text, oldNumber: null, newNumber: i + 1 })),
    ];
  }

  return backtrack(a, b, shortestEdit(a, b));
}

export function diffStats(lines: DiffLine[]): DiffStats {
  let added = 0;
  let removed = 0;

  for (const line of lines) {
    if (line.kind === "add") added += 1;
    else if (line.kind === "delete") removed += 1;
  }

  return { added, removed, identical: added === 0 && removed === 0 };
}

/**
 * Groups changes into hunks with surrounding context.
 *
 * Showing an entire note to reveal a two-line change buries it. Unchanged runs
 * longer than `context * 2` are collapsed, which is the same reason `git diff`
 * does it.
 */
export function toHunks(lines: DiffLine[], context = 3): DiffHunk[] {
  const interesting = lines
    .map((line, index) => (line.kind === "context" ? -1 : index))
    .filter((index) => index >= 0);

  if (interesting.length === 0) return [];

  const hunks: DiffHunk[] = [];
  let start = Math.max(0, interesting[0]! - context);
  let end = Math.min(lines.length - 1, interesting[0]! + context);

  for (const index of interesting.slice(1)) {
    if (index - context <= end + 1) {
      end = Math.min(lines.length - 1, index + context);
      continue;
    }

    hunks.push(makeHunk(lines.slice(start, end + 1)));
    start = Math.max(0, index - context);
    end = Math.min(lines.length - 1, index + context);
  }

  hunks.push(makeHunk(lines.slice(start, end + 1)));
  return hunks;
}

function makeHunk(lines: DiffLine[]): DiffHunk {
  return {
    oldStart: lines.find((line) => line.oldNumber !== null)?.oldNumber ?? 0,
    newStart: lines.find((line) => line.newNumber !== null)?.newNumber ?? 0,
    lines,
  };
}

export interface WordSpan {
  text: string;
  changed: boolean;
}

/**
 * Word-level diff within a single line.
 *
 * A line marked "changed" where one word moved still reads as two unrelated
 * lines. Highlighting the words that actually differ is what makes a one-token
 * edit obvious at a glance.
 */
export function diffWords(oldLine: string, newLine: string): [WordSpan[], WordSpan[]] {
  const a = oldLine.split(/(\s+)/).filter((token) => token !== "");
  const b = newLine.split(/(\s+)/).filter((token) => token !== "");

  const ops = backtrack(a, b, shortestEdit(a, b));

  const before: WordSpan[] = [];
  const after: WordSpan[] = [];

  for (const op of ops) {
    if (op.kind === "context") {
      before.push({ text: op.text, changed: false });
      after.push({ text: op.text, changed: false });
    } else if (op.kind === "delete") {
      before.push({ text: op.text, changed: true });
    } else {
      after.push({ text: op.text, changed: true });
    }
  }

  return [merge(before), merge(after)];
}

/** Collapses runs of same-state spans so the DOM stays small. */
function merge(spans: WordSpan[]): WordSpan[] {
  const out: WordSpan[] = [];

  for (const span of spans) {
    const last = out[out.length - 1];
    if (last && last.changed === span.changed) last.text += span.text;
    else out.push({ ...span });
  }

  return out;
}
