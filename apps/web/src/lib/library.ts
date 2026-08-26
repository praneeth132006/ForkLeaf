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

/**
 * True for a path that is a note.
 *
 * The repository tree carries every file — images, configuration, code — and
 * only markdown is a note. Defined here rather than inline at each call site
 * so the index, the link graph and the search index can never disagree about
 * what counts.
 */
export function isMarkdown(path: string): boolean {
  return /\.mdx?$/i.test(path);
}

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
 * True for a stored note that GitHub has never been told about.
 *
 * The two halves matter for different reasons. `baseSha === null` is a note
 * that was written here and has never been pushed, so no tree could possibly
 * list it. `dirty` is a note that *was* pushed and has since been edited here,
 * which is unpushed work regardless of what the tree says. Either way the
 * local copy is the only copy of something, and dropping it would be losing
 * it.
 */
export function isUnpushed(note: Note): boolean {
  return note.baseSha === null || note.dirty;
}

/**
 * The stored notes a fresh tree says no longer exist.
 *
 * These are the notes deleted from the repository somewhere else — on GitHub
 * itself, or from another device — whose copy in IndexedDB has outlived them.
 * Notes carrying unpushed work are never orphans: they are absent from the
 * tree because they have not been pushed yet, not because they are gone.
 */
export function orphanedNotes(paths: string[], notes: Note[]): Note[] {
  const live = new Set(paths);
  return notes.filter((note) => !live.has(note.path) && !isUnpushed(note));
}

export interface BuildIndexOptions {
  /**
   * Whether `paths` is a real listing of the repository.
   *
   * False means "nobody has asked GitHub yet" — a workspace with no cached
   * tree, or the on-device workspace, which has no tree at all. An empty list
   * then means *unknown*, not *empty*, and the stored notes are all there is
   * to show. True means the listing is authoritative and a stored note missing
   * from it has been deleted.
   */
  treeKnown?: boolean;
}

/**
 * Merges the tree's paths with the notes already read.
 *
 * The tree is authoritative about which notes exist — a note deleted on GitHub
 * should leave the index even if a stale copy is still in IndexedDB — while the
 * stored notes are authoritative about what is in them. Locally created notes
 * that have not been pushed yet are not in the tree, so they are added.
 *
 * That first sentence had been the intent all along, and was not what the code
 * did: every stored note absent from the tree was added back, so deleting a
 * folder on GitHub left it on the dashboard for as long as the device held a
 * copy of anything that used to be in it. The editor's sidebar reads the tree
 * alone and so had always been right, which is what made the two disagree.
 */
export function buildIndex(
  workspace: Workspace,
  paths: string[],
  notes: Note[],
  options: BuildIndexOptions = {},
): IndexEntry[] {
  const byPath = new Map(notes.map((note) => [note.path, note] as const));
  const seen = new Set<string>();
  const entries: IndexEntry[] = [];

  for (const path of paths) {
    seen.add(path);
    const note = byPath.get(path);
    entries.push(note ? entryFromNote(workspace, note) : entryFromPath(workspace, path));
  }

  for (const note of notes) {
    if (seen.has(note.path)) continue;
    if (options.treeKnown && !isUnpushed(note)) continue;
    entries.push(entryFromNote(workspace, note));
  }

  return entries;
}

/**
 * Scores an entry against a query, or returns 0 for no match.
 *
 * Deliberately ranked rather than filtered: typing "road" should put the note
 * called "Roadmap" above the one that merely mentions the word halfway down,
 * which a plain `includes` filter cannot express.
 *
 * `textScore` is the full-text index's BM25 score for this note, when the body
 * was searched too. It slots in above a path match and below a tag: a note
 * whose *text* is about kubernetes is a better answer than one whose folder
 * happens to be called that, and a worse one than a note actually tagged with
 * it. The score itself only orders body matches among themselves, capped so a
 * long note repeating a word cannot climb past a title match.
 */
export function scoreEntry(entry: IndexEntry, needle: string, textScore?: number): number {
  if (!needle) return 1;

  const title = entry.title.toLowerCase();
  const path = entry.path.toLowerCase();

  if (title === needle) return 100;
  if (title.startsWith(needle)) return 80;
  if (title.includes(needle)) return 60;
  if (entry.tags.some((tag) => tag.toLowerCase().includes(needle))) return 50;
  if (textScore !== undefined) return 45 + Math.min(textScore, 9) / 10;
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
  /**
   * Full-text scores by entry id, from the search index.
   *
   * Passed in rather than computed here because the index lives in the store
   * package and holds note *content*, which this module has never seen — it
   * indexes what the dashboard knows about a note, not what is in it.
   */
  textScores?: Map<string, number>;
}

