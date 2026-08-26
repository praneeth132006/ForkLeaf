import { isRelativeLink, resolveFromNote } from "./relocate";

/**
 * Every repository path a note's text points at.
 *
 * Shared rather than written twice, because both callers are deciding whether
 * a file is safe to delete and they have to agree. The scan that tidies up
 * unused images used the thorough version; `deleteNote` used a one-line regex
 * that saw `![](x.png)` and nothing else — so a note whose screenshots were
 * written as `<img src="…">` had them counted as unused, and a note holding
 * the only remaining reference to a picture did not count as holding it at
 * all. Both are the same question and there is only one right answer to it.
 *
 * All the forms a note can carry a reference in, because missing one is how a
 * file somebody is still using gets deleted:
 *
 *   - `![alt](path "title")`, the markdown image
 *   - `[text](path)`, a plain link, which is what a link *to* a picture is
 *   - `<img src="path">`, which markdown permits and pasted notes arrive with
 *   - `[label]: path`, a reference definition
 *
 * Absolute URLs and anything outside the repository are ignored: they are not
 * ours and cannot be deleted by us.
 */
export function referencedPaths(notePath: string, content: string): string[] {
  const found = new Set<string>();

  const add = (src: string | undefined) => {
    if (!src) return;
    // `<path>` is a legal markdown destination, and a title may follow the
    // path — neither is part of the file name.
    const trimmed = src.trim().replace(/^<|>$/g, "").split(/\s+/)[0];
    if (!trimmed || !isRelativeLink(trimmed)) return;
    found.add(resolveFromNote(notePath, trimmed));
  };

  for (const match of content.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) add(match[1]);

  for (const match of content.matchAll(/<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/gi)) {
    add(match[1]);
  }

  for (const match of content.matchAll(/^\s*\[[^\]]+\]:\s*(\S+)/gm)) add(match[1]);

  return [...found];
}
