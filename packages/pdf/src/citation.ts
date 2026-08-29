import { normalizeForMatch, toSourceRange, type NormalizedText } from "./text";
import type { PdfCitation, PdfCitationMatch, PdfPageText } from "./types";

/**
 * Citations that keep pointing at the right sentence.
 *
 * The problem this solves: you quote a paragraph from page 12 of a paper into
 * a note, and six months later the author publishes v3, which adds a figure to
 * page 4. Your citation now points at page 12 of a document where the sentence
 * you quoted is on page 13. Every tool that stores "page 12" is now lying, and
 * lying silently — the link still opens, it just shows the wrong text.
 *
 * So a ForkLeaf citation records the sentence, not the page. Resolving one
 * means searching the document for those exact words, using the words either
 * side of them to tell two occurrences apart, and treating the page number as
 * a hint about where to start looking. When the document has genuinely changed
 * out from under the quotation, that is *reported* — `"lost"` — rather than
 * quietly rendered as a link to whatever happens to be on page 12 now.
 *
 * This is the same selector model as W3C Web Annotation's `TextQuoteSelector`,
 * for the same reason ForkLeaf's wikilinks are Obsidian's dialect: the anchors
 * get written into plain markdown files whose entire point is that other
 * software can read them. An invented format would have made every one of
 * those files a little bit less portable.
 */

/**
 * How much text either side of a quotation is kept.
 *
 * Long enough to tell apart two occurrences of a repeated phrase — which in a
 * technical document is most phrases — and short enough that a citation stays
 * a readable thing to have in a markdown file. Forty-eight characters is
 * roughly a line of prose either side.
 */
export const CONTEXT_LENGTH = 48;

/**
 * The longest quotation a citation will store.
 *
 * A citation is a pointer, not a copy. Someone who selects nine pages and
 * clicks "cite" wants a link to that passage, not nine pages of it embedded in
 * a URL — and a fragment that long is unusable in markdown and refused by some
 * tools outright. The anchor keeps the head of the selection, which is what
 * the resolver needs to find it again; the full text, if it is wanted, belongs
 * in the note as a quotation.
 */
export const MAX_QUOTE_LENGTH = 512;

// ─── Building ───────────────────────────────────────────────────────────────

/**
 * Builds a citation from a selected range on a page.
 *
 * `start` and `end` are offsets into that page's assembled text.
 */
export function createCitation(pageText: PdfPageText, start: number, end: number): PdfCitation {
  const from = clamp(Math.min(start, end), 0, pageText.text.length);
  const to = clamp(Math.max(start, end), 0, pageText.text.length);

  const quote = tidy(pageText.text.slice(from, to)).slice(0, MAX_QUOTE_LENGTH);
  const prefix = tidy(pageText.text.slice(Math.max(0, from - CONTEXT_LENGTH), from));
  const suffix = tidy(pageText.text.slice(to, to + CONTEXT_LENGTH));

  return { quote, prefix, suffix, page: pageText.page };
}

/** Whitespace in a PDF is layout, not content; a stored quotation is content. */
function tidy(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}

// ─── Serialising ────────────────────────────────────────────────────────────

/**
 * A citation as a URL fragment.
 *
 * `page=` first and spelled that way on purpose: it is Adobe's own open
 * parameter, so `paper.pdf#page=12` opens page 12 in Acrobat, in Chrome's
 * built-in viewer, and in every PDF reader written since 2003. A ForkLeaf
 * citation degrades to exactly that everywhere else — the extra parameters are
 * ignored by readers that do not know them, and the reader still lands on the
 * right page. A bespoke fragment scheme would have degraded to nothing.
 */
export function serializeCitation(citation: PdfCitation): string {
  const parts = [`page=${Math.max(1, Math.trunc(citation.page))}`];

  if (citation.quote) parts.push(`q=${encodeFragment(citation.quote)}`);
  if (citation.prefix) parts.push(`pre=${encodeFragment(citation.prefix)}`);
  if (citation.suffix) parts.push(`suf=${encodeFragment(citation.suffix)}`);

  return parts.join("&");
}

/**
 * Reads a fragment back, or null when it is not one of ours.
 *
 * Tolerant by design. A fragment written by hand, or by another tool, or by an
 * older version of this code, should still open the document at a sensible
 * place rather than being rejected: `#page=4` alone is a perfectly good
 * citation with no quotation in it, and `#4` is what somebody types.
 */
