import { isRelativeLink, resolveFromNote } from "@forkleaf/markdown-engine";
import { imageTypeFor } from "@/lib/media";

/**
 * Finding images no note uses any more.
 *
 * Deleting a folder used to remove its notes and leave the pictures they used
 * in an `assets` directory beside them. That is fixed at the source now, but
 * every repository that was ever used by the broken version is still carrying
 * the leftovers — and with no note left in the folder, nothing in the sidebar
 * can reach them. This is how they get found and removed.
 *
 * The rule is deliberately narrow, because the failure mode is deleting a
 * picture somebody is still using:
 *
 *   - Only files this app would have written: images, by extension. A
 *     repository holds licences, source code and configuration, and none of
 *     that is ours to tidy up on somebody's behalf.
 *   - Only files no note refers to, where "every note" means every note in the
 *     repository, not the ones that happen to be cached on this device.
 *   - Nothing at all if a single note could not be read. A note whose text is
 *     unavailable is a note whose images cannot be accounted for, and a scan
 *     that quietly skipped it would report the pictures it uses as unused.
 */

/** An image in the repository that no note links to. */
export interface OrphanAsset {
  path: string;
  /** Bytes, when the tree reported a size. */
  size: number | null;
}

/**
 * Every repository path a note's markdown points at.
 *
 * Both image syntaxes, because a screenshot pasted into a note is written as
 * `![](…)` while one someone linked by hand may be `<img src="…">` — and a
 * plain `[text](…)` link to a picture counts too. Missing one of those is how
 * a scan deletes a file that is genuinely in use.
 */
export function referencedPaths(notePath: string, content: string): string[] {
  const found = new Set<string>();

  const add = (src: string | undefined) => {
    if (!src) return;
    const trimmed = src.trim().replace(/^<|>$/g, "").split(/\s+/)[0];
    if (!trimmed || !isRelativeLink(trimmed)) return;
    found.add(resolveFromNote(notePath, trimmed));
  };

  // ![alt](path "title") and [text](path), the markdown forms.
  for (const match of content.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) add(match[1]);

  // <img src="path">, which markdown permits and some notes arrive with.
  for (const match of content.matchAll(/<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/gi)) {
    add(match[1]);
  }

  // Reference definitions: [label]: path
  for (const match of content.matchAll(/^\s*\[[^\]]+\]:\s*(\S+)/gm)) add(match[1]);

  return [...found];
}

/**
 * The images in `files` that none of `notes` refers to.
 *
 * `notes` maps every note's path to its text. It must be *every* note — the
 * caller is responsible for that, and for not calling this at all if one of
 * them could not be read.
 */
export function findOrphanAssets(
  files: readonly { path: string; size?: number | null }[],
  notes: ReadonlyMap<string, string>,
): OrphanAsset[] {
  const used = new Set<string>();
  for (const [notePath, content] of notes) {
    for (const path of referencedPaths(notePath, content)) used.add(path);
  }

  return files
    .filter((file) => {
      // Images only. Everything else in a repository belongs to somebody else.
      if (!imageTypeFor(file.path)) return false;
      // A note is never an orphan, whatever it is called.
      if (/\.mdx?$/i.test(file.path)) return false;
      return !used.has(file.path);
    })
    .map((file) => ({ path: file.path, size: file.size ?? null }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

/** "1.4 MB", for telling somebody what they are about to reclaim. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
