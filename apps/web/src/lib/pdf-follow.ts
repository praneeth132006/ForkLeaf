import type { PdfMention } from "@/lib/pdf-mentions";

/**
 * Keeping a note and the paper it is about on the same page.
 *
 * This is what people open two windows to fake: write a paragraph about page
 * twelve, and scroll the document to page twelve by hand, over and over, all
 * afternoon. The notebook already knows the mapping — every citation in the
 * note records the page it came from — so nothing has to be inferred and no
 * scroll positions have to be guessed at.
 *
 * Both directions are the same idea from either end: the nearest citation at
 * or above the place you are is the one you are working from. Above every
 * citation there is nothing to follow, and saying so is better than jumping to
 * the first page of a document nobody has cited yet.
 *
 * Pure, and deliberately unaware of scroll containers, editors and readers.
 * What "where you are" means differs by view; what to do about it does not.
 */

/** Citations in one note, ordered by where they sit in it. */
export function anchorsFor(mentions: readonly PdfMention[], notePath: string) {
  return mentions
    .filter((mention) => mention.notePath === notePath && mention.page != null)
    .map((mention) => ({ line: mention.line, page: mention.page as number }))
    .sort((a, b) => a.line - b.line);
}

export interface Anchor {
  line: number;
  page: number;
}

/**
 * The page to show for a caret on `line`.
 *
 * The nearest citation at or above it. Null above the first one: a caret in
 * the note's introduction is not a statement about any page, and turning the
 * document to page one because somebody put their cursor in a heading is the
 * kind of helpfulness people switch off.
 */
export function pageForLine(anchors: readonly Anchor[], line: number): number | null {
  let found: number | null = null;
  for (const anchor of anchors) {
    if (anchor.line > line) break;
    found = anchor.page;
  }
  return found;
}

/**
 * The line to show for a document open at `page`.
 *
 * The last citation at or before that page, which is the paragraph written
 * about the part of the paper now on screen. Null before the first citation,
 * for the same reason as above.
 */
export function lineForPage(anchors: readonly Anchor[], page: number): number | null {
  let found: number | null = null;
  for (const anchor of [...anchors].sort((a, b) => a.page - b.page || a.line - b.line)) {
    if (anchor.page > page) break;
    found = anchor.line;
  }
  return found;
}
