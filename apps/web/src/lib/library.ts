import { deriveTitle, documentStats, extractTags } from "@forkleaf/markdown-engine";
import type { Note, TreeNode, Workspace } from "@forkleaf/types";

/**
 * The note index that the dashboard is built on.
 *
 * The editor only ever knows about the notes you have opened — everything else
 * is a path in a tree. That is fine for a sidebar, and useless for anything
 * that wants to answer "what have I written and where is it": searching by
 * title, by tag, or by anything other than the exact filename was impossible
 * because nothing had ever read the files.
 *
 * So the index is built from both halves. Every path in the repository tree
 * becomes an entry, and any note already in local storage fills that entry in
 * with its real title, tags and word count. Entries that have never been read
 * are marked `indexed: false` rather than being given invented statistics, and
 * the dashboard can hydrate them in the background.
 */

export interface IndexEntry {
  /** `${workspaceId}::${path}` — unique across every connected repository. */
  id: string;
  workspaceId: string;
  workspaceName: string;
  path: string;
  /** Containing folder, "" for the workspace root. */
  folder: string;
  /** Filename without its extension — the fallback when nothing was read. */
  slug: string;
  /** Frontmatter title, else the first heading, else the humanised filename. */
  title: string;
  tags: string[];
  words: number;
  diagrams: number;
  /** First line or so of prose, for the card. Empty until the note is read. */
  excerpt: string;
  /** ISO timestamp of the last local edit; null for notes never opened here. */
  updatedAt: string | null;
  /** True when there are local edits that have not reached GitHub yet. */
  dirty: boolean;
  /** False while this is still just a path in the tree. */
  indexed: boolean;
}

export type SortKey = "recent" | "title" | "path" | "words";

/** Every file path in a tree, depth first. Folders are not entries. */
export function flattenTree(tree: TreeNode[]): string[] {
  const paths: string[] = [];
  const walk = (nodes: TreeNode[]) => {
    for (const node of nodes) {
      if (node.kind === "file") paths.push(node.path);
      if (node.children) walk(node.children);
    }
  };
  walk(tree);
  return paths;
}

/** `projects/q3-roadmap.md` → `q3-roadmap`. */
export function slugOf(path: string): string {
  return (path.split("/").pop() ?? path).replace(/\.mdx?$/i, "");
}

export function folderOf(path: string): string {
  const segments = path.split("/");
  return segments.length > 1 ? segments.slice(0, -1).join("/") : "";
}

