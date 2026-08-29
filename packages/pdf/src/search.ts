import { normalizeForMatch, toSourceRange } from "./text";
import type { PdfPageText, PdfSearchHit } from "./types";

/**
 * Finding a phrase inside a PDF.
 *
 * Built on the same normalisation the citation resolver uses, and that is the
 * whole trick: searching a PDF is the thing every reader tries first and the
 * thing most viewers do badly, because they search the raw extracted string.
 * In that string the word "significant" is often `signiﬁcant`, "regular"
 * broken across a line is `regu-\nlar`, and every word may be separated by a
 * newline. A literal `indexOf` finds none of them, and the reader concludes
 * the phrase is not in the document when it is printed twice on page 3.
 *
 * Matching against the normalised form and mapping back to the real offsets
 * finds all three, and still highlights the exact characters on the page.
 */

export interface PdfSearchOptions {
  /** Stop after this many hits. Defaults to 200. */
  limit?: number;
  /** Characters of context either side of a hit in its snippet. */
  context?: number;
  /**
   * Only match whole words.
   *
   * Off by default, because a reader typing three letters into a find box is
   * usually still typing.
   */
  wholeWord?: boolean;
}

const DEFAULT_LIMIT = 200;
const DEFAULT_CONTEXT = 40;

/** Every occurrence of `query`, in page order. */
export function searchPdf(
  pages: readonly PdfPageText[],
  query: string,
  options: PdfSearchOptions = {},
): PdfSearchHit[] {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const context = options.context ?? DEFAULT_CONTEXT;

  const needle = normalizeForMatch(query).text.trim();
  if (!needle) return [];

  const hits: PdfSearchHit[] = [];

  for (const page of pages) {
    const normalized = normalizeForMatch(page.text);
    const haystack = normalized.text;

    let at = haystack.indexOf(needle);
    while (at !== -1 && hits.length < limit) {
      const end = at + needle.length;

      if (!options.wholeWord || isWholeWord(haystack, at, end)) {
        const [start, stop] = toSourceRange(normalized, at, end);
        hits.push({
          page: page.page,
          range: [start, stop],
          ...snippetAround(page.text, start, stop, context),
        });
      }

      at = haystack.indexOf(needle, at + 1);
    }

    if (hits.length >= limit) break;
  }

  return hits;
}

/** How many times a phrase appears, without building a snippet for each. */
export function countMatches(pages: readonly PdfPageText[], query: string): number {
  const needle = normalizeForMatch(query).text.trim();
  if (!needle) return 0;

  let total = 0;
  for (const page of pages) {
    const haystack = normalizeForMatch(page.text).text;
    let at = haystack.indexOf(needle);
    while (at !== -1) {
      total += 1;
      at = haystack.indexOf(needle, at + 1);
    }
  }
  return total;
}

/** The pages a phrase appears on, for a page-strip indicator. */
export function pagesMatching(pages: readonly PdfPageText[], query: string): number[] {
  const needle = normalizeForMatch(query).text.trim();
  if (!needle) return [];

  return pages
    .filter((page) => normalizeForMatch(page.text).text.includes(needle))
    .map((page) => page.page);
}

function isWholeWord(haystack: string, start: number, end: number): boolean {
  const before = start > 0 ? haystack[start - 1]! : " ";
  const after = end < haystack.length ? haystack[end]! : " ";
  return !isWordCharacter(before) && !isWordCharacter(after);
}

function isWordCharacter(character: string): boolean {
  return /[\p{L}\p{N}]/u.test(character);
}

/**
 * A readable line around a match.
 *
 * Whitespace is flattened, because the source text's newlines are column
 * layout rather than sentence structure and a snippet full of them reads as
 * three broken fragments. The ellipses are added only when something really
 * was cut, so a short line does not pretend to be an excerpt of a longer one.
 */
function snippetAround(
  source: string,
  start: number,
  end: number,
  context: number,
): { snippet: string; snippetRange: [number, number] } {
  const from = Math.max(0, start - context);
  const to = Math.min(source.length, end + context);

  const lead = flatten(source.slice(from, start));
  const middle = flatten(source.slice(start, end));
  const tail = flatten(source.slice(end, to));

  const prefix = from > 0 ? "…" : "";
  const suffix = to < source.length ? "…" : "";

  const snippet = `${prefix}${lead}${middle}${tail}${suffix}`;
  const offset = prefix.length + lead.length;

  return { snippet, snippetRange: [offset, offset + middle.length] };
}

function flatten(value: string): string {
  return value.replace(/\s+/g, " ");
}
