import type { PdfPageText, PdfTextRun } from "./types";

/**
 * Turning a PDF's positioned glyph runs into text you can search.
 *
 * A PDF does not contain sentences. It contains instructions to draw runs of
 * glyphs at coordinates, and any resemblance to a paragraph is something the
 * reader's eye supplies. pdf.js hands those runs back faithfully, which means
 * the naive `items.map((i) => i.str).join("")` produces text where the last
 * word of one line is welded to the first word of the next — `the endChapter
 * two` — and every phrase search that crosses a line break silently fails.
 *
 * So the runs are assembled with the spacing the layout implies, and then
 * *separately* normalised for matching. Those are two different jobs and this
 * file keeps them apart on purpose:
 *
 *   - `assemblePageText` produces the text a human reads and selects, with the
 *     line breaks and spaces the page actually has.
 *   - `normalizeForMatch` produces a flattened form for comparison — folded
 *     ligatures, rejoined hyphenation, collapsed whitespace — and, critically,
 *     an index map back to the original, so a match found in the flattened
 *     form can be reported as a range in the real text and drawn on the page.
 *
 * Without that map, fuzzy matching could tell you *that* a quotation is still
 * in the document but never *where*, which is not much use to a reader.
 */

/** The subset of a pdf.js text item this package needs. */
export interface RawTextItem {
  str: string;
  /** True when this run ends a line. */
  hasEOL?: boolean;
  /** pdf.js text matrix; `[4]` and `[5]` are x and y in PDF points. */
  transform?: readonly number[];
  width?: number;
  height?: number;
}

export interface AssembleOptions {
  /**
   * How wide a gap between two runs on the same line counts as a space,
   * as a fraction of the run's height.
   *
   * Many generators emit one run per word with no space characters at all, so
   * *something* has to infer the spaces or every line becomes one long word.
   * A fraction of the text height rather than an absolute number of points,
   * because a gap that is a word break in 9pt footnotes is kerning in a 30pt
   * title.
   */
  spaceRatio?: number;
}

const DEFAULT_SPACE_RATIO = 0.22;

/**
 * Assembles one page's runs into readable text plus the geometry behind it.
 *
 * Runs are taken in the order pdf.js gives them, which is the order the page
 * draws them — not reading order for a multi-column layout, and deliberately
 * not re-sorted here. Guessing columns from coordinates gets the two-column
 * paper right and the figure caption, the sidebar and the table wrong, and a
 * wrong guess is worse than the document's own order: the document's order is
 * at least the order its author's tooling chose.
 */
export function assemblePageText(
  page: number,
  items: readonly RawTextItem[],
  options: AssembleOptions = {},
): PdfPageText {
  const spaceRatio = options.spaceRatio ?? DEFAULT_SPACE_RATIO;

  let text = "";
  const runs: PdfTextRun[] = [];

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]!;
    // pdf.js also emits marked-content boundaries, which carry no string and
    // no transform. They are structure, not text.
    if (typeof item.str !== "string" || item.str === "") {
      if (item.hasEOL && text !== "" && !text.endsWith("\n")) text += "\n";
      continue;
    }

    const start = text.length;
    text += item.str;
    const end = text.length;

    const transform = item.transform ?? [];
    runs.push({
      start,
      end,
      x: transform[4] ?? 0,
      y: transform[5] ?? 0,
      width: item.width ?? 0,
      height: item.height ?? 0,
    });

    if (item.hasEOL) {
      text += "\n";
      continue;
    }

    // The *next run with text*, not simply the next item: pdf.js interleaves
    // marked-content boundaries that carry neither a string nor a position,
    // and comparing against one of those makes every gap look like no gap —
    // which welded "a" and "b" into "ab" whenever structure happened to be
    // tagged between them.
    const next = nextTextItem(items, index + 1);
    if (next && needsSpace(item, next, spaceRatio) && !endsOpen(text) && !startsOpen(next.str)) {
      text += " ";
    }
  }

  return { page, text, runs };
}

/** The next item that actually draws something, skipping structure markers. */
function nextTextItem(items: readonly RawTextItem[], from: number): RawTextItem | undefined {
  for (let index = from; index < items.length; index += 1) {
    const item = items[index]!;
    if (typeof item.str === "string" && item.str !== "") return item;
    // A structure marker that ends the line is still a line ending, and the
    // break it implies is not a space this function should be filling in.
    if (item.hasEOL) return undefined;
  }
  return undefined;
}

