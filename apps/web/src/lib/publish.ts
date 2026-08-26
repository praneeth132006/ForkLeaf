import "server-only";
import { ApiError } from "@/lib/api-helpers";

/**
 * Where published pages live, and what they may be called.
 *
 * Its own module rather than living in the route, because a Next route file
 * may only export HTTP methods — and this is the one part of publishing worth
 * testing directly: it turns a note's name into a path in somebody's
 * repository and a segment of a public URL.
 */

/** GitHub Pages serves either the repository root or `/docs`. */
export const PUBLISH_DIR = "docs";

/**
 * `docs/<slug>.html`, with the slug constrained rather than sanitised.
 *
 * An allowlist, not an escape. Escaping asks "have I thought of every
 * character that could hurt here"; an allowlist asks "which characters do I
 * actually need", which is a question with a short and checkable answer. The
 * failure mode of getting it subtly wrong is writing over a file in a
 * repository the user meant to keep.
 */
export function pagePath(slug: string | undefined): string {
  // Checked as given, not after normalising. Normalising first would quietly
  // turn `../index` into `index` and publish it — a rewrite nobody asked for,
  // to an address the note is not called. A slug that is not already a plain
  // name is a bug or an attack, and either deserves an error.
  const cleaned = (slug ?? "").toLowerCase();

  if (!/^[a-z0-9][a-z0-9._-]{0,80}$/.test(cleaned)) {
    throw new ApiError(400, "validation", "That note's name cannot be used as a page address.");
  }

  return `${PUBLISH_DIR}/${cleaned}.html`;
}

/** The public address of one published page under a Pages site. */
export function pageUrl(siteUrl: string, slug: string): string {
  return `${siteUrl.replace(/\/$/, "")}/${slug.toLowerCase()}.html`;
}

/**
 * The slug behind a published page's filename, or null if it is not one.
 *
 * `docs/` is an ordinary folder that people put ordinary things in — a README,
 * a stylesheet, a hand-written site. Only the `.html` files whose stem is a
 * slug this app would itself have produced are reported as published pages, so
 * listing what ForkLeaf published can never offer to unpublish something it
 * did not write.
 */
export function slugOfPage(filename: string): string | null {
  const match = /^([a-z0-9][a-z0-9._-]{0,80})\.html$/.exec(filename.toLowerCase());
  return match ? match[1]! : null;
}
