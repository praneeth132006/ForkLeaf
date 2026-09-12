// @ts-check

import { isSavableUrl } from "./save-url.js";

/**
 * What to save, for each way of asking.
 *
 * Kept apart from the background worker so the decisions can be tested
 * without a browser: the worker only gathers `info`, `tab` and the page's own
 * description, and opens whatever this returns.
 *
 * @typedef {import("./save-url.js").SaveRequest} SaveRequest
 * @typedef {{ url: string, title: string, description: string, selection: string }} Page
 * @typedef {{ url?: string, title?: string }} TabLike
 * @typedef {{ menuItemId?: string | number, pageUrl?: string, linkUrl?: string, srcUrl?: string, selectionText?: string }} MenuInfo
 */

/**
 * The toolbar button, the keyboard shortcut and "Save page": the selection as
 * a quote when there is one, otherwise the page. Without the page's own
 * description (a browser page, a PDF viewer), the tab's address still works.
 *
 * @param {Page | null} page
 * @param {TabLike | undefined} tab
 * @returns {SaveRequest | null}
 */
export function requestForPage(page, tab) {
  if (page && isSavableUrl(page.url)) {
    return page.selection
      ? { kind: "quote", url: page.url, title: page.title, text: page.selection }
      : { kind: "page", url: page.url, title: page.title, text: page.description };
  }
  if (tab?.url && isSavableUrl(tab.url)) {
    return { kind: "link", url: tab.url, title: tab.title ?? "", text: "" };
  }
  return null;
}

/**
 * A right-click menu item.
 *
 * @param {MenuInfo} info
 * @param {TabLike | undefined} tab
 * @param {Page | null} page
 * @returns {SaveRequest | null}
 */
export function requestForMenu(info, tab, page) {
  switch (info.menuItemId) {
    case "quote": {
      // The page's own reading of the selection keeps its line breaks, which
      // the menu's `selectionText` flattens into one line.
      const text = page?.selection || info.selectionText || "";
      const url = page?.url ?? info.pageUrl ?? tab?.url ?? "";
      if (!text || !isSavableUrl(url)) return null;
      return { kind: "quote", url, title: page?.title || tab?.title || "", text };
    }
    case "link":
      return isSavableUrl(info.linkUrl)
        ? { kind: "link", url: info.linkUrl, title: info.selectionText ?? "", text: "" }
        : null;
    case "image":
      // A `data:` or `blob:` image has no address to keep.
      return isSavableUrl(info.srcUrl)
        ? { kind: "image", url: info.srcUrl, title: page?.title || tab?.title || "", text: "" }
        : null;
    default:
      return requestForPage(page, tab);
  }
}
