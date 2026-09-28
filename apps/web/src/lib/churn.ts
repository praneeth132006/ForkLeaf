/**
 * How many times each paragraph of a note has been rewritten.
 *
 * Blame says when a paragraph last changed. This says how often it has — and
 * that is a different, more useful fact about your own thinking: a paragraph
 * rewritten nine times is one you have never been sure of; one untouched
 * since it was written is settled. Shaded in the margin, the note shows where
 * the unresolved parts are.
 *
 * A paragraph is followed back through the revisions by its words: in each
 * older version, the paragraph most like it (sharing at least a third of its
 * words) is taken to be the same paragraph as it was then. Every step where
 * that wording differs is one rewrite. When no paragraph is like it, it had
 * not been written yet.
 */

const words = (text: string) =>
  new Set((text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((word) => word.length > 1));

function likeness(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return shared / (a.size + b.size - shared);
}

/** Paragraphs: runs of lines separated by blank lines. */
export function paragraphsOf(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);
}

const SAME_PARAGRAPH = 0.34;

/**
 * Rewrites of `paragraph` across `revisions`, newest first — the order the
 * history API returns. `null` texts (not read yet) are skipped.
 */
export function rewritesOf(paragraph: string, revisions: readonly (string | null)[]): number {
  let current = paragraph.trim();
  let currentWords = words(current);
  let count = 0;
  for (const text of revisions) {
    if (text === null) continue;
    let best: { text: string; score: number } | null = null;
    for (const candidate of paragraphsOf(text)) {
      if (candidate === current) {
        best = { text: candidate, score: 1 };
        break;
      }
      const score = likeness(currentWords, words(candidate));
      if (score >= SAME_PARAGRAPH && (!best || score > best.score))
        best = { text: candidate, score };
    }
    if (!best) break;
    if (best.text !== current) {
      count += 1;
      current = best.text;
      currentWords = words(current);
    }
  }
  return count;
}

/** Rewrites for each paragraph of the newest text, and the most any had. */
export function churnOf(revisions: readonly (string | null)[]): {
  paragraphs: { text: string; rewrites: number }[];
  most: number;
} {
  const newest = revisions.find((text) => text !== null);
  if (!newest) return { paragraphs: [], most: 0 };
  const older = revisions.slice(revisions.indexOf(newest) + 1);
  const paragraphs = paragraphsOf(newest).map((text) => ({
    text,
    rewrites: rewritesOf(text, older),
  }));
  return { paragraphs, most: Math.max(0, ...paragraphs.map((each) => each.rewrites)) };
}
