/**
 * The shape of a PDF, as ForkLeaf needs it.
 *
 * Deliberately independent of pdf.js. Everything below is plain serialisable
 * data — no class instances, no live document handles — for the same reason
 * the rest of the domain model is: these values travel into IndexedDB through
 * `structuredClone`, into React state, and into the markdown a note is made
 * of. A `PDFDocumentProxy` can do none of that.
 *
 * The separation also buys the thing that matters most here: every interesting
 * decision in this package — where a quotation lives, which page a phrase is
 * on, whether two versions of a paper still say the same thing — is a pure
 * function of these values, and so can be tested without a rendering engine,
 * a canvas, or a real PDF.
 */

/** What the file says about itself. Every field is optional; PDFs lie and omit. */
export interface PdfMetadata {
  title: string | null;
  author: string | null;
  subject: string | null;
  keywords: string[];
  /** ISO timestamp, when the file carried a parseable one. */
  createdAt: string | null;
  modifiedAt: string | null;
  producer: string | null;
}

/** A page's dimensions in PDF points, at the page's own rotation. */
export interface PdfPageSize {
  width: number;
  height: number;
  /** 0, 90, 180 or 270. */
  rotation: number;
}

/**
 * One run of text on a page, with where it sits.
 *
 * `start` and `end` are offsets into the page's assembled `text`, which is what
 * lets a character range found by search or selection be turned back into
 * rectangles to draw over the page.
 */
export interface PdfTextRun {
  /** Offset of this run's first character in the page text. */
  start: number;
  /** Offset one past its last character. */
  end: number;
  /** Left edge, in PDF points from the page's left. */
  x: number;
  /** Bottom edge, in PDF points from the page's bottom. */
  y: number;
  width: number;
  height: number;
}

/** A page's text, and the geometry behind it. */
export interface PdfPageText {
  /** 1-based, the way PDFs and people both number pages. */
  page: number;
  /**
   * The page's text as one string.
   *
   * Assembled rather than concatenated: pdf.js hands back positioned runs, and
   * gluing them with nothing at all welds "the end" to "Chapter" across a line
   * break. See `assemblePageText`.
   */
  text: string;
  runs: PdfTextRun[];
}

/** An entry in the document's own table of contents. */
export interface PdfOutlineItem {
  title: string;
  /** 1-based page, or null when the destination could not be resolved. */
  page: number | null;
  children: PdfOutlineItem[];
}

/** Everything ForkLeaf knows about an opened PDF, minus the rendered pixels. */
export interface PdfDocumentInfo {
  pageCount: number;
  metadata: PdfMetadata;
  sizes: PdfPageSize[];
  /** True when the file asks for a password ForkLeaf does not have. */
  encrypted: boolean;
}

/**
 * A pointer into a PDF that keeps pointing at the right words.
 *
 * This is the reason the package exists. A citation written as "page 12" is
 * wrong the moment the author adds a paragraph to page 3, and a citation
 * written as a byte offset is wrong the moment anything at all changes. What
 * does not change is *the sentence being quoted* and the words on either side
 * of it — so that is what gets recorded, with the page number kept only as a
 * hint about where to look first.
 *
 * The shape is W3C Web Annotation's `TextQuoteSelector` plus a page hint,
 * which is a standard rather than an invention for exactly the reason the
 * wikilink dialect is Obsidian's: these anchors end up written into plain
 * markdown files whose whole point is that other tools can read them.
 */
export interface PdfCitation {
  /** The quoted text itself, as it appeared on the page. */
  quote: string;
  /** Up to `CONTEXT_LENGTH` characters immediately before the quote. */
  prefix: string;
  /** Up to `CONTEXT_LENGTH` characters immediately after it. */
  suffix: string;
  /** Where it was when it was written. A hint, never the authority. */
  page: number;
}

/** How confidently a citation was found again. */
export type PdfMatchQuality =
  /** Quote and both context windows matched exactly, on the page recorded. */
  | "exact"
  /** Quote and context matched exactly, but on a different page. */
  | "moved"
  /** The quote matched only after normalising hyphenation, ligatures or space. */
  | "fuzzy"
  /** Nothing in the document matches. */
  | "lost";

/** Where a citation turned out to live. */
export interface PdfCitationMatch {
  quality: PdfMatchQuality;
  /** 1-based page, or null when `quality` is `"lost"`. */
  page: number | null;
  /** Character range in that page's text, or null when lost. */
  range: [start: number, end: number] | null;
}

/** One occurrence of a search term. */
export interface PdfSearchHit {
  page: number;
  range: [start: number, end: number];
  /** A line of surrounding text, for the results list. */
  snippet: string;
  /** Where the match sits inside `snippet`. */
  snippetRange: [start: number, end: number];
}
