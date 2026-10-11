import { MAX_PASSAGE } from "@forkleaf/github-client";
import { plainText } from "@/lib/mind";

/**
 * A passage of a note, held by its words.
 *
 * A thread about a passage records the text that was selected, not a
 * position: positions move with every edit above them, while the words stay
 * put until somebody rewrites them — and when they do, the thread should say
 * so rather than quietly point at whatever moved into the old place.
 *
 * Matching is on the words with whitespace collapsed, so a passage selected in
 * rich text (one space, no line breaks) is found again in the source view, in
 * the preview, and after the paragraph is re-wrapped.
 */

const collapse = (text: string) => text.replace(/\s+/g, " ").trim();

/**
 * A selection made fit to quote: one line of words, at most MAX_PASSAGE
 * characters, cut at a word boundary. Null when there is nothing to quote.
 */
export function quoteFromSelection(text: string): string | null {
  const flat = collapse(text);
  if (flat.length < 2) return null;
  if (flat.length <= MAX_PASSAGE) return flat;
  const cut = flat.slice(0, MAX_PASSAGE);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > MAX_PASSAGE / 2 ? cut.slice(0, lastSpace) : cut).trim();
}

/** Whether a passage's words are still in the note, or have been rewritten. */
export function passageStatus(noteMarkdown: string, quote: string): "here" | "changed" {
  const words = collapse(quote);
  if (!words) return "changed";
  // Both the rendered text and the raw text: a passage selected in the
  // source view may carry `**` and `[[`, one selected in rich text will not.
  return collapse(plainText(noteMarkdown)).includes(collapse(plainText(words))) ||
    collapse(noteMarkdown).includes(words)
    ? "here"
    : "changed";
}

/**
 * The range of `root`'s text that reads as `quote`, whitespace aside — for
 * showing a passage in whichever view the note is open in. Null when the
 * words are not on the page.
 */
export function findQuoteRange(root: Node, quote: string): Range | null {
  const target = collapse(quote);
  if (!target) return null;

  const doc = root.ownerDocument ?? (root as Document);
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);

  // The page's text with whitespace collapsed, and for every character of it
  // the text node and offset it came from.
  let text = "";
  const at: { node: Text; offset: number }[] = [];
  let lastWasSpace = true;
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const value = node.data;
    for (let i = 0; i < value.length; i += 1) {
      const space = /\s/.test(value[i]!);
      if (space && lastWasSpace) continue;
      text += space ? " " : value[i];
      at.push({ node, offset: i });
      lastWasSpace = space;
    }
    // Separate blocks read as separate words even when the DOM has no space.
    if (!lastWasSpace) {
      text += " ";
      at.push({ node, offset: value.length });
      lastWasSpace = true;
    }
  }

  const index = text.indexOf(target);
  if (index < 0) return null;

  const start = at[index]!;
  const end = at[index + target.length - 1]!;
  const range = doc.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, Math.min(end.offset + 1, end.node.data.length));
  return range;
}
