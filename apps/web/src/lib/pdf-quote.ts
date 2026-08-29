import { citationLink, type PdfCitation } from "@forkleaf/pdf";

/**
 * Turning a passage of a PDF into markdown a note can hold.
 *
 * This is the join between the reader and the notebook, and the rule it exists
 * to keep is ForkLeaf's oldest one: what lands in the file has to be plain
 * markdown that renders correctly on github.com, in an IDE, and in anything
 * else that opens the repository. So a citation is a blockquote and a link —
 * two of the most ordinary constructs markdown has — and every clever part of
 * it hides inside the link's fragment, where any tool that does not understand
 * it will ignore it and still open the right page.
 *
 * The alternative, an `<forkleaf-citation>` element or a custom fence, would
 * have been easier to parse back and would have made every note that used it
 * unreadable everywhere but here. That is not a trade this app makes.
 */

export interface QuoteOptions {
  /**
   * Repo-relative path of the PDF, as it should appear in the note.
   *
   * Null for a document that is not in the notebook — one opened from the
   * user's own disk, which has no path this repository could resolve. The
   * quotation is still worth having; it just gets a plain attribution rather
   * than a link, because a link to `/Users/somebody/Downloads/paper.pdf` is
   * one that resolves on exactly one computer and is a broken link everywhere
   * else, including in the same repository tomorrow.
   */
  target: string | null;
  /** What to call the document in the link text. */
  title: string;
  citation: PdfCitation;
  /** Include the quoted passage as a blockquote. Off gives a bare reference. */
  includeQuote?: boolean;
}

/**
 * The markdown for a cited passage.
 *
 * ```md
 * > The key result is that latency fell by half.
 * >
 * > — [On Attention, p. 12](papers/attention.pdf#page=12&q=…)
 * ```
 *
 * The attribution lives *inside* the blockquote rather than on a line below
 * it. That is the difference between a quotation that can be moved, indented
 * or nested with its source intact and one that loses its source the first
 * time somebody reorganises the note around it.
 */
export function quoteMarkdown(options: QuoteOptions): string {
  const { target, title, citation, includeQuote = true } = options;
  const reference = referenceMarkdown({ target, title, citation });

  if (!includeQuote || !citation.quote.trim()) return reference;

  const body = citation.quote
    .trim()
    .split("\n")
    .map((line) => `> ${line}`.trimEnd())
    .join("\n");

  return `${body}\n>\n> — ${reference}`;
}

/** Just the link: `[On Attention, p. 12](papers/attention.pdf#page=12&q=…)`. */
export function referenceMarkdown(options: Omit<QuoteOptions, "includeQuote">): string {
  const { target, title, citation } = options;
  const label = escapeLinkText(`${title}, p. ${citation.page}`);

  return target === null ? label : `[${label}](${citationLink(target, citation)})`;
}

/**
 * Escapes the characters that would end a link's text early.
 *
 * A document called "Results [draft]" is not unusual, and pasting its title
 * unescaped into `[…]` produces a link whose text is "Results [draft" followed
 * by a stray `](…)` rendered as prose. Backslash escapes are the markdown
 * spelling and survive every renderer.
 */
function escapeLinkText(text: string): string {
  return text
    .replace(/([[\]\\])/g, "\\$1")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Where in a note a citation should be inserted, given where the caret is.
 *
 * Blockquotes need a blank line before and after them or the renderer welds
 * them onto the neighbouring paragraph — a quotation that swallows the
 * sentence you were writing when you inserted it. This works out how many
 * newlines are actually missing rather than always adding two, so citing into
 * an empty note does not open it with three blank lines.
 */
export function insertionFor(
  content: string,
  caret: number,
  snippet: string,
): { text: string; caret: number } {
  const at = Math.min(Math.max(caret, 0), content.length);
  const before = content.slice(0, at);
  const after = content.slice(at);

  const lead = before === "" ? "" : "\n".repeat(Math.max(0, 2 - trailingNewlines(before)));
  const tail = after === "" ? "\n" : "\n".repeat(Math.max(0, 2 - leadingNewlines(after)));

  const inserted = `${lead}${snippet}${tail}`;
  return { text: `${before}${inserted}${after}`, caret: at + inserted.length };
}

function trailingNewlines(text: string): number {
  return /(\n*)$/.exec(text)?.[1]?.length ?? 0;
}

function leadingNewlines(text: string): number {
  return /^(\n*)/.exec(text)?.[1]?.length ?? 0;
}