export function queryIndex(entries: IndexEntry[], options: QueryOptions = {}): IndexEntry[] {
  const needle = (options.query ?? "").trim().toLowerCase();
  const { folder, tag, sort = "recent", textScores } = options;

  const scored = entries
    .filter((entry) => {
      if (folder != null && entry.folder !== folder && !entry.folder.startsWith(`${folder}/`)) {
        return false;
      }
      if (tag && !entry.tags.includes(tag)) return false;
      return true;
    })
    .map((entry) => ({ entry, score: scoreEntry(entry, needle, textScores?.get(entry.id)) }))
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

/**
 * The folders directly inside `parent`, each with how many notes sit under it.
 *
 * `folderCounts` returns every folder in the repository, which is the right
 * answer for a small notebook and the wrong one for a real repository: a
 * documentation tree of 128 notes has around a hundred folders, and rendering
 * them all as filter chips produced a wall of them that was slower to read than
 * the list it was meant to filter. Browsing one level at a time keeps the
 * choice in front of the reader to a handful, at any size.
 */
export function subfolders(
  entries: IndexEntry[],
  parent: string | null,
): { path: string; name: string; count: number }[] {
  const prefix = parent ? `${parent}/` : "";
  const counts = new Map<string, number>();

  for (const entry of entries) {
    if (!entry.folder) continue;
    if (parent) {
      if (entry.folder !== parent && !entry.folder.startsWith(prefix)) continue;
      if (entry.folder === parent) continue;
    }

    const rest = entry.folder.slice(prefix.length);
    const name = rest.split("/")[0];
    if (!name) continue;

    const path = `${prefix}${name}`;
    counts.set(path, (counts.get(path) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([path, count]) => ({ path, name: path.slice(prefix.length), count }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

/** How many notes sit in this exact folder rather than in one below it. */
export function directCount(entries: IndexEntry[], folder: string | null): number {
  return entries.filter((entry) => entry.folder === (folder ?? "")).length;
}

/** `a/b/c` → the trail of ancestors, for a breadcrumb. */
export function folderTrail(folder: string | null): { path: string; name: string }[] {
  if (!folder) return [];

  const segments = folder.split("/");
  return segments.map((name, index) => ({
    path: segments.slice(0, index + 1).join("/"),
    name,
  }));
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

// ─── Tree view ──────────────────────────────────────────────────────────────

/**
 * One folder in the dashboard's tree view.
 *
 * A repository's shape is information: which notes sit together, how deep the
 * documentation goes, what is a stub and what is a section. A flat list sorted
 * by "recently edited" throws all of that away, and for anyone whose notes are
 * organised into folders it is the wrong default view of their own work.
 */
export interface NoteFolder {
  /** Full path, `""` for the root. */
  path: string;
  /** Last segment, for display. */
  name: string;
  folders: NoteFolder[];
  /** Notes directly in this folder, not in one below it. */
  notes: IndexEntry[];
  /** Notes at or below this folder. */
  count: number;
}

/**
 * Groups entries into a folder tree.
 *
 * Built from whatever entries it is given, which is what lets the tree respond
 * to the search box: filter first, and the tree shows only the branches that
 * still hold a match rather than the whole repository with three results
 * hidden in it.
 */
export function buildNoteTree(entries: IndexEntry[]): NoteFolder {
  const root: NoteFolder = { path: "", name: "", folders: [], notes: [], count: 0 };

  const folderAt = (path: string): NoteFolder => {
    if (!path) return root;

    let node = root;
    let prefix = "";

    for (const segment of path.split("/")) {
      prefix = prefix ? `${prefix}/${segment}` : segment;
      let next = node.folders.find((child) => child.path === prefix);
      if (!next) {
        next = { path: prefix, name: segment, folders: [], notes: [], count: 0 };
        node.folders.push(next);
      }
      node = next;
    }

    return node;
  };

  for (const entry of entries) {
    folderAt(entry.folder).notes.push(entry);
  }

  // Counts roll up, and both lists sort by name so the tree is stable between
  // renders and between sessions.
  const finish = (node: NoteFolder): number => {
    node.folders.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    node.notes.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
    node.count =
      node.notes.length + node.folders.reduce((total, child) => total + finish(child), 0);
    return node.count;
  };

  finish(root);
  return root;
}

/** Every folder path in a tree, for expanding all of them at once. */
export function allFolderPaths(node: NoteFolder): string[] {
  return node.folders.flatMap((child) => [child.path, ...allFolderPaths(child)]);
}
