// @ts-check

/**
 * The address that hands something to ForkLeaf.
 *
 * The extension never writes to anybody's notebook itself. It opens ForkLeaf
 * at `/save?…`, the same address the phone's share sheet and the
 * bookmarklet use, and ForkLeaf shows what will be saved and asks. So the
 * extension holds no token, needs no sign-in of its own, and cannot write
 * anything the person has not seen.
 */

export const DEFAULT_ORIGIN = "https://forkleaf.vercel.app";

/**
 * Longest address the extension will open.
 *
 * Servers commonly refuse request lines past 8 KB. A long selection is cut to
 * fit rather than producing an address that fails to load at all.
 */
export const MAX_URL_LENGTH = 8000;

const LIMITS = { title: 300, url: 2048 };

/** @param {string | null | undefined} value */
export function isSavableUrl(value) {
  if (!value || value.length > LIMITS.url) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * Where ForkLeaf is, from what somebody typed in the options.
 *
 * HTTPS, or plain HTTP only for a copy running on this machine — the save
 * address carries the words being saved, and they should not cross a network
 * unencrypted.
 *
 * @param {unknown} input
 * @returns {string | null}
 */
export function normaliseOrigin(input) {
  if (typeof input !== "string" || !input.trim()) return null;
  try {
    const url = new URL(input.trim());
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol === "https:" || (url.protocol === "http:" && local)) return url.origin;
    return null;
  } catch {
    return null;
  }
}

/**
 * @typedef {{ kind: "page" | "quote" | "link" | "image", url?: string | null, title?: string, text?: string }} SaveRequest
 */

/**
 * @param {string} origin
 * @param {SaveRequest} request
 * @returns {string}
 */
export function saveUrl(origin, request) {
  const params = new URLSearchParams({ save: "1", kind: request.kind });
  if (request.url && isSavableUrl(request.url)) params.set("url", request.url);
  const title = (request.title ?? "").trim().slice(0, LIMITS.title);
  if (title) params.set("title", title);

  const base = `${origin}/save?${params.toString()}`;
  let text = (request.text ?? "").trim();
  if (!text) return base;

  // Cut the words, not the address: find the longest prefix that still fits
  // once encoded, and mark that it was cut.
  const room = MAX_URL_LENGTH - base.length - "&text=".length;
  if (encodeURIComponent(text).length > room) {
    let low = 0;
    let high = text.length;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (encodeURIComponent(`${text.slice(0, middle)}…`).length <= room) low = middle;
      else high = middle - 1;
    }
    text = low > 0 ? `${text.slice(0, low)}…` : "";
  }
  return text ? `${base}&text=${encodeURIComponent(text)}` : base;
}