export function parseCitation(fragment: string): PdfCitation | null {
  const raw = fragment.startsWith("#") ? fragment.slice(1) : fragment;
  if (!raw) return null;

  // A bare number is the shorthand every reader eventually tries.
  if (/^\d+$/.test(raw)) {
    const page = Number.parseInt(raw, 10);
    return page >= 1 ? { quote: "", prefix: "", suffix: "", page } : null;
  }

  const fields = new Map<string, string>();
  for (const pair of raw.split("&")) {
    const equals = pair.indexOf("=");
    if (equals === -1) continue;
    fields.set(pair.slice(0, equals).toLowerCase(), decodeFragment(pair.slice(equals + 1)));
  }

  const pageValue = fields.get("page") ?? fields.get("p");
  const page = pageValue ? Number.parseInt(pageValue, 10) : Number.NaN;
  const quote = fields.get("q") ?? fields.get("quote") ?? "";

  // Neither a page nor a quotation means this fragment is about something
  // else entirely — a heading anchor, say — and is not ours to interpret.
  if (!Number.isFinite(page) && !quote) return null;

  return {
    quote: quote.slice(0, MAX_QUOTE_LENGTH),
    prefix: (fields.get("pre") ?? "").slice(0, CONTEXT_LENGTH),
    suffix: (fields.get("suf") ?? "").slice(0, CONTEXT_LENGTH),
    page: Number.isFinite(page) && page >= 1 ? page : 1,
  };
}

/** A markdown-safe link target: `papers/attention.pdf#page=12&q=…`. */
export function citationLink(pdfPath: string, citation: PdfCitation): string {
  return `${encodePath(pdfPath)}#${serializeCitation(citation)}`;
}

/**
 * Splits a link target into its path and fragment.
 *
 * The last `#` rather than the first: a file really can be called `q&a#1.pdf`,
 * and the fragment is always what follows the final one.
 */
export function splitTarget(target: string): { path: string; fragment: string } {
  const hash = target.lastIndexOf("#");
  if (hash === -1) return { path: target, fragment: "" };
  return { path: target.slice(0, hash), fragment: target.slice(hash + 1) };
}

/** True for a link target naming a PDF, fragment or not. */
export function isPdfTarget(target: string): boolean {
  return /\.pdf$/i.test(splitTarget(target).path);
}

/**
 * Percent-encoding for a value going inside a markdown link.
 *
 * `encodeURIComponent` leaves `(`, `)` and `'` alone, and the first two end a
 * markdown link early — `[x](a.pdf#q=see%20(b))` links to `a.pdf#q=see%20(b`
 * and leaves `)` as text. Escaping them here rather than trusting each caller
 * to remember is the difference between quoting a sentence with a parenthesis
 * in it working and looking broken.
 */
function encodeFragment(value: string): string {
  return encodeURIComponent(value).replace(/\(/g, "%28").replace(/\)/g, "%29").replace(/'/g, "%27");
}

function decodeFragment(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    // A malformed escape is not worth losing the whole citation over.
    return value;
  }
}

function encodePath(path: string): string {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment).replace(/\(/g, "%28").replace(/\)/g, "%29"))
    .join("/");
}

// ─── Resolving ──────────────────────────────────────────────────────────────

/**
 * Finds a citation in a document, and says how sure it is.
 *
 * The search runs in tiers, most confident first:
 *
 *   1. The exact quotation, on the page the citation names.
 *   2. The exact quotation, anywhere else in the document — the case a new
 *      edition of the file creates, and the case a page number alone gets
 *      wrong. Reported as `"moved"`, because the reader deserves to know the
 *      document is not the one the note was written against.
 *   3. The quotation ignoring punctuation, which is what survives a document
 *      being re-typeset with different quote marks and dashes.
 *   4. The longest leading run of the quotation's words that still appears,
 *      for a passage that has been edited rather than moved. Reported as
 *      `"fuzzy"` — it points somewhere real, and it might be pointing at a
 *      sentence that no longer says what the note claims it does.
 *
 * When several occurrences match, the recorded prefix and suffix choose
 * between them. That is what context is for, and it is why it is stored: in a
 * document that says "as discussed above" forty times, the quotation alone
 * identifies nothing.
 */
