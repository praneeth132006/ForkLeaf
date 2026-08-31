import { normalizeForMatch } from "@forkleaf/pdf";

/**
 * What changed between two versions of a document.
 *
 * The file sits in a repository, so every version of it is kept — which no
 * other reading app can say. What follows from that is the sentence none of
 * them can print: *the page you quoted is one of the ones that changed*. Every
 * other tool stores a page number, cannot see the old file, and so cannot
 * notice; here the old file is one request away.
 *
 * Compared as text, page by page. Not as bytes: a PDF re-exported from the
 * same source differs in every byte — timestamps, object order, a new
 * producer string — while saying exactly the same thing, and a diff that
 * reported "all 400 pages changed" every time somebody re-saved a paper would
 * be a diff nobody reads twice.
 *
 * Normalised the same way citations and search are, so hyphenation across a
 * line break, a ligature and a run of spaces are not treated as edits. What is
 * left is a change in the words.
 */

export type PageChangeKind = "changed" | "added" | "removed";

export interface PageChange {
  page: number;
  kind: PageChangeKind;
}

export interface VersionComparison {
  changes: PageChange[];
  /** Pages present in both versions saying the same thing. */
  unchanged: number;
  /** How many pages the newer version has. */
  pages: number;
}

export interface PageText {
  page: number;
  text: string;
}

export function comparePages(
  before: readonly PageText[],
  after: readonly PageText[],
): VersionComparison {
  const older = new Map(before.map((page) => [page.page, normalise(page.text)]));
  const newer = new Map(after.map((page) => [page.page, normalise(page.text)]));

  const changes: PageChange[] = [];
  let unchanged = 0;

  for (const [page, text] of newer) {
    const was = older.get(page);
    if (was === undefined) changes.push({ page, kind: "added" });
    else if (was !== text) changes.push({ page, kind: "changed" });
    else unchanged += 1;
  }

  // A shorter document has lost pages off the end, which is a change worth
  // naming: a citation pointing at one of them is pointing at nothing.
  for (const page of older.keys()) {
    if (!newer.has(page)) changes.push({ page, kind: "removed" });
  }

  changes.sort((a, b) => a.page - b.page);
  return { changes, unchanged, pages: after.length };
}

/**
 * The pages somebody has quoted or marked that are among the changes.
 *
 * The sentence this whole comparison exists to be able to say. A page that
 * changed under a citation is not necessarily a citation that has broken —
 * the words may still be there, further down — which is what the citation
 * check answers. This says where to look.
 */
export function affected(comparison: VersionComparison, cited: readonly number[]): PageChange[] {
  const wanted = new Set(cited);
  return comparison.changes.filter((change) => wanted.has(change.page));
}

/** "pages 4, 7 and 12" — the way somebody would say it out loud. */
export function listPages(pages: readonly number[]): string {
  if (pages.length === 0) return "";
  if (pages.length === 1) return `page ${pages[0]}`;

  const all = [...pages];
  const last = all.pop();
  return `pages ${all.join(", ")} and ${last}`;
}

function normalise(text: string): string {
  return normalizeForMatch(text).text.trim();
}
