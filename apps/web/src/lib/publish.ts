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
 * One path segment this app would itself have produced.
 *
 * Written once and shared, because the same question — "is this a name we
 * made, or is it a path" — is now asked of a page, of a book, and of every
 * filename in a book's manifest. Three copies of an allowlist is three chances
 * for one of them to drift a character looser than the others, and the loose
 * one is the one that writes outside the folder.
 */
const SEGMENT = /^[a-z0-9][a-z0-9._-]{0,80}$/;

/**
 * The cover's filename, and therefore a chapter slug nobody may use.
 *
 * A book's table of contents is `index.html` because that is the name a web
 * server serves for the directory itself. A chapter called "index" would be
 * published to exactly that address and silently replace the cover — the book
 * would still build, still deploy, and simply have no way in.
 */
export const BOOK_INDEX = "index";

/**
 * The record of what ForkLeaf wrote into a book's folder.
 *
 * Kept in the book rather than here, because there is no "here" — the whole
 * arrangement is that publishing writes files into a repository the user owns
 * and keeps no database of its own. A manifest committed alongside the pages
 * is the only place the answer can live and still survive this app.
 */
export const BOOK_MANIFEST = "forkleaf-book.json";

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

  if (!SEGMENT.test(cleaned)) {
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
  const lower = filename.toLowerCase();
  if (!lower.endsWith(".html")) return null;

  const stem = lower.slice(0, -".html".length);
  return SEGMENT.test(stem) ? stem : null;
}

/* ────────────────────────────────────────────────────────────────────────────
   Books

   A published page is one note at one address. A book is a folder of them that
   knows it is a folder: a cover with a table of contents, chapters that can
   link to each other, and one shared stylesheet instead of the same few
   kilobytes of CSS inlined into every chapter.

   It lives at `docs/<book>/`, which is the whole reason the single-page path
   could not simply be reused — `pagePath` refuses a slug containing a slash,
   deliberately and correctly, because for one page a slash is always either a
   bug or an attempt to write somewhere else. A book needs exactly one level of
   nesting and no more, so it gets its own function rather than a loosened
   allowlist shared with the case that must stay strict.
   ──────────────────────────────────────────────────────────────────────────── */

/** Where a book's files live: `docs/<book>`. */
export function bookDir(book: string | undefined): string {
  const cleaned = (book ?? "").toLowerCase();

  // Checked as given, exactly as `pagePath` does, and for the same reason: a
  // book name that is really a path is not a name to be tidied up, it is a
  // request to write into a folder nobody asked about.
  if (!SEGMENT.test(cleaned)) {
    throw new ApiError(400, "validation", "That folder's name cannot be used as a book address.");
  }

  return `${PUBLISH_DIR}/${cleaned}`;
}

/** One chapter: `docs/<book>/<slug>.html`. */
export function chapterPath(book: string | undefined, slug: string | undefined): string {
  const cleaned = (slug ?? "").toLowerCase();

  if (!SEGMENT.test(cleaned)) {
    throw new ApiError(400, "validation", "That note's name cannot be used as a page address.");
  }
  if (cleaned === BOOK_INDEX) {
    throw new ApiError(
      400,
      "validation",
      `A chapter cannot be called "${BOOK_INDEX}" — that address is the book's contents page.`,
    );
  }

  return `${bookDir(book)}/${cleaned}.html`;
}

/** The cover and table of contents: `docs/<book>/index.html`. */
export function bookIndexPath(book: string | undefined): string {
  return `${bookDir(book)}/${BOOK_INDEX}.html`;
}

/** The record of what was written: `docs/<book>/forkleaf-book.json`. */
export function bookManifestPath(book: string | undefined): string {
  return `${bookDir(book)}/${BOOK_MANIFEST}`;
}

/**
 * A shared file: `docs/<book>/assets/<name>`.
 *
 * The single-page export inlines everything, so that one file opens from a
 * USB stick with no network. A book cannot afford that — the same stylesheet
 * inlined into forty chapters is the same bytes served forty times, and the
 * search index has no business being copied into every page that offers to
 * search. A book is a website; a website has a network by definition.
 */