export function resolveCitation(
  pages: readonly PdfPageText[],
  citation: PdfCitation,
): PdfCitationMatch {
  if (pages.length === 0) return lost();

  // With nothing to match on, a citation is exactly as good as its page hint.
  if (!citation.quote.trim()) {
    const page = pages.find((candidate) => candidate.page === citation.page);
    return page
      ? { quality: "exact", page: page.page, range: [0, 0] }
      : { quality: "lost", page: null, range: null };
  }

  const normalized = pages.map((page) => ({ page, text: normalizeForMatch(page.text) }));
  const context = {
    prefix: normalizeForMatch(citation.prefix).text.trim(),
    suffix: normalizeForMatch(citation.suffix).text.trim(),
  };

  const needle = normalizeForMatch(citation.quote).text.trim();
  if (!needle) return lost();

  // Tiers 1 and 2 differ only in which page won, so they are one search.
  const exact = bestMatch(normalized, needle, context, citation.page);
  if (exact) {
    return {
      quality: exact.page === citation.page ? "exact" : "moved",
      page: exact.page,
      range: exact.range,
    };
  }

  // Tier 3: the same words, with the typesetter's punctuation discounted.
  const loose = normalized.map((entry) => ({
    page: entry.page,
    text: compose(entry.text, stripPunctuation(entry.text.text)),
  }));
  const looseNeedle = stripPunctuation(needle).text.trim();

  if (looseNeedle) {
    const found = bestMatch(
      loose,
      looseNeedle,
      {
        prefix: stripPunctuation(context.prefix).text.trim(),
        suffix: stripPunctuation(context.suffix).text.trim(),
      },
      citation.page,
    );
    if (found) return { quality: "fuzzy", page: found.page, range: found.range };
  }

  // Tier 4: as much of the opening of the quotation as still exists.
  const partial = longestLeadingMatch(normalized, needle, context, citation.page);
  if (partial) return { quality: "fuzzy", page: partial.page, range: partial.range };

  return lost();
}

function lost(): PdfCitationMatch {
  return { quality: "lost", page: null, range: null };
}

interface Candidate {
  page: PdfPageText;
  text: NormalizedText;
}

interface Found {
  page: number;
  range: [number, number];
}

interface Context {
  prefix: string;
  suffix: string;
}

/**
 * The best occurrence of `needle` across the document.
 *
 * Every occurrence on every page is scored, rather than returning the first —
 * "first match wins" is what makes a citation to the second mention of a term
 * jump to the first one, every time, forever. Context is worth more than the
 * page hint, because context identifies the passage while the page only says
 * where it used to be.
 */
function bestMatch(
  pages: readonly Candidate[],
  needle: string,
  context: Context,
  hintedPage: number,
): Found | null {
  let best: Found | null = null;
  let bestScore = -1;

  for (const candidate of pages) {
    const haystack = candidate.text.text;
    let at = haystack.indexOf(needle);

    while (at !== -1) {
      const score =
        contextScore(haystack, at, at + needle.length, context) +
        (candidate.page.page === hintedPage ? 1 : 0);

      if (score > bestScore) {
        bestScore = score;
        best = {
          page: candidate.page.page,
          range: toSourceRange(candidate.text, at, at + needle.length),
        };
      }

      at = haystack.indexOf(needle, at + 1);
    }
  }

  return best;
}

/**
 * How well the text around an occurrence matches the recorded context.
 *
 * Scored by how much of the stored context still agrees rather than as a
 * yes/no, so a paragraph whose opening was reworded still beats an unrelated
 * occurrence on the other side of the document. Worth up to 4, so it outranks
 * the page hint's 1 — a passage that has moved is still the passage.
 */
function contextScore(haystack: string, start: number, end: number, context: Context): number {
  let score = 0;

  if (context.prefix) {
    score +=
      2 * overlapRatio(windowBefore(haystack, start, context.prefix.length), context.prefix, "end");
  }
  if (context.suffix) {
    score +=
      2 * overlapRatio(windowAfter(haystack, end, context.suffix.length), context.suffix, "start");
  }

  return score;
}

