"use client";

import { isRepoRelative, resolveAgainstNote } from "@/lib/assets";

/**
 * Finding one picture inside the note that uses it, and saying so on screen.
 *
 * "Find" used to open the note and stop there. In a note of any length that
 * leaves somebody scrolling for a screenshot they have been told is too big to
 * push, which is the same "I cannot find those images" the button was added to
 * answer — moved one step later.
 *
 * The image itself is what has to be pointed at, so this looks for it in the
 * rendered note and marks it.
 */

/** How long the marker stays on. Long enough to find, short enough to leave. */
export const REVEAL_MS = 2600;

/** The class the flash is drawn with. Defined in `globals.css`. */
export const REVEAL_CLASS = "fl-reveal";

export type RevealOutcome = "revealed" | "not-rendered";

/**
 * Marks the image at `assetPath` inside `root`, and scrolls it into view.
 *
 * Two ways of recognising it, because the two surfaces that draw a note write
 * the `<img>` differently:
 *
 *   - The rich editor keeps the document's own `src` in `data-src` and puts
 *     the loadable URL in `src`, so the path as the markdown writes it is
 *     still there to be resolved against the note.
 *   - The preview renders through the markdown pipeline, which rewrites `src`
 *     and keeps no copy of the original — so there it is matched on the
 *     resolved URL instead, which the caller already knows how to compute.
 *
 * Matching on both rather than picking one means neither surface has to grow a
 * new attribute to be searchable, and an image that resolves to itself — a
 * note with an absolute URL in it — still matches by the first route.
 *
 * Returns `not-rendered` when there is no such `<img>` on screen. That is not
 * a failure to find the note: raw markdown view draws no images at all, and
 * saying so beats silently doing nothing.
 */
export function revealAsset(options: {
  root: HTMLElement | null;
  notePath: string;
  assetPath: string;
  /** The URL the app's own resolver produces for `assetPath`, when it has one. */
  resolvedSrc?: string | null;
}): RevealOutcome {
  const { root, notePath, assetPath, resolvedSrc } = options;
  if (!root) return "not-rendered";

  const image = [...root.querySelectorAll("img")].find((candidate) =>
    matches(candidate, notePath, assetPath, resolvedSrc),
  );
  if (!image) return "not-rendered";

  // `center` rather than `nearest`: an image that is technically on screen but
  // half under the toolbar has not been found for you.
  image.scrollIntoView?.({ block: "center", behavior: "smooth" });
  flash(image);

  return "revealed";
}

function matches(
  image: HTMLImageElement,
  notePath: string,
  assetPath: string,
  resolvedSrc?: string | null,
): boolean {
  // What the markdown says, where it survived rendering.
  const written = image.getAttribute("data-src");
  if (written && isRepoRelative(written) && resolveAgainstNote(notePath, written) === assetPath) {
    return true;
  }

  // `getAttribute`, not `image.src`: the property resolves against the page's
  // own origin, so a note-relative `assets/chart.png` comes back as
  // `http://localhost/assets/chart.png` and matches nothing.
  const src = image.getAttribute("src");
  if (!src) return false;

  if (resolvedSrc && src === resolvedSrc) return true;
  return !written && isRepoRelative(src) && resolveAgainstNote(notePath, src) === assetPath;
}

/**
 * Adds the marker, and takes it off again.
 *
 * Removed on a timer rather than left for the next render to clear: the rich
 * editor reuses an image's DOM node for as long as the node itself does not
 * change, so a class put on it stays until something takes it off.
 */
function flash(image: HTMLImageElement): void {
  image.classList.remove(REVEAL_CLASS);
  // Reading a layout property between the two forces the removal to take
  // effect, so a second Find on the same image restarts the animation rather
  // than doing nothing visible.
  void image.offsetWidth;
  image.classList.add(REVEAL_CLASS);

  window.setTimeout(() => image.classList.remove(REVEAL_CLASS), REVEAL_MS);
}