/** True when a visible gap separates two runs drawn on the same line. */
function needsSpace(item: RawTextItem, next: RawTextItem, ratio: number): boolean {
  const x = item.transform?.[4];
  const y = item.transform?.[5];
  const nextX = next.transform?.[4];
  const nextY = next.transform?.[5];

  if (x == null || nextX == null) return false;
  // Different baselines are a line break the item forgot to flag, and a space
  // is the safe reading — welding two lines into one word is never right.
  if (y != null && nextY != null && Math.abs(y - nextY) > 0.5) return true;

  const gap = nextX - (x + (item.width ?? 0));
  const scale = Math.max(item.height ?? 0, next.height ?? 0, 1);
  return gap > scale * ratio;
}

/** True when the text already ends in whitespace, so no space is owed. */
function endsOpen(text: string): boolean {
  return text === "" || /\s$/.test(text);
}

/** True when the next run supplies its own leading space. */
function startsOpen(str: string): boolean {
  return /^\s/.test(str);
}

// ─── Normalisation ──────────────────────────────────────────────────────────

/**
 * Text flattened for comparison, with the way back.
 *
 * `map[i]` is the offset in the source text that normalised character `i` came
 * from, and `map[text.length]` is the source length — so a normalised range
 * `[a, b)` becomes the source range `[map[a], map[b])`.
 */
export interface NormalizedText {
  text: string;
  map: number[];
}

/**
 * Ligatures, which are one character in the file and several to a reader.
 *
 * A PDF typeset in almost any serif face stores "find" as `ﬁ` + `nd`. Somebody
 * searching for "find" is not going to type U+FB01, and a citation copied out
 * of one build of a paper must still match a build whose fonts differ.
 */
const LIGATURES: Record<string, string> = {
  ﬀ: "ff",
  ﬁ: "fi",
  ﬂ: "fl",
  ﬃ: "ffi",
  ﬄ: "ffl",
  ﬅ: "ft",
  ﬆ: "st",
  Œ: "oe",
  œ: "oe",
  Æ: "ae",
  æ: "ae",
};

/**
 * Punctuation a typesetter changed on the way in.
 *
 * Quoting a sentence containing an apostrophe is the single most common thing
 * anyone does, and the apostrophe in a typeset PDF is U+2019 while the one on
 * the keyboard is U+0027. Folding them together is the difference between
 * "search works" and "search works except on sentences with contractions".
 */
const PUNCTUATION: Record<string, string> = {
  "‘": "'",
  "’": "'",
  "‚": "'",
  "‛": "'",
  "′": "'",
  "“": '"',
  "”": '"',
  "„": '"',
  "‟": '"',
  "″": '"',
  "‐": "-",
  "‑": "-",
  "‒": "-",
  "–": "-",
  "—": "-",
  "―": "-",
  "−": "-",
  "…": "...",
};

/** Characters that carry no meaning and no width. */
const INVISIBLE = /[­​‌‍﻿]/;

/**
 * Flattens text for matching, keeping a map back to where each character came
 * from.
 *
 * The transformations, and why each one is here:
 *
 *   - **Ligatures and typographic punctuation** are folded, because the reader
 *     typing the query has a keyboard and the document had a typesetter.
 *   - **Hyphenation at a line break is rejoined.** A word split as `regu-\nlar`
 *     is one word; leaving it split means no search for "regular" ever finds
 *     the page it is printed on. Only a break *at end of line* is rejoined —
 *     an ordinary hyphen inside `well-known` is left exactly alone.
 *   - **Whitespace collapses to one space.** Column gutters and justified text
 *     produce runs of spaces and newlines that no reader perceives, and that
 *     no reader will reproduce when typing a query.
 *   - **Case is folded**, because nobody searching means it.
 *
 * Everything else is left alone. Normalisation that strips punctuation, or
 * accents, or stop words, makes matches that are not really matches — and this
 * function's output decides where a citation points, so a false match here is
 * a citation that silently points at the wrong sentence. Cautious is correct.
 */
