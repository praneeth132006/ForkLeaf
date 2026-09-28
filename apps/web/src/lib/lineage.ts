/**
 * A note's family: the notes it shares whole passages with.
 *
 * Links say which notes you *meant* to connect. Notes are also connected by
 * what was copied between them — a meeting note split into three, a draft
 * pasted into the final version, a paragraph quoted from last year's plan —
 * and nothing records that. The text does: two notes carrying the same run of
 * words did not write it twice.
 *
 * Passages are found with shingles — every run of eight words — so a shared
 * sentence is found wherever it moved to, and a common phrase ("in the end it
 * was") is too short to count. When both notes say when they were created,
 * which was written first is reported — the usual source, but not a certain
 * one, since text can be copied into an older note too.
 */

const SHINGLE = 8;

export interface LineageNote {
  path: string;
  title: string;
  content: string;
  /** ISO date the note was created, when it says. */
  created: string | null;
}

export interface Relative {
  path: string;
  title: string;
  /** Words of this note found in the other. */
  sharedWords: number;
  /** Share of this note's words found in the other, 0–1. */
  share: number;
  /** A couple of the shared passages, to show what is shared. */
  passages: string[];
  /** "parent": the other note was created first; "child": after; "sibling": unknown. */
  relation: "parent" | "child" | "sibling";
}

const tokens = (text: string) =>
  (text.match(/[\p{L}\p{N}']+/gu) ?? []).map((word) => word.toLowerCase());

/** Every run of `SHINGLE` words, with where it starts. */
function shingles(words: readonly string[]): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (let i = 0; i + SHINGLE <= words.length; i += 1) {
    const key = words.slice(i, i + SHINGLE).join(" ");
    const list = out.get(key) ?? [];
    list.push(i);
    out.set(key, list);
  }
  return out;
}

/** The body without front matter or code, which say nothing about lineage. */
function prose(markdown: string): string {
  return markdown.replace(/^---\n[\s\S]*?\n---\n/, "").replace(/```[\s\S]*?```/g, " ");
}

export function relativesOf(
  note: LineageNote,
  others: readonly LineageNote[],
  { limit = 8 } = {},
): Relative[] {
  const words = tokens(prose(note.content));
  if (words.length < SHINGLE) return [];
  const mine = shingles(words);

  const found: Relative[] = [];
  for (const other of others) {
    if (other.path === note.path) continue;
    const theirs = shingles(tokens(prose(other.content)));
    // Which of this note's words sit inside a shared run.
    const covered = new Uint8Array(words.length);
    for (const [key, starts] of mine) {
      if (!theirs.has(key)) continue;
      for (const start of starts) covered.fill(1, start, start + SHINGLE);
    }
    const sharedWords = covered.reduce((sum, value) => sum + value, 0);
    if (sharedWords === 0) continue;

    const passages: string[] = [];
    for (let i = 0; i < words.length && passages.length < 2;) {
      if (!covered[i]) {
        i += 1;
        continue;
      }
      let end = i;
      while (end < words.length && covered[end]) end += 1;
      const run = words.slice(i, end);
      passages.push(run.length > 24 ? `${run.slice(0, 24).join(" ")}…` : run.join(" "));
      i = end;
    }

    const relation =
      note.created && other.created
        ? other.created < note.created
          ? "parent"
          : other.created > note.created
            ? "child"
            : "sibling"
        : "sibling";
    found.push({
      path: other.path,
      title: other.title,
      sharedWords,
      share: sharedWords / words.length,
      passages,
      relation,
    });
  }
  return found.sort((a, b) => b.sharedWords - a.sharedWords).slice(0, limit);
}
