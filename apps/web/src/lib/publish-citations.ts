import type { RepoRef } from "@forkleaf/types";
import { resolveAgainstNote } from "@/lib/assets";
import { isPdfPath } from "@/lib/media";

/**
 * Publishing your reading, not just your notes.
 *
 * A note written from a paper is commentary with the passages set into it, each
 * one linked back to the page it came from — which is the thing actually worth
 * sharing. Not "here is a PDF", and not "here is an opinion", but the argument
 * with its receipts attached.
 *
 * It did not survive publishing. A citation is written relative to the note —
 * `../papers/attention.pdf#page=12` — which is right in the repository and
 * wrong on a published page: GitHub Pages serves the `docs/` folder, so a link
 * pointing above it reaches nothing at all. Every quotation on a published
 * reading page was a dead link, silently, which is worse than no link because
 * it looks like there is a source behind it.
 *
 * So the links are rewritten on the way out, to the document where a reader
 * can actually reach it. The fragment goes with them untouched: it is the
 * standard `#page=` every reader has understood for twenty years plus the
 * quotation, so it still opens the right page, and anything that knows the
 * format can still find the right sentence.
 *
 * Only the published copy is rewritten. The note in the repository keeps its
 * relative links, because that is what makes it readable on github.com, in
 * another editor, and by this app.
 */

/** Markdown inline links, minus images: `![alt](x.pdf)` is not a citation. */
const LINK = /(?<!!)\[((?:[^[\]\\]|\\.)*)\]\(([^()\s]+)\)/g;

export function linkDocuments(
  markdown: string,
  options: { notePath: string; repo: RepoRef },
): string {
  return markdown.replace(LINK, (whole, label: string, href: string) => {
    const [path, fragment = ""] = splitFragment(href);
    if (!path || !isRelative(path) || !isPdfPath(path)) return whole;

    const inRepo = resolveAgainstNote(options.notePath, path);
    return `[${label}](${documentUrl(options.repo, inRepo)}${fragment ? `#${fragment}` : ""})`;
  });
}

/**
 * Where a reader can see the document itself.
 *
 * github.com rather than `raw.githubusercontent.com`: raw serves a PDF as
 * something to download, and a reader who followed a citation wanted to *read*
 * the page, not to end up with a file in their downloads folder. The blob page
 * shows it in a viewer, and for a private repository it at least says plainly
 * that this is a document they cannot see — which a 404 from raw does not.
 */
export function documentUrl(repo: RepoRef, path: string): string {
  const full = repo.directory ? `${repo.directory}/${path}` : path;
  const encoded = full
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `https://github.com/${repo.owner}/${repo.repo}/blob/${encodeURIComponent(repo.branch)}/${encoded}`;
}

/** True when a note is naming a file of its own rather than somewhere else. */
function isRelative(path: string): boolean {
  return !/^[a-z][a-z0-9+.-]*:/i.test(path) && !path.startsWith("//") && !path.startsWith("/");
}

function splitFragment(href: string): [path: string, fragment: string] {
  const hash = href.indexOf("#");
  return hash === -1 ? [href, ""] : [href.slice(0, hash), href.slice(hash + 1)];
}
