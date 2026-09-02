import { parseCitation, type PdfCitation } from "@forkleaf/pdf";
import { pdfLinkTarget } from "@/lib/pdf-source";

/**
 * Everything you have written about a document, found in your own notes.
 *
 * ForkLeaf already writes a real link every time a passage is cited — that was
 * the point of writing citations as ordinary markdown rather than as a private
 * annotation format — which means the notebook already knows which notes quote
 * which paper, and on which page, and in what words. It just had no way to be
 * asked. This asks.
 *
 * The reason it is worth asking: months after reading a paper, the useful
 * artefact is not the paper. It is the four things you said about it, in four
 * different notes, written weeks apart. Nobody assembles that page by hand,
 * and here nobody has to — it is a by-product of citing normally.
 *
 * Text in, structured mentions out. No storage, no fetching, no React: this
 * runs over notes that are already in memory and is tested as a function.
 */

export interface PdfMention {
  /** The note the mention was found in. */
  notePath: string;
  /** The document it points at, repository-relative. */
  pdfPath: string;
  /**
   * The passage this points at, as the link records it.
   *
   * Null for a link with no fragment at all — "the paper", rather than a
   * particular sentence in it. Kept whole rather than reduced to a page
   * number, because checking whether a citation still holds means matching the
   * words, and the page is only ever a hint about where to start looking.
   */
  citation: PdfCitation | null;
  /** 1-based, so it can be reported and jumped to. */
  line: number;
  /** The link's own text — usually "Title, p. 12". */
  label: string;
  /** The page the citation was written against, when it records one. */
  page: number | null;
  /**
   * The passage taken from the document, when the mention is a quotation.
   *
   * Null for a bare reference — a link dropped into a sentence rather than
   * used to introduce a block quotation. `context` covers that case.
   */
  quote: string | null;
  /** The line the link sits on, stripped of markup, for a bare reference. */
  context: string;
}

/**
 * Markdown inline links, minus images.
 *
 * The negative lookbehind is what keeps `![alt](figure.pdf)` out — an image
 * whose source is a PDF is not something written *about* the document.
 * Destinations here never contain spaces or brackets: they are repo-relative
 * paths with a fragment, written by ForkLeaf itself or by hand in the same
 * shape.
 */
const LINK = /(?<!!)\[((?:[^[\]\\]|\\.)*)\]\(([^()\s]+)\)/g;

/** Notes as this needs them: a path and a body. */
export interface MentionSource {
  path: string;
  content: string;
}

export function mentionsOfPdf(notes: readonly MentionSource[], pdfPath: string): PdfMention[] {
  return scan(notes, (path) => path === pdfPath);
}

/**
 * Every mention of every document, across the whole notebook.
 *
 * The same scan without the filter, for the sweep that checks all of them at
 * once. One pass over the notes rather than one pass per document: a notebook
 * with forty papers in it would otherwise be read forty times.
 */
export function allPdfMentions(notes: readonly MentionSource[]): PdfMention[] {
  return scan(notes, () => true);
}

function scan(notes: readonly MentionSource[], wanted: (pdfPath: string) => boolean): PdfMention[] {
  const found: PdfMention[] = [];

  for (const note of notes) {
    // A note cannot mention a document by pointing at itself, and skipping the
    // scan for a body with no `.pdf` in it at all keeps this cheap over a
    // notebook of a few thousand notes.
    if (!note.content.toLowerCase().includes(".pdf")) continue;

    // A document's own highlights file is not a note about the document: the
    // passages in it are already drawn on the page, and listing them here as
    // well would say the same thing twice.
    if (note.path.endsWith(".highlights.md")) continue;

    const lines = note.content.split("\n");

    lines.forEach((line, index) => {
      for (const match of line.matchAll(LINK)) {
        const [, rawLabel = "", href = ""] = match;
        const target = pdfLinkTarget(note.path, href);
        if (!target || !wanted(target.path)) continue;

        const citation = target.fragment ? parseCitation(target.fragment) : null;

        found.push({
          notePath: note.path,
          pdfPath: target.path,
          citation,
          line: index + 1,
          label: unescapeLinkText(rawLabel),
          page: citation?.page ?? pageFromFragment(target.fragment),
          quote: quotationAbove(lines, index),
          context: stripMarkup(line),
        });
      }
    });
  }

  // Newest thinking is rarely the most useful thinking, and there is no
  // reliable date on a line of a note anyway. Ordered by where in the document
  // the passage is, so reading down the list is reading through the paper —
  // mentions with no page at all go last rather than pretending to be page 0.
  return found.sort((a, b) => {
    if (a.pdfPath !== b.pdfPath) return a.pdfPath.localeCompare(b.pdfPath);
    if (a.page !== b.page) return (a.page ?? Infinity) - (b.page ?? Infinity);
    if (a.notePath !== b.notePath) return a.notePath.localeCompare(b.notePath);
    return a.line - b.line;
  });
}

/**
 * A page number from a link that is not a ForkLeaf citation.
 *
 * `#page=12` on its own is the twenty-year-old convention every PDF reader
 * understands, and a link written by hand — or by another tool — is still a
 * mention worth listing.
 */
function pageFromFragment(fragment: string): number | null {
  const match = /(?:^|&)page=(\d+)/.exec(fragment.replace(/^#/, ""));
  if (!match?.[1]) return null;
  const page = Number.parseInt(match[1], 10);
  return Number.isFinite(page) && page > 0 ? page : null;
}

/**
 * The block quotation a citation line is the attribution for.
 *
 * A quoted passage is written as the passage, a bare `>`, then `> — [link]`,
 * so the words are on the lines *above* the link. Walking up from the
 * attribution collects them; anything else — a link in a sentence, a link in a
 * list — has no quotation and says so.
 */
function quotationAbove(lines: readonly string[], index: number): string | null {
  const line = lines[index] ?? "";
  if (!/^\s*>\s*[—-]\s/.test(line)) return null;

  const collected: string[] = [];
  for (let above = index - 1; above >= 0; above -= 1) {
    const candidate = lines[above] ?? "";
    if (!/^\s*>/.test(candidate)) break;
    collected.unshift(candidate.replace(/^\s*>\s?/, ""));
  }

  const quote = collected.join("\n").trim();
  return quote === "" ? null : quote;
}

/** Enough markup removed to make a line of a note readable in a list. */
function stripMarkup(line: string): string {
  return line
    .replace(/^\s*>\s?/, "")
    .replace(/^\s*[-*+]\s+/, "")
    .replace(/^#{1,6}\s+/, "")
    .replace(LINK, "$1")
    .replace(/[*_`]/g, "")
    .trim();
}

/** Undoes the escaping `referenceMarkdown` applies when it writes a label. */
function unescapeLinkText(label: string): string {
  return label.replace(/\\([[\]\\])/g, "$1").trim();
}
