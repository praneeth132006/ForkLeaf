import { citationLink, parseCitation, type PdfCitation } from "@forkleaf/pdf";
import { basename, dirname, joinPath, stripExtension } from "@forkleaf/markdown-engine";

/**
 * Highlights that are just a text file.
 *
 * Everybody else locks a highlight inside the PDF — where it is a binary
 * annotation you can only read with a PDF reader — or inside their own app,
 * where you can never get it out at all. Both mean the marks you made on a
 * paper are worth nothing away from the tool you made them in, which is a
 * strange fate for the part that is actually yours.
 *
 * A ForkLeaf highlight is a line in an ordinary markdown file, committed beside
 * the document: `attention.pdf` gets `attention.highlights.md`. It renders on
 * github.com, opens in Notepad, greps, diffs, and comes back years later
 * without this app. The PDF itself is never touched — the file in the
 * repository stays exactly as it was committed, which is the promise the
 * reader has always made.
 *
 * Each line carries the same citation as a quotation in a note, so a highlight
 * is found again by its words rather than by a page number that goes stale.
 */

/** `papers/attention.pdf` → `papers/attention.highlights.md`. */
export function highlightsPathFor(pdfPath: string): string {
  const folder = dirname(pdfPath);
  const name = stripExtension(basename(pdfPath));
  return joinPath(folder, `${name}.highlights.md`);
}

export interface Highlight {
  citation: PdfCitation;
  /** The passage as it reads, which is what the line is mostly made of. */
  text: string;
}

/**
 * A line, as it is written into the file.
 *
 * A list item rather than a blockquote: a page of blockquotes is a page that
 * reads as though somebody wrote it, and this is a list of things somebody
 * marked. The link is relative to the file, which sits beside the document, so
 * it is just the document's name.
 */
const LINE = /^\s*[-*]\s+\[p\.\s*(\d+)\]\(([^()\s]+)\)\s*(?:—|--)?\s*(.*)$/;

export function parseHighlights(markdown: string): Highlight[] {
  const found: Highlight[] = [];

  for (const line of markdown.split("\n")) {
    const match = LINE.exec(line);
    if (!match) continue;

    const fragment = match[2]?.split("#")[1] ?? "";
    const citation = parseCitation(fragment);
    if (!citation) continue;

    found.push({ citation, text: (match[3] ?? "").trim() });
  }

  return found;
}

/**
 * The file with one more highlight in it.
 *
 * Kept in page order, because the file is read by people as well as by this
 * app and a list of a paper's passages out of order is a list nobody can use.
 * A passage already marked is not marked twice: highlighting the same sentence
 * again is somebody checking it is there, not asking for a duplicate.
 */
export function withHighlight(
  markdown: string,
  options: { pdfPath: string; title: string; citation: PdfCitation },
): string {
  const quote = tidy(options.citation.quote);
  const existing = parseHighlights(markdown);

  if (existing.some((held) => tidy(held.citation.quote) === quote)) return markdown;

  const all = [...existing, { citation: options.citation, text: quote }].sort(
    (a, b) => a.citation.page - b.citation.page,
  );

  return render(options.title, options.pdfPath, all);
}

/** Removes one highlight, leaving the rest of the file as it was. */
export function withoutHighlight(
  markdown: string,
  options: { pdfPath: string; title: string; quote: string },
): string {
  const wanted = tidy(options.quote);
  const kept = parseHighlights(markdown).filter((held) => tidy(held.citation.quote) !== wanted);

  return render(options.title, options.pdfPath, kept);
}

/** The whole file: a heading, and one line per highlight in page order. */
function render(title: string, pdfPath: string, highlights: readonly Highlight[]): string {
  if (highlights.length === 0) return `${header(title)}\n`;

  const lines = highlights.map((held) => lineFor(pdfPath, held.citation, held.text));
  return `${header(title)}\n\n${lines.join("\n")}\n`;
}

function header(title: string): string {
  return `# Highlights — ${title}`;
}

function lineFor(pdfPath: string, citation: PdfCitation, text: string): string {
  // Relative to the highlights file, which sits beside the document — so the
  // link is the document's own name and resolves on github.com too.
  const target = basename(pdfPath);
  return `- [p. ${citation.page}](${citationLink(target, citation)}) — ${text}`;
}

/** Whitespace is not what makes two passages different. */
function tidy(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}
