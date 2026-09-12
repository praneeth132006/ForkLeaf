// @ts-check
/* global chrome */

import { extractPage } from "./extract.js";
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

chrome.action.onClicked.addListener(async (tab) => {
  await open(requestForPage(await readPage(tab), tab));
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const needsPage = info.menuItemId === "page" || info.menuItemId === "quote";
  await open(requestForMenu(info, tab, needsPage ? await readPage(tab) : null));
});