export function bookAssetPath(book: string | undefined, name: string): string {
  const cleaned = name.toLowerCase();

  // Asset names carry an extension, so the segment rule is applied to the stem
  // and the extension checked against what a book is actually allowed to ship.
  const dot = cleaned.lastIndexOf(".");
  const stem = dot === -1 ? cleaned : cleaned.slice(0, dot);
  const extension = dot === -1 ? "" : cleaned.slice(dot + 1);

  if (!SEGMENT.test(stem) || !ASSET_EXTENSIONS.has(extension)) {
    throw new ApiError(400, "validation", "That file cannot be published inside a book.");
  }

  return `${bookDir(book)}/assets/${cleaned}`;
}

/**
 * What a book's `assets/` folder may contain.
 *
 * An allowlist rather than a blocklist, and a short one. Publishing writes to
 * somebody's repository and GitHub Pages serves whatever is written, so the
 * question is not "what might be harmful" but "what does a book need" — a
 * stylesheet, a script for search, the index it searches, and pictures.
 */
const ASSET_EXTENSIONS = new Set([
  "css",
  "js",
  "json",
  "svg",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "avif",
]);

/** The public address of a book's contents page. */
export function bookUrl(siteUrl: string, book: string): string {
  return `${siteUrl.replace(/\/$/, "")}/${book.toLowerCase()}/`;
}

/** The public address of one chapter. */
export function chapterUrl(siteUrl: string, book: string, slug: string): string {
  return `${bookUrl(siteUrl, book)}${slug.toLowerCase()}.html`;
}

/**
 * Maps a book-relative filename onto a path in the repository.
 *
 * The builder produces names like `index.html`, `setup.html` and
 * `assets/style.css` and knows nothing about where the book lives. This is
 * where those become real paths, and — more to the point — where they are
 * checked. The list of files to write arrives over HTTP, so it is a list of
 * requests to write to somebody's repository: every entry is re-derived
 * through the same functions that address a book in the first place, and one
 * that does not correspond to a file a book is made of is refused outright
 * rather than written somewhere unexpected.
 */
export function bookFilePath(book: string | undefined, relative: string): string {
  const path = relative.toLowerCase();

  if (path === BOOK_MANIFEST) return bookManifestPath(book);
  if (path === `${BOOK_INDEX}.html`) return bookIndexPath(book);

  if (path.startsWith("assets/")) {
    const name = path.slice("assets/".length);
    // `bookAssetPath` checks the name, but not that it is a name at all —
    // `assets/nested/style.css` has to fail here, not become a folder.
    if (name.includes("/")) {
      throw new ApiError(400, "validation", "That file cannot be published inside a book.");
    }
    return bookAssetPath(book, name);
  }

  if (path.endsWith(".html")) {
    return chapterPath(book, path.slice(0, -".html".length));
  }

  throw new ApiError(400, "validation", "That file cannot be published inside a book.");
}

/** One chapter, as the manifest records it. */
export interface BookChapter {
  /** The chapter's address within the book, without `.html`. */
  slug: string;
  /** What the contents page calls it. */
  title: string;
  /** The note it was rendered from, so republishing knows where to look. */
  source: string;
}

/**
 * What ForkLeaf wrote, and therefore what it may take away again.
 *
 * The single-page listing answers this by pattern: a file in `docs/` is one of
 * ours if its name is a name we would have produced. That works because the
 * only thing at stake is one `.html` file, and it is the reason `slugOfPage`
 * exists at all — `docs/` is an ordinary folder people keep hand-written sites
 * in, and offering to delete somebody's `about.html` because it matched a
 * regex would be unforgivable.
 *
 * A book cannot be recognised that way. Its folder holds a stylesheet, a
 * search index, images and however many chapters, and "delete `docs/handbook/`
 * and everything under it" is precisely the operation that eats the file
 * somebody added by hand last week. So the book writes down what it made, and
 * unpublishing removes exactly that list and nothing else. A file that appears
 * in the folder without appearing in the manifest is somebody else's, and it
 * stays.
 */
