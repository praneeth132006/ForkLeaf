import { INBOX_FOLDER, siteOf, type SaveKind } from "@/lib/inbox";

/**
 * Everything saved into the inbox, as things rather than as files.
 *
 * The inbox is a folder of ordinary notes, and the sidebar shows it as one: a
 * list of filenames. What somebody looking for "that quote about cities" wants
 * is the quote. This turns each saved note back into what it was — a quote, a
 * link, a picture — with where it came from and when, for the grid that shows
 * them.
 */

export interface MindItem {
  path: string;
  title: string;
  kind: SaveKind;
  url: string | null;
  site: string | null;
  /** `YYYY-MM-DD` it was saved, when the note says. */
  saved: string | null;
  /** A few lines of what it says, without markdown. */
  excerpt: string;
  /** An http(s) picture to show, when there is one. */
  image: string | null;
  tags: string[];
}

export interface MindSource {
  path: string;
  title: string;
  content: string;
  frontmatter: Record<string, unknown>;
}

const KINDS: readonly SaveKind[] = ["page", "quote", "image", "link"];
const EXCERPT_LENGTH = 280;

const isWeb = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
};

/** Markdown reduced to the words a person would read. */
export function plainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+[.)])\s?/gm, "")
    .replace(/(\*\*|__|\*|_|~~|`)/g, "")
    .replace(/\\([[\]\\])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function excerptOf(kind: SaveKind, content: string): string {
  let text: string;
  if (kind === "quote") {
    const quoted = content
      .split("\n")
      .filter((line) => line.startsWith(">"))
      .map((line) => line.replace(/^>\s?/, ""))
      .join("\n");
    text = plainText(quoted || content);
  } else {
    text = plainText(content);
  }
  return text.length > EXCERPT_LENGTH ? `${text.slice(0, EXCERPT_LENGTH - 1)}…` : text;
}

function imageOf(kind: SaveKind, url: string | null, content: string): string | null {
  if (kind === "image" && url) return url;
  const found = /!\[[^\]]*\]\((\S+?)\)/.exec(content)?.[1];
  if (!found) return null;
  // The note escapes parentheses in addresses; undo that to get the real one.
  const decoded = found.replace(/%28/gi, "(").replace(/%29/gi, ")");
  return isWeb(decoded) ? decoded : null;
}

export function mindItems(notes: readonly MindSource[]): MindItem[] {
  return notes
    .filter((note) => note.path.startsWith(`${INBOX_FOLDER}/`) && /\.mdx?$/i.test(note.path))
    .map((note) => {
      const type = note.frontmatter.type;
      const kind: SaveKind = KINDS.includes(type as SaveKind) ? (type as SaveKind) : "page";
      const url = isWeb(note.frontmatter.url) ? note.frontmatter.url : null;
      const saved =
        typeof note.frontmatter.saved === "string" &&
        /^\d{4}-\d{2}-\d{2}/.test(note.frontmatter.saved)
          ? note.frontmatter.saved.slice(0, 10)
          : null;
      const tags = Array.isArray(note.frontmatter.tags)
        ? note.frontmatter.tags.filter((tag): tag is string => typeof tag === "string")
        : [];
      return {
        path: note.path,
        title: note.title,
        kind,
        url,
        site: typeof note.frontmatter.site === "string" ? note.frontmatter.site : siteOf(url),
        saved,
        excerpt: excerptOf(kind, note.content),
        image: imageOf(kind, url, note.content),
        tags,
      };
    })
    .sort((a, b) => (b.saved ?? "").localeCompare(a.saved ?? "") || a.title.localeCompare(b.title));
}

export type MindFilter = SaveKind | "all";

/** Items of a kind whose title, excerpt, site or tags contain every word typed. */
export function filterMind(
  items: readonly MindItem[],
  kind: MindFilter,
  query: string,
): MindItem[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return items.filter((item) => {
    if (kind !== "all" && item.kind !== kind) return false;
    if (words.length === 0) return true;
    const haystack = [item.title, item.excerpt, item.site ?? "", item.url ?? "", ...item.tags]
      .join(" ")
      .toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}

export function countByKind(items: readonly MindItem[]): Record<MindFilter, number> {
  const counts: Record<MindFilter, number> = {
    all: items.length,
    page: 0,
    quote: 0,
    image: 0,
    link: 0,
  };
  for (const item of items) counts[item.kind] += 1;
  return counts;
}
