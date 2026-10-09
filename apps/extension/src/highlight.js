// @ts-check

/**
 * Marks text on the page as highlighted, inside the page.
 *
 * Like `extractPage`, this is sent into the tab by
 * `chrome.scripting.executeScript`, which serialises its source — so it stands
 * alone: no imports, and no helpers from outside its own body.
 *
 * It does two things, because both need the same wrapping code and a function
 * sent into a tab cannot share code with another:
 *
 * - with `markSelection`, it wraps whatever is selected and returns those
 *   words, so the new highlight can be remembered and saved;
 * - for each of `texts`, it finds those words on the page and wraps them, so
 *   highlights made on an earlier visit are shown again.
 *
 * Words are matched with whitespace levelled, because a page's markup puts
 * line breaks and indentation where the reader sees a single space, and across
 * element boundaries, because a highlight that runs into a link or a bold word
 * is still one highlight. Nothing is sent anywhere from here; the page only
 * changes how it looks until it is reloaded.
 *
 * @param {string[]} texts Highlights to show again.
 * @param {boolean} markSelection Whether to highlight the current selection.
 * @returns {{ marked: string, shown: number }}
 */
export function highlightPage(texts, markSelection) {
  const CLASS = "forkleaf-highlight";
  const STYLE_ID = "forkleaf-highlight-style";

  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `mark.${CLASS} { background: #fde68a; color: inherit; border-radius: 2px; padding: 0 1px; box-shadow: 0 0 0 1px #f59e0b55; }`;
    (document.head || document.documentElement).appendChild(style);
  }

  /** @param {Node} node */
  const skip = (node) => {
    const parent = node.parentElement;
    if (!parent) return true;
    if (parent.closest(`mark.${CLASS}`)) return true;
    return /^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|INPUT|SELECT|OPTION)$/.test(parent.tagName);
  };

  /** Every visible text node under the body, in reading order. */
  const textNodes = () => {
    /** @type {Text[]} */
    const nodes = [];
    if (!document.body) return nodes;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.nodeValue && !skip(node)) nodes.push(/** @type {Text} */ (node));
    }
    return nodes;
  };

  /**
   * Wraps characters `start` to `end` of one text node in a mark.
   *
   * @param {Text} node
   * @param {number} start
   * @param {number} end
   */
  const wrap = (node, start, end) => {
    if (end <= start) return;
    let target = node;
    if (start > 0) target = target.splitText(start);
    if (end - start < (target.nodeValue ?? "").length) target.splitText(end - start);
    if (!(target.nodeValue ?? "").trim()) return;
    const mark = document.createElement("mark");
    mark.className = CLASS;
    target.parentNode?.insertBefore(mark, target);
    mark.appendChild(target);
  };

  /** @param {string} text */
  const level = (text) => text.replace(/\s+/g, " ").trim();

  let marked = "";
  if (markSelection) {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
      marked = level(String(selection)).slice(0, 20000);
      const range = selection.getRangeAt(0);
      /** @type {{ node: Text, start: number, end: number }[]} */
      const pieces = [];
      for (const node of textNodes()) {
        if (!range.intersectsNode(node)) continue;
        const length = (node.nodeValue ?? "").length;
        const start = node === range.startContainer ? range.startOffset : 0;
        const end = node === range.endContainer ? range.endOffset : length;
        pieces.push({ node, start, end });
      }
      // Back to front, so splitting one node never moves the next piece.
      for (const piece of pieces.reverse()) wrap(piece.node, piece.start, piece.end);
      selection.removeAllRanges();
    }
  }

  let shown = 0;
  for (const wanted of texts) {
    const needle = level(wanted).toLowerCase();
    if (!needle) continue;

    // The page's words as one string with whitespace levelled, and for each
    // character of it, the text node and offset it came from.
    const nodes = textNodes();
    let flat = "";
    /** @type {{ node: Text, offset: number }[]} */
    const origin = [];
    let lastWasSpace = true;
    for (const node of nodes) {
      const value = node.nodeValue ?? "";
      for (let offset = 0; offset < value.length; offset += 1) {
        const space = /\s/.test(value[offset] ?? "");
        if (space && lastWasSpace) continue;
        flat += space ? " " : (value[offset] ?? "").toLowerCase();
        origin.push({ node, offset });
        lastWasSpace = space;
      }
    }

    const at = flat.indexOf(needle);
    if (at === -1) continue;
    const first = origin[at];
    const last = origin[at + needle.length - 1];
    if (!first || !last) continue;

    /** @type {{ node: Text, start: number, end: number }[]} */
    const pieces = [];
    let inside = false;
    for (const node of nodes) {
      if (node === first.node) inside = true;
      if (!inside) continue;
      const start = node === first.node ? first.offset : 0;
      const end = node === last.node ? last.offset + 1 : (node.nodeValue ?? "").length;
      pieces.push({ node, start, end });
      if (node === last.node) break;
    }
    for (const piece of pieces.reverse()) wrap(piece.node, piece.start, piece.end);
    shown += 1;
  }

  return { marked, shown };
}