export interface BookManifest {
  /** Bumped only if the shape below stops being readable by an older app. */
  version: 1;
  /** The book's address, matching the folder it is in. */
  book: string;
  /** What the cover calls it. */
  title: string;
  /** ISO 8601, in UTC. */
  publishedAt: string;
  /** In reading order — this is what the contents page and prev/next follow. */
  chapters: BookChapter[];
  /**
   * Every path this book wrote, relative to the repository root.
   *
   * Includes the manifest itself. A record of what to delete that leaves
   * itself off the list is a record that survives its own deletion, and the
   * next publish would find a manifest describing a book that is no longer
   * there.
   */
  files: string[];
}

/** The manifest as it is committed: stable key order, and a trailing newline. */
export function serializeManifest(manifest: BookManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

/**
 * Reads a manifest back, or returns null if it is not one.
 *
 * Null rather than a throw, because every caller is asking the same question —
 * "is there a ForkLeaf book here" — and a folder containing somebody's own
 * `forkleaf-book.json`, or a truncated one from a commit that failed halfway,
 * is a folder with no book in it rather than an error to show a reader. The
 * consequence of a wrong yes is deleting files; the consequence of a wrong no
 * is offering to publish a book that is already there, which is recoverable.
 */
export function parseManifest(json: string, book: string): BookManifest | null {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return null;
  }

  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;

  if (raw.version !== 1) return null;
  // A manifest naming a different book is a manifest that was moved, copied or
  // hand-edited. Its file list describes paths in some other folder, and acting
  // on it would delete them.
  if (raw.book !== book.toLowerCase()) return null;
  if (!Array.isArray(raw.chapters) || !Array.isArray(raw.files)) return null;

  const chapters: BookChapter[] = [];
  for (const entry of raw.chapters) {
    if (typeof entry !== "object" || entry === null) return null;
    const chapter = entry as Record<string, unknown>;
    if (typeof chapter.slug !== "string" || !SEGMENT.test(chapter.slug)) return null;
    chapters.push({
      slug: chapter.slug,
      title: typeof chapter.title === "string" ? chapter.title : chapter.slug,
      source: typeof chapter.source === "string" ? chapter.source : "",
    });
  }

  return {
    version: 1,
    book: raw.book,
    title: typeof raw.title === "string" ? raw.title : raw.book,
    publishedAt: typeof raw.publishedAt === "string" ? raw.publishedAt : "",
    chapters,
    files: raw.files.filter((file): file is string => typeof file === "string"),
  };
}

/**
 * The files unpublishing a book may delete.
 *
 * The manifest is a file in the user's repository, which means it is a file
 * the user can edit — so it is treated as a claim to be checked rather than an
 * instruction to be carried out. Every path is re-derived against the book's
 * own folder before it is believed, so a manifest that has been hand-edited,
 * copied from another book, or crafted to say `docs/../.github/workflows/ci.yml`
 * deletes nothing outside the book it belongs to.
 *
 * Anything that fails the check is dropped rather than aborting the whole
 * delete: one bad line should not strand a book that is otherwise removable,
 * and a file left behind is a file the user can still delete themselves.
 */
export function filesToDelete(manifest: BookManifest): string[] {
  const dir = bookDir(manifest.book);
  const prefix = `${dir}/`;
  const seen = new Set<string>();

  for (const file of manifest.files) {
    const path = file.toLowerCase();

    // Inside the book's folder, and genuinely inside it — a `..` anywhere in
    // the path is the whole attack, and it passes a naive prefix check.
    if (!path.startsWith(prefix)) continue;
    if (path.split("/").some((part) => part === "." || part === "..")) continue;

    // And a shape this app would have written: a chapter, the cover, the
    // manifest, or a file in `assets/`. Nothing else was ever ours to remove.
    const rest = path.slice(prefix.length);
    if (!isBookFile(rest)) continue;

    seen.add(path);
  }

  return [...seen].sort();
}

/** Is `rest`, a path relative to the book's folder, a file ForkLeaf writes? */
function isBookFile(rest: string): boolean {
  if (rest === BOOK_MANIFEST) return true;

  const parts = rest.split("/");

  if (parts.length === 1) return slugOfPage(parts[0]!) !== null;
  if (parts.length === 2 && parts[0] === "assets") {
    const dot = parts[1]!.lastIndexOf(".");
    if (dot === -1) return false;
    return SEGMENT.test(parts[1]!.slice(0, dot)) && ASSET_EXTENSIONS.has(parts[1]!.slice(dot + 1));
  }

  return false;
}
