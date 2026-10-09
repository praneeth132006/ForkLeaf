// @ts-check

/**
 * The highlights the extension remembers, per page.
 *
 * Kept in the browser's own extension storage, which only this extension can
 * read, so a highlight can be shown again on the next visit without asking
 * ForkLeaf — or anything else — what was highlighted where. The notebook keeps
 * its own copy, in the page's note in `forkleaf-saves`.
 */

/** How many highlights one page keeps; the oldest go first beyond this. */
export const MAX_PER_PAGE = 200;

/**
 * The key a page's highlights are kept under.
 *
 * Without the `#fragment`, which names a place on the page rather than a
 * different page: a highlight made after following a link to a heading still
 * belongs to the article.
 *
 * @param {string | null | undefined} url
 * @returns {string | null}
 */
export function pageKey(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    parsed.hash = "";
    return `highlights:${parsed.href}`;
  } catch {
    return null;
  }
}

/**
 * The list with one more highlight in it, unless it is already there.
 *
 * @param {unknown} stored What storage held, which may be anything.
 * @param {string} text
 * @returns {string[]}
 */
export function remember(stored, text) {
  const list = Array.isArray(stored)
    ? stored.filter((item) => typeof item === "string" && item.trim())
    : [];
  const levelled = text.replace(/\s+/g, " ").trim();
  if (!levelled || list.includes(levelled)) return list;
  return [...list, levelled].slice(-MAX_PER_PAGE);
}