/** `q3-roadmap` → `Q3 roadmap`. Only used when the file was never read. */
export function humanise(slug: string): string {
  const words = slug.replace(/[-_]+/g, " ").trim();
  if (!words) return "Untitled";
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The opening prose of a note, with markdown furniture stripped. */
export function excerptOf(content: string, limit = 140): string {
  let inFence = false;
  let line: string | undefined;

  // Fence state is tracked rather than skipping the ``` lines alone, which
  // would happily pick the first line of code as the note's summary.
  for (const raw of content.split("\n")) {
    const trimmed = raw.trim();

    if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
      inFence = !inFence;
      continue;
    }
    if (inFence || trimmed === "") continue;
    if (
      trimmed.startsWith("#") ||
      trimmed.startsWith(">") ||
      trimmed.startsWith("---") ||
      trimmed.startsWith("|")
    ) {
      continue;
    }

    line = trimmed;
    break;
  }

  if (!line) return "";

  const plain = line
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`]+/g, "")
    .trim();

  return plain.length > limit ? `${plain.slice(0, limit).trimEnd()}…` : plain;
}

/** An index entry for a path that has not been read yet. */
export function entryFromPath(workspace: Workspace, path: string): IndexEntry {
  const slug = slugOf(path);

  return {
    id: `${workspace.id}::${path}`,
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    path,
    folder: folderOf(path),
    slug,
    title: humanise(slug),
    tags: [],
    words: 0,
    diagrams: 0,
    excerpt: "",
    updatedAt: null,
    dirty: false,
    indexed: false,
  };
}

/** An index entry for a note whose content is in local storage. */
export function entryFromNote(workspace: Workspace, note: Note): IndexEntry {
  const stats = documentStats(note.content);
  const slug = slugOf(note.path);

  return {
    id: note.id,
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    path: note.path,
    folder: folderOf(note.path),
    slug,
    title: deriveTitle(note.content, note.frontmatter.title, note.path),
    tags: extractTags(note.content, note.frontmatter.tags),
    words: stats.words,
    diagrams: stats.diagrams,
    excerpt: excerptOf(note.content),
    updatedAt: note.updatedAt,
    dirty: note.dirty,
    indexed: true,
  };
}

/**
 * Merges the tree's paths with the notes already read.
 *
 * The tree is authoritative about which notes exist — a note deleted on GitHub
 * should leave the index even if a stale copy is still in IndexedDB — while the
 * stored notes are authoritative about what is in them. Locally created notes
 * that have not been pushed yet are not in the tree, so they are added.
 */
export function buildIndex(workspace: Workspace, paths: string[], notes: Note[]): IndexEntry[] {
  const byPath = new Map(notes.map((note) => [note.path, note] as const));
  const seen = new Set<string>();
  const entries: IndexEntry[] = [];

  for (const path of paths) {
    seen.add(path);
    const note = byPath.get(path);
    entries.push(note ? entryFromNote(workspace, note) : entryFromPath(workspace, path));
  }

  for (const note of notes) {
    if (!seen.has(note.path)) entries.push(entryFromNote(workspace, note));
  }

  return entries;
}

/**
 * Scores an entry against a query, or returns 0 for no match.
 *
 * Deliberately ranked rather than filtered: typing "road" should put the note
 * called "Roadmap" above the one that merely mentions the word halfway down,
 * which a plain `includes` filter cannot express.
 */
export function scoreEntry(entry: IndexEntry, needle: string): number {
  if (!needle) return 1;

  const title = entry.title.toLowerCase();
  const path = entry.path.toLowerCase();

  if (title === needle) return 100;
  if (title.startsWith(needle)) return 80;
  if (title.includes(needle)) return 60;
  if (entry.tags.some((tag) => tag.toLowerCase().includes(needle))) return 50;
  if (path.includes(needle)) return 40;
  if (entry.excerpt.toLowerCase().includes(needle)) return 20;

  return 0;
}

export interface QueryOptions {
  query?: string;
  /** Restrict to one folder and everything beneath it. */
  folder?: string | null;
  tag?: string | null;
  sort?: SortKey;
}

export function queryIndex(entries: IndexEntry[], options: QueryOptions = {}): IndexEntry[] {
  const needle = (options.query ?? "").trim().toLowerCase();
  const { folder, tag, sort = "recent" } = options;

  const scored = entries
    .filter((entry) => {
      if (folder != null && entry.folder !== folder && !entry.folder.startsWith(`${folder}/`)) {
        return false;
      }
      if (tag && !entry.tags.includes(tag)) return false;
      return true;
    })
    .map((entry) => ({ entry, score: scoreEntry(entry, needle) }))
    .filter((candidate) => candidate.score > 0);

  // While searching, relevance leads and the chosen sort breaks ties; with no
  // query there is nothing to be relevant to, so the sort is all there is.
  scored.sort((a, b) => {
    if (needle && b.score !== a.score) return b.score - a.score;
    return compare(a.entry, b.entry, sort);
  });

  return scored.map((candidate) => candidate.entry);
}

function compare(a: IndexEntry, b: IndexEntry, sort: SortKey): number {
  switch (sort) {
    case "title":
      return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
    case "path":
      return a.path.localeCompare(b.path, undefined, { sensitivity: "base" });
    case "words":
      return b.words - a.words;
    case "recent":
    default:
      // Never-opened notes have no local timestamp, so they sort last rather
      // than pretending to be from 1970.
      if (!a.updatedAt && !b.updatedAt) {
        return a.path.localeCompare(b.path, undefined, { sensitivity: "base" });
      }
      if (!a.updatedAt) return 1;
      if (!b.updatedAt) return -1;
      return b.updatedAt.localeCompare(a.updatedAt);
  }
}

/** Folder paths in the index, each with how many notes sit under it. */
export function folderCounts(entries: IndexEntry[]): { path: string; count: number }[] {
  const counts = new Map<string, number>();

  for (const entry of entries) {
    // Count into every ancestor, so `projects` reports what is in
    // `projects/website/` too — otherwise every nested folder reads as empty.
    const segments = entry.folder ? entry.folder.split("/") : [];
    for (let depth = 1; depth <= segments.length; depth += 1) {
      const path = segments.slice(0, depth).join("/");
      counts.set(path, (counts.get(path) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([path, count]) => ({ path, count }))
    .sort((a, b) => a.path.localeCompare(b.path, undefined, { sensitivity: "base" }));
}

/** Every tag in the index, most used first. */
export function tagCounts(entries: IndexEntry[]): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    for (const tag of entry.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

export interface LibraryTotals {
  notes: number;
  words: number;
  diagrams: number;
  /** How many notes are still only a path — nothing read from them yet. */
  unindexed: number;
}

export function totalsOf(entries: IndexEntry[]): LibraryTotals {
  return {
    notes: entries.length,
    words: entries.reduce((total, entry) => total + entry.words, 0),
    diagrams: entries.reduce((total, entry) => total + entry.diagrams, 0),
    unindexed: entries.filter((entry) => !entry.indexed).length,
  };
}