export function normalizeForMatch(source: string): NormalizedText {
  let text = "";
  const map: number[] = [];

  /** Emits `value` as coming from source offset `at`. */
  const push = (value: string, at: number) => {
    for (const character of value) {
      text += character;
      map.push(at);
    }
  };

  let index = 0;
  let pendingSpace = -1;

  while (index < source.length) {
    const character = source[index]!;

    if (INVISIBLE.test(character)) {
      index += 1;
      continue;
    }

    if (isWhitespace(character)) {
      // Remembered rather than emitted, so a run of them costs one space and
      // trailing whitespace costs nothing at all.
      if (pendingSpace === -1) pendingSpace = index;
      index += 1;
      continue;
    }

    const dash = PUNCTUATION[character] === "-" || character === "-";
    if (dash && pendingSpace === -1) {
      const joined = skipLineHyphen(source, index);
      if (joined !== -1) {
        // A word broken across a line: drop the hyphen and the break, and
        // carry on with the rest of the word as though it were never split.
        index = joined;
        continue;
      }
    }

    if (pendingSpace !== -1) {
      // A space is only worth emitting once something follows it.
      if (text !== "") push(" ", pendingSpace);
      pendingSpace = -1;
    }

    const expanded = LIGATURES[character] ?? PUNCTUATION[character] ?? character;
    push(expanded.toLowerCase(), index);
    index += 1;
  }

  map.push(source.length);
  return { text, map };
}

/**
 * If `index` is a hyphen ending a line, returns the offset of the first
 * character of the word's continuation. Otherwise -1.
 *
 * The continuation must be a letter, and the break must contain an actual
 * newline: `end-\nof line` is hyphenation, `a - b` is a dash between words and
 * `foo-bar` is a compound. Getting this wrong in the permissive direction
 * welds unrelated words together, so the test is strict.
 */
function skipLineHyphen(source: string, index: number): number {
  let cursor = index + 1;
  let sawNewline = false;

  while (cursor < source.length) {
    const character = source[cursor]!;
    if (character === "\n" || character === "\r") {
      sawNewline = true;
      cursor += 1;
      continue;
    }
    if (isWhitespace(character) || INVISIBLE.test(character)) {
      cursor += 1;
      continue;
    }
    break;
  }

  if (!sawNewline || cursor >= source.length) return -1;
  return /\p{L}/u.test(source[cursor]!) ? cursor : -1;
}

function isWhitespace(character: string): boolean {
  return /\s/.test(character) || character === " ";
}

/**
 * Maps a range in normalised text back to the source.
 *
 * `end` reads `map[end]` rather than `map[end - 1] + 1`: the last normalised
 * character may have come from a source character that expanded into several
 * — `ﬁ` is one character and two — and adding one to its start would cut the
 * highlight through the middle of a glyph.
 */
export function toSourceRange(
  normalized: NormalizedText,
  start: number,
  end: number,
): [number, number] {
  const from = normalized.map[start] ?? 0;
  const to = normalized.map[end] ?? normalized.map[normalized.map.length - 1] ?? from;
  return [from, Math.max(from, to)];
}

/**
 * The rectangles covering a character range, in PDF points.
 *
 * One rectangle per run the range touches, clipped to the part actually
 * covered — a highlight over half a run should cover half of it, which means
 * assuming the run's characters are evenly spaced. They are not, quite, but
 * the alternative is measuring every glyph, and the error is smaller than the
 * padding a highlight is drawn with.
 */
export function rectsForRange(
  pageText: PdfPageText,
  start: number,
  end: number,
): { x: number; y: number; width: number; height: number }[] {
  // An empty range covers nothing. Without this, a collapsed selection — a
  // caret rather than a highlight — produced a zero-width rectangle on every
  // run it touched, which draws as a stray line down the page.
  if (end <= start) return [];

  const rects: { x: number; y: number; width: number; height: number }[] = [];

  for (const run of pageText.runs) {
    if (run.end <= start || run.start >= end) continue;

    const length = run.end - run.start;
    if (length <= 0) continue;

    const from = Math.max(start, run.start) - run.start;
    const to = Math.min(end, run.end) - run.start;
    const unit = run.width / length;

    rects.push({
      x: run.x + unit * from,
      y: run.y,
      width: Math.max(unit * (to - from), 0),
      height: run.height,
    });
  }

  return rects;
}
