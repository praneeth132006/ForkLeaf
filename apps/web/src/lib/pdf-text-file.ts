import { basename, dirname, joinPath, stripExtension } from "@forkleaf/markdown-engine";
import type { PdfPageText } from "@forkleaf/pdf";

/**
 * A document's text, kept beside it as a file.
 *
 * Two problems, one answer.
 *
 * A scan is a photograph of a page. There is no text in it, so there is
 * nothing to search, nothing to quote and nothing to check a citation
 * against — the reader says so honestly today and then there is nowhere to go.
 * The words have to be recognised by something, once, and the result has to
 * live somewhere every device can see. A file beside the document is that
 * somewhere.
 *
 * And a paper that *does* carry its text still has it extracted from scratch
 * on every device, every time — seconds of work per document, repeated
 * forever, thrown away at the end. The same file fixes that too: read once,
 * committed, and every other machine simply reads it.
 *
 * Deliberately markdown with a heading per page, not JSON. Somebody will
 * produce these with `ocrmypdf`, `tesseract` or by hand, and will want to fix
 * a mangled line when they find one — which means the format has to be
 * something a person can open, read and correct without a tool. It renders on
 * github.com, greps, and diffs a page at a time.
 */

/** `papers/attention.pdf` → `papers/attention.text.md`. */
export function textPathFor(pdfPath: string): string {
  const folder = dirname(pdfPath);
  const name = stripExtension(basename(pdfPath));
  return joinPath(folder, `${name}.text.md`);
}

/**
 * `## Page 12`, at the start of a line.
 *
 * Tolerant about the rest of the heading — `## Page 12 (front matter)` is
 * still page 12 — because a person writing one of these by hand will annotate
 * it, and refusing to read a file over a note somebody left themselves would
 * be the wrong way round.
 */
const PAGE_HEADING = /^\s{0,3}#{1,6}\s+page\s+(\d+)\b.*$/i;

export function parsePageText(markdown: string): { page: number; text: string }[] {
  const pages: { page: number; lines: string[] }[] = [];

  for (const line of markdown.split("\n")) {
    const heading = PAGE_HEADING.exec(line);
    if (heading?.[1]) {
      pages.push({ page: Number.parseInt(heading[1], 10), lines: [] });
      continue;
    }

    // Anything before the first page heading is the file's own title and
    // whatever the person who made it wanted to say about it.
    pages[pages.length - 1]?.lines.push(line);
  }

  return pages
    .map((page) => ({ page: page.page, text: page.lines.join("\n").trim() }))
    .filter((page) => Number.isFinite(page.page) && page.page > 0 && page.text !== "");
}

/** The file, as this app writes one. */
export function formatPageText(
  title: string,
  pages: readonly { page: number; text: string }[],
): string {
  const body = [...pages]
    .sort((a, b) => a.page - b.page)
    .map((page) => `## Page ${page.page}\n\n${page.text.trim()}`)
    .join("\n\n");

  return [
    `# Text of ${title}`,
    "",
    "The words of the document beside this file, one section per page — so they",
    "can be searched, quoted and checked without every device reading the whole",
    "document again. Correcting a line here corrects it everywhere.",
    "",
    body,
    "",
  ].join("\n");
}

/** Stored pages as the search and citation code want them. */
export function asPageText(pages: readonly { page: number; text: string }[]): PdfPageText[] {
  return pages.map((page) => ({ page: page.page, text: page.text, runs: [] }));
}
