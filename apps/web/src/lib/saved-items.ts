import type { MindItem } from "@/lib/mind";
import type { SavedEntry } from "@/lib/saves";

/**
 * Saves from the `forkleaf-saves` repository, as cards for the saved grid.
 *
 * The grid was built for notes in `inbox/`; saves made while signed in now
 * live in a repository of their own. Each becomes the same card, and opening
 * one opens its file on GitHub, since it is not a note in the open notebook.
 */

export interface SavesListing {
  repo: { url: string; branch: string } | null;
  items: SavedEntry[];
}

const isWeb = (value: string | null): value is string => !!value && /^https?:\/\//i.test(value);

export function mindItemsFromSaves(listing: SavesListing): MindItem[] {
  const { repo } = listing;
  if (!repo) return [];
  return listing.items.map((entry) => ({
    path: `${repo.url}/blob/${repo.branch}/${entry.path}`,
    title: entry.title,
    kind: entry.kind,
    url: isWeb(entry.url) ? entry.url : null,
    site: entry.site,
    saved: entry.saved || null,
    excerpt: entry.excerpt,
    image: entry.kind === "image" && isWeb(entry.url) ? entry.url : null,
    tags: [],
  }));
}

/** True for a card that is a file on GitHub rather than a note to open. */
export const isSavedOnGitHub = (path: string) => path.startsWith("https://github.com/");
