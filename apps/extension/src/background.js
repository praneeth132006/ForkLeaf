// @ts-check
/* global chrome */

import { extractPage } from "./extract.js";
import { highlightPage } from "./highlight.js";
import { pageKey, remember } from "./highlight-store.js";
import { requestForMenu, requestForPage } from "./requests.js";
import { DEFAULT_ORIGIN, isSavableUrl, normaliseOrigin, saveUrl } from "./save-url.js";

/**
 * The extension's only running part.
 *
 * Every path ends the same way: a new tab on ForkLeaf's save address, where
 * ForkLeaf shows what will be saved and asks. Nothing is written from here.
 */

const MENUS = [
  { id: "page", title: "Save page to ForkLeaf", contexts: ["page"] },
  { id: "quote", title: "Save selection to ForkLeaf", contexts: ["selection"] },
  { id: "highlight", title: "Highlight and save to ForkLeaf", contexts: ["selection"] },
  { id: "show-highlights", title: "Show my ForkLeaf highlights here", contexts: ["page"] },
  { id: "link", title: "Save link to ForkLeaf", contexts: ["link"] },
  { id: "image", title: "Save image to ForkLeaf", contexts: ["image"] },
];

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    for (const menu of MENUS) chrome.contextMenus.create(menu);
  });
});

async function forkleafOrigin() {
  const stored = await chrome.storage.sync.get("origin");
  return normaliseOrigin(stored.origin) ?? DEFAULT_ORIGIN;
}

/** @param {chrome.tabs.Tab | undefined} tab */
async function readPage(tab) {
  if (!tab?.id || !isSavableUrl(tab.url)) return null;
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractPage,
    });
    return result?.result ?? null;
  } catch {
    // The browser's own pages, the web store and some PDF viewers refuse
    // scripts. The tab's address is still worth saving as a link.
    return null;
  }
}

/** @param {import("./save-url.js").SaveRequest | null} request */
async function open(request) {
  if (!request) return;
  await chrome.tabs.create({ url: saveUrl(await forkleafOrigin(), request) });
}

/** @param {string | null | undefined} url */
async function storedHighlights(url) {
  const key = pageKey(url);
  if (!key) return { key: null, texts: /** @type {string[]} */ ([]) };
  const stored = await chrome.storage.local.get(key);
  return { key, texts: remember(stored[key], "") };
}

/**
 * Runs the highlighter in the tab: marks the selection when asked, and shows
 * every highlight remembered for the page.
 *
 * @param {chrome.tabs.Tab | undefined} tab
 * @param {string[]} texts
 * @param {boolean} markSelection
 */
async function paint(tab, texts, markSelection) {
  if (!tab?.id) return { marked: "", shown: 0 };
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: highlightPage,
      args: [texts, markSelection],
    });
    return result?.result ?? { marked: "", shown: 0 };
  } catch {
    // A page that refuses scripts cannot be marked; the save still works.
    return { marked: "", shown: 0 };
  }
}

/** @param {chrome.tabs.Tab | undefined} tab @param {number} count */
async function badge(tab, count) {
  if (!tab?.id) return;
  await chrome.action.setBadgeText({ tabId: tab.id, text: count > 0 ? String(count) : "" });
}

chrome.action.onClicked.addListener(async (tab) => {
  await open(requestForPage(await readPage(tab), tab));
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "show-highlights") {
    const { texts } = await storedHighlights(tab?.url);
    const { shown } = await paint(tab, texts, false);
    await badge(tab, shown);
    return;
  }

  if (info.menuItemId === "highlight") {
    const page = await readPage(tab);
    // Kept under the address in the tab, which is what "show" looks up on
    // the next visit — not the canonical address the save is filed under.
    const { key, texts } = await storedHighlights(tab?.url);
    const { marked } = await paint(tab, [], true);
    const request = requestForMenu(info, tab, page, marked);
    if (!request) return;
    if (key) {
      const next = remember(texts, request.text ?? "");
      await chrome.storage.local.set({ [key]: next });
      await badge(tab, next.length);
    }
    await open(request);
    return;
  }

  const needsPage = info.menuItemId === "page" || info.menuItemId === "quote";
  await open(requestForMenu(info, tab, needsPage ? await readPage(tab) : null));
});
