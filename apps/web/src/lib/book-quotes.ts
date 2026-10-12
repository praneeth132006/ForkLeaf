/**
 * Quotes from paper books, kept in a note per book.
 *
 * Photograph a page, pick the lines worth keeping, and they land in
 * `books/<title>.md` as a quotation with its page number:
 *
 *     > The best way to predict the future is to invent it.
 *     > — p. 42 · 2026-10-12
 *
 * The note is marked `type: book`, which is how spaced reading finds it: every
 * quote comes back to be reread on the same schedule as highlights from PDFs.
 * The photo itself is not kept — only the words chosen from it.
 */

export const BOOKS_FOLDER = "books";

export interface BookQuote {
  text: string;
  page: string | null;
  /** 1-based line the quote starts on. */
  line: number;
}

export interface BookNoteSource {
  path: string;
  title: string;
  frontmatter: Record<string, unknown>;
}

/** True for a note that holds quotes from a book. */
export function isBookNote(source: Pick<BookNoteSource, "frontmatter">): boolean {
  return source.frontmatter.type === "book";
}

/** The books already in the notebook, for picking one again. */
export function bookTitles(
  sources: readonly BookNoteSource[],
): Array<{ title: string; path: string; author: string | null }> {
  return sources
    .filter(isBookNote)
    .map((source) => ({
      title: source.title,
      path: source.path,
      author: typeof source.frontmatter.author === "string" ? source.frontmatter.author : null,
    }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

function yamlString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** A new note for a book, before any quotes. */
export function bookNote(title: string, author: string | null): string {
  return [
    "---",
    `title: ${yamlString(title)}`,
    "type: book",
    ...(author ? [`author: ${yamlString(author)}`] : []),
    "tags: [book]",
    "---",
    "",
    `# ${title}`,
    "",
    ...(author ? [`By ${author}`, ""] : []),
  ].join("\n");
}

const ATTRIBUTION = /^>\s*[—-]\s*(?:p\.\s*([\w-]+))?\s*(?:·\s*.*)?$/;

/** The quotes a book note holds, in order. */
export function quotesIn(content: string): BookQuote[] {
  const quotes: BookQuote[] = [];
  const lines = content.split("\n");
  let block: { start: number; lines: string[] } | null = null;

  const close = () => {
    if (!block) return;
    let page: string | null = null;
    const last = block.lines[block.lines.length - 1];
    if (last !== undefined && ATTRIBUTION.test(`> ${last}`)) {
      page = ATTRIBUTION.exec(`> ${last}`)?.[1] ?? null;
      block.lines.pop();
    }
    const text = block.lines.join(" ").replace(/\s+/g, " ").trim();
    if (text) quotes.push({ text, page, line: block.start + 1 });
    block = null;
  };

  lines.forEach((line, index) => {
    if (/^\s*>/.test(line)) {
      const body = line.replace(/^\s*>\s?/, "");
      if (block) block.lines.push(body);
      else block = { start: index, lines: [body] };
    } else {
      close();
    }
  });
  close();
  return quotes;
}

/** Tidies a passage the way it was typed or recognised: one line, single spaces. */
export function tidyPassage(text: string): string {
  return text
    .replace(/(\p{L})-\s*\n\s*(\p{Ll})/gu, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The note with one more quote at the end.
 *
 * A passage already in the note is not added twice — saving the same lines
 * again is somebody checking they were kept.
 */
export function withQuote(
  content: string,
  quote: { text: string; page: string | null; date: string },
): { content: string; added: boolean } {
  const text = tidyPassage(quote.text);
  if (!text) return { content, added: false };
  if (quotesIn(content).some((held) => held.text === text)) return { content, added: false };

  const attribution = [quote.page ? `p. ${quote.page.trim()}` : null, quote.date]
    .filter(Boolean)
    .join(" · ");
  const block = `> ${text}\n> — ${attribution}\n`;
  const trimmed = content.replace(/\s+$/, "");
  return { content: `${trimmed}\n\n${block}`, added: true };
}
