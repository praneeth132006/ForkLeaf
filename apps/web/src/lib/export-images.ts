"use client";

import type { ImageResolver } from "@forkleaf/exporter";
import type { Workspace } from "@forkleaf/types";
import { resolveImageSrc } from "@/lib/assets";

/**
 * Making an exported file carry its pictures.
 *
 * A note refers to an image the way a hand-written markdown file does — by a
 * relative path like `../assets/chart.png`. That is deliberately portable and
 * deliberately not a URL, which is fine inside the app, where
 * `resolveImageSrc` turns it into a blob URL or a same-origin proxy address.
 *
 * It is not fine in anything that leaves: a standalone HTML file resolves the
 * path against wherever it was saved, and the PDF print frame resolves it
 * against a blank document. Either way the browser fetches nothing and draws a
 * broken-image icon, which is why every image was missing from every exported
 * PDF. So for an export the bytes have to travel with the document, as a
 * `data:` URL.
 *
 * Only this layer can do it. The exporter package has no idea whether an image
 * lives in IndexedDB or behind an authenticated proxy, and it should not: it
 * takes a resolver and asks.
 */

/** Anything already self-contained or absolute is left exactly as it is. */
function needsInlining(src: string): boolean {
  return !/^(data:|https?:|blob:)/i.test(src);
}

/**
 * Reads a blob into a `data:` URL.
 *
 * FileReader rather than manual base64: the manual loop overflows the call
 * stack on anything above a megabyte or so, which is most screenshots.
 */
function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("That image could not be read."));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(blob);
  });
}

/**
 * Builds the resolver for one note.
 *
 * Returns null for anything it cannot fetch rather than throwing, so a single
 * missing image leaves its path in place and the rest of the document is still
 * produced. An export that fails outright because one screenshot was pruned
 * from local storage would be a worse outcome than one gap.
 */
export function exportImageResolver(
  workspace: Workspace | null,
  notePath: string | null,
  assetUrls: Readonly<Record<string, string>>,
): ImageResolver {
  return async (src: string) => {
    if (!src || !needsInlining(src)) return null;

    // The same resolution the editor uses, so an image that renders on screen
    // is exactly the image that lands in the file.
    const resolved = resolveImageSrc(workspace, notePath, src, assetUrls);
    if (!resolved || resolved === src) return null;
    if (resolved.startsWith("data:")) return resolved;

    const response = await fetch(resolved);
    if (!response.ok) return null;

    return toDataUrl(await response.blob());
  };
}
