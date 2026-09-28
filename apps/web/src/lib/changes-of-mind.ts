import { diffLines, diffWords } from "@forkleaf/markdown-engine";

/**
 * Noticing when an edit changes what a note *says*, not just how.
 *
 * Most edits are wording: a typo fixed, a sentence tightened, a paragraph
 * added. A few are reversals — "Use Postgres" becomes "Use SQLite", "we
 * should ship Friday" becomes "we should not ship Friday" — and those are the
 * edits whose reason is worth more than the edit itself, and the one thing no
 * version history keeps. Git knows the line changed; it does not know why you
 * changed your mind.
 *
 * A line counts as reversed when it was replaced by a line that keeps most of
 * its words but swaps a few meaningful ones: a negation added or removed, a
 * yes for a no, one name for another. A typo fix, an added clause, and a
 * rewrite from scratch are not reversals, and are left alone.
 */

export interface Reversal {
  before: string;
  after: string;
  /** The words that went, and the words that came, for the one-line summary. */
  from: string;
  to: string;
}

const NEGATIONS = new Set([
  "not",
  "no",
  "never",
  "don't",
  "doesn't",
  "didn't",
  "won't",
  "can't",
  "cannot",
  "shouldn't",
  "isn't",
  "aren't",
  "wasn't",
  "without",
]);

const OPPOSITES: [string, string][] = [
  ["yes", "no"],
  ["true", "false"],
  ["always", "never"],
  ["should", "shouldn't"],
  ["will", "won't"],
  ["can", "can't"],
  ["do", "don't"],
  ["is", "isn't"],
  ["agree", "disagree"],
  ["accept", "reject"],
  ["approved", "rejected"],
  ["include", "exclude"],
  ["more", "less"],
  ["increase", "decrease"],
  ["before", "after"],
  ["keep", "drop"],
  ["use", "avoid"],
];

const word = (text: string) =>
  text.toLowerCase().replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, "");

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const saved = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = saved;
    }
  }
  return row[b.length]!;
}

const isProse = (line: string) => {
  const trimmed = line.trim();
  return (
    trimmed.length > 0 &&
    !/^(```|~~~|\||#|---|<!--)/.test(trimmed) &&
    trimmed.split(/\s+/).length >= 3
  );
};

/** Whether replacing `before` with `after` reverses what the line says. */
export function reversalIn(before: string, after: string): Reversal | null {
  if (!isProse(before) || !isProse(after)) return null;
  const [old, next] = diffWords(before, after);
  // The diff gives runs of text; the question is about words.
  const words = (spans: typeof old, changed: boolean) =>
    spans
      .filter((span) => span.changed === changed)
      .flatMap((span) => span.text.split(/\s+/))
      .map(word)
      .filter(Boolean);
  let gone = words(old, true);
  let came = words(next, true);
  // A word on both sides only moved or lost a comma.
  const both = new Set(gone.filter((each) => came.includes(each)));
  gone = gone.filter((each) => !both.has(each));
  came = came.filter((each) => !both.has(each));
  const kept = words(old, false).length + both.size;
  const total = Math.max(words(old, false).length + words(old, true).length, 1);

  if (gone.length + came.length === 0) return null;
  // A rewrite from scratch is a new sentence, not a changed mind about the old one.
  if (kept / total < 0.5 || gone.length > 4 || came.length > 4) return null;

  const summary = {
    before: before.trim(),
    after: after.trim(),
    from: gone.join(" "),
    to: came.join(" "),
  };

  // A negation put in or taken out.
  if ([...gone, ...came].some((token) => NEGATIONS.has(token))) return summary;
  // One word for its opposite.
  for (const [a, b] of OPPOSITES) {
    if ((gone.includes(a) && came.includes(b)) || (gone.includes(b) && came.includes(a))) {
      return summary;
    }
  }
  // Only additions — a clause added, a qualifier — is elaboration.
  if (gone.length === 0 || came.length === 0) return null;
  // One thing named for another — "Postgres" for "SQLite", "Friday" for
  // "Monday", "3" for "5" — rather than a typo fixed.
  const typo = gone.length === came.length && gone.every((g, i) => editDistance(g, came[i]!) <= 2);
  return typo ? null : summary;
}

/** Every reversal between one version of a note and the next. */
export function reversals(before: string, after: string): Reversal[] {
  const lines = diffLines(before, after);
  const found: Reversal[] = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i]!.kind !== "delete") {
      i += 1;
      continue;
    }
    const deleted: string[] = [];
    while (i < lines.length && lines[i]!.kind === "delete") deleted.push(lines[i++]!.text);
    const added: string[] = [];
    while (i < lines.length && lines[i]!.kind === "add") added.push(lines[i++]!.text);
    // Line for line within a replaced block: the usual shape of an edit.
    for (let k = 0; k < Math.min(deleted.length, added.length); k += 1) {
      const reversal = reversalIn(deleted[k]!, added[k]!);
      if (reversal) found.push(reversal);
    }
  }
  return found;
}

export const CHANGES_HEADING = "## Why I changed my mind";

/**
 * The note with a reason recorded under its "Why I changed my mind" section —
 * made at the end when there is none. One line each: the date, what it was,
 * what it is, and why. Ordinary markdown, readable anywhere.
 */
export function withReason(
  content: string,
  reversal: Reversal,
  reason: string,
  day: string,
): string {
  const clip = (text: string) => (text.length > 80 ? `${text.slice(0, 79)}…` : text);
  const line = `- ${day}: “${clip(reversal.before)}” → “${clip(reversal.after)}” — ${reason.trim()}`;
  const lines = content.replace(/\s*$/, "").split("\n");
  const start = lines.findIndex((each) => each.trim() === CHANGES_HEADING);
  if (start === -1) return `${lines.join("\n")}\n\n${CHANGES_HEADING}\n\n${line}\n`;
  let end = lines.length;
  for (let k = start + 1; k < lines.length; k += 1) {
    if (/^#{1,2}\s/.test(lines[k]!)) {
      end = k;
      break;
    }
  }
  let insert = end;
  while (insert > start + 1 && !lines[insert - 1]!.trim()) insert -= 1;
  lines.splice(insert, 0, line);
  return `${lines.join("\n")}\n`;
}