/**
 * The stored context is trimmed; the text around a match is not.
 *
 * A quotation almost always has a space in front of it and another behind it,
 * so comparing `"different lead-in."` against the raw `"different lead-in. "`
 * disagrees on the very first character compared and scores zero — which made
 * context worth nothing at all, and left the page hint quietly deciding every
 * ambiguous citation on its own. The windows are taken with slack and trimmed
 * on the side that faces the quotation, so the comparison starts on a real
 * character.
 */
const CONTEXT_SLACK = 4;

function windowBefore(haystack: string, start: number, length: number): string {
  return haystack.slice(Math.max(0, start - length - CONTEXT_SLACK), start).trimEnd();
}

function windowAfter(haystack: string, end: number, length: number): string {
  return haystack.slice(end, end + length + CONTEXT_SLACK).trimStart();
}

/** The fraction of `wanted` that `actual` reproduces, from one end. */
function overlapRatio(actual: string, wanted: string, from: "start" | "end"): number {
  if (!wanted) return 0;

  let shared = 0;
  while (shared < actual.length && shared < wanted.length) {
    const a = from === "end" ? actual[actual.length - 1 - shared] : actual[shared];
    const b = from === "end" ? wanted[wanted.length - 1 - shared] : wanted[shared];
    if (a !== b) break;
    shared += 1;
  }

  return shared / wanted.length;
}

/**
 * The longest opening run of the quotation's words that still appears.
 *
 * Words rather than characters, and only from the start: a match that begins
 * mid-word is not a match a reader would accept, and a match on some arbitrary
 * middle fragment of a long quotation is more likely to be a coincidence than
 * the passage. Short runs are refused outright for that reason — "the" appears
 * on every page and finding it proves nothing.
 */
function longestLeadingMatch(
  pages: readonly Candidate[],
  needle: string,
  context: Context,
  hintedPage: number,
): Found | null {
  const words = needle.split(" ").filter(Boolean);
  if (words.length < 2) return null;

  for (let count = words.length - 1; count >= 2; count -= 1) {
    const attempt = words.slice(0, count).join(" ");
    if (attempt.length < MIN_PARTIAL_LENGTH) return null;

    const found = bestMatch(pages, attempt, context, hintedPage);
    if (found) return found;
  }

  return null;
}

/**
 * Shortest partial match worth reporting.
 *
 * Below this, a "match" is a common phrase rather than the passage, and a
 * citation that lands on the wrong paragraph is worse than one that admits it
 * cannot find the right one.
 */
const MIN_PARTIAL_LENGTH = 16;

// ─── Normalisation helpers ──────────────────────────────────────────────────

/**
 * Drops everything that is not a letter, a digit or a space.
 *
 * The second, looser pass. Between two builds of the same document the words
 * are the same and the punctuation is whatever the new toolchain felt like —
 * en dashes become hyphens, quotes turn straight, a stray footnote marker
 * appears mid-sentence. Ignoring all of it finds the passage; it is a weaker
 * claim than an exact match, which is why the result is reported as fuzzy.
 */
export function stripPunctuation(source: string): NormalizedText {
  let text = "";
  const map: number[] = [];
  let pendingSpace = -1;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]!;

    if (/\s/.test(character)) {
      if (pendingSpace === -1) pendingSpace = index;
      continue;
    }
    if (!/[\p{L}\p{N}]/u.test(character)) {
      // Punctuation between words leaves the word gap behind it.
      if (pendingSpace === -1) pendingSpace = index;
      continue;
    }

    if (pendingSpace !== -1) {
      if (text !== "") {
        text += " ";
        map.push(pendingSpace);
      }
      pendingSpace = -1;
    }

    text += character;
    map.push(index);
  }

  map.push(source.length);
  return { text, map };
}

/**
 * Chains two normalisations, so offsets still lead back to the original text.
 *
 * `inner` was computed from `outer.text`, so its map holds offsets into that
 * intermediate string; composing rewrites them as offsets into whatever
 * `outer` was built from. Without this the second pass could find a match and
 * then be unable to say where on the page it is.
 */
export function compose(outer: NormalizedText, inner: NormalizedText): NormalizedText {
  return {
    text: inner.text,
    map: inner.map.map((offset) => outer.map[offset] ?? outer.map[outer.map.length - 1] ?? 0),
  };
}
