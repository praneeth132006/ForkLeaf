import {
  resolveWikilink,
  type LinkCandidate,
  type WikilinkResolver,
} from "@forkleaf/markdown-engine";
import type { ExportOptions } from "@forkleaf/types";
import { toBodyHtml, pageStyles, escapeHtml, type ImageResolver } from "./html";

/**
 * A folder of notes, published as a book.
 *
 * Publishing has always meant one note at one address: a self-contained HTML
 * file with its styles and diagrams inlined, which is exactly right for a
 * document somebody will forward, print or keep. It is the wrong shape for a
 * set of notes that refer to each other, and the reason is not presentation —
 * it is that a `[[wikilink]]` on a published page has nowhere to point. The
 * renderer emits `href="#target"`, an anchor to a heading that is not on the
 * page, so every link between notes silently becomes a link to nothing.
 *
 * A book fixes that by publishing the notes together and knowing their
 * addresses. It is a folder: a contents page, one file per chapter, and a
 * stylesheet they share rather than each carrying a copy. That last part is a
 * real trade — a chapter is no longer a file that opens from a USB stick with
 * no network — and it is made deliberately, because a book is a website and a
 * website has a network by definition. Single-note export is untouched and
 * still inlines everything.
 *
 * Nothing here knows about `docs/`, repositories or GitHub. It is handed
 * notes and gives back files with names relative to the book's own folder;
 * where that folder lives is the caller's business.
 */

/** A note going into a book. */
export interface BookNote {
  /** Its path in the repository, which is what a wikilink resolves against. */
  path: string;
  title: string;
  markdown: string;
  frontmatter: Record<string, unknown>;
}

/** A chapter, once it has an address. */
export interface BookChapter {
  /** Its filename stem inside the book. */
  slug: string;
  title: string;
  /** The note it came from, so republishing knows where to look. */
  source: string;
}

/** One file to write, named relative to the book's folder. */
export interface BookFile {
  path: string;
  content: string;
}

export interface BuildBookOptions {
  /** What the cover calls the book. */
  title: string;
  theme: "light" | "dark";
  renderDiagrams: boolean;
  /** Where a reader who spots a mistake in this chapter should go. */
  suggestUrl?: (note: BookNote) => string | null;
  /** Turns a note-relative image path into something a page can show. */
  resolveImage?: ImageResolver;
}

export interface Book {
  chapters: BookChapter[];
  files: BookFile[];
}

/** The contents page's filename stem, and therefore a reserved chapter slug. */
const INDEX = "index";

/** Where the shared stylesheet lives inside the book. */
export const BOOK_STYLESHEET = "assets/style.css";

/**
 * A note's filename, reduced to something that can be a URL.
 *
 * Deliberately lossy and deliberately narrow: the result has to satisfy the
 * same allowlist the publish route checks paths against, so anything outside
 * it becomes a hyphen rather than being escaped into something that survives.
 * A chapter's address is a URL somebody may link to, and "readable, stable,
 * and obviously derived from the filename" beats "reversible".
 */
export function chapterSlug(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1).replace(/\.[^.]*$/, "");

  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    // A leading dot would make a hidden file, and a leading dash reads as a
    // flag to half the tools that will ever touch this folder.
    .replace(/^[^a-z0-9]+/, "")
    // Short enough that the numeric suffix a collision adds still fits.
    .slice(0, 70)
    // Trimmed last, and that order is the whole point: trimming before the
    // truncation leaves the truncation free to cut mid-word and put a hyphen
    // straight back on the end. `_` counts here too — an underscore is as
    // much a separator as a dash, and `init__.html` is nobody's idea of an
    // address.
    .replace(/[-._]+$/, "");

  return slug || "chapter";
}

/**
 * The id a heading gets, and therefore the fragment a link to it must use.
 *
 * Both ends of `[[style guide#voice]]` come through here — the heading when it
 * is rendered, and the anchor when the link is built — because the only thing
 * that matters is that they agree. They did not: headings were emitted with no
 * `id` at all, so every `#anchor` in a book resolved to nothing and the reader
 * landed at the top of the chapter with no sign anything had gone wrong.
 */
export function headingId(text: string): string {
  return (
    text
      .replace(/<[^>]*>/g, "")
      // Named, decimal and hex alike. The renderer writes `&` as `&#x26;`,
      // and a pattern that only knew the first two spelled that heading
      // `deep-x26-meaningful`.
      .replace(/&(?:[a-z][a-z0-9]*|#\d+|#x[0-9a-f]+);/gi, " ")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "section"
  );
}

/**
 * Gives every heading in a chapter an id to be linked to.
 *
 * Duplicates are numbered rather than left to collide, because two sections
 * called "Notes" in one chapter is ordinary and a fragment that matches both
 * matches whichever the browser finds first — which is not a choice anybody
 * made.
 */
function withHeadingIds(html: string): string {
  const used = new Set<string>();

  return html.replace(
    /<h([1-6])([^>]*)>([\s\S]*?)<\/h\1>/gi,
    (whole, level: string, attrs: string, inner: string) => {
      // A heading that already carries an id was given one deliberately.
      if (/\bid=/i.test(attrs)) return whole;

      const base = headingId(inner);
      let id = base;
      for (let n = 2; used.has(id); n += 1) id = `${base}-${n}`;
      used.add(id);

      return `<h${level}${attrs} id="${id}">${inner}</h${level}>`;
    },
  );
}

/**
 * Addresses for every note, with collisions and the reserved name resolved.
 *
 * Two notes in different folders can share a filename, and a note called
 * `index.md` wants the one address the contents page already has. Both come
 * out the same way — the first note to ask for a name gets it, and everyone
 * after gets a number — because the alternative is a chapter that silently
 * overwrites another chapter, or one that replaces the way into the book.
 *
 * Order matters and is the caller's: it is the reading order, and it decides
 * which of two colliding notes is the one that keeps the plain name.
 */
export function assignSlugs(notes: readonly BookNote[]): BookChapter[] {
  const used = new Set<string>([INDEX]);
  const chapters: BookChapter[] = [];

  for (const note of notes) {
    const base = chapterSlug(note.path);

    let slug = base;
    for (let n = 2; used.has(slug); n += 1) slug = `${base}-${n}`;
    used.add(slug);

    chapters.push({ slug, title: note.title, source: note.path });
  }

  return chapters;
}

/**
 * Turns `[[a link]]` into a link to the chapter it means.
 *
 * The resolution itself is the app's own — the same `resolveWikilink` the
 * editor uses, against the same candidates — so a link that opens the right
 * note in the app opens the right chapter in the book. Anything it cannot
 * place, or that resolves to a note outside this book, is reported as missing
 * rather than linked: the words stay, styled as plain text, because a reader
 * is better served by the sentence they were meant to read than by a link that
 * goes nowhere.
 */
function bookWikilinks(chapters: readonly BookChapter[]): WikilinkResolver {
  const candidates: LinkCandidate[] = chapters.map((chapter) => ({
    path: chapter.source,
    title: chapter.title,
  }));
  const bySource = new Map(chapters.map((chapter) => [chapter.source, chapter]));

  return (link) => {
    const found = resolveWikilink(link.target, candidates);
    const chapter = found ? bySource.get(found.path) : undefined;

    if (!chapter) return { href: "", exists: false };

    // The anchor is the reader's, passed through untouched: `[[intro#setup]]`
    // means the same heading it always meant, and the renderer's own slugging
    // is what put an id on it.
    const anchor = link.anchor ? `#${headingId(link.anchor)}` : "";
    return { href: `${chapter.slug}.html${anchor}`, exists: true, title: chapter.title };
  };
}

/**
 * Builds every file the book is made of.
 *
 * Chapters are rendered in the order given, and rendered in parallel — each
 * one is an independent pass over its own markdown, and a forty-chapter book
 * that rasterises its diagrams one file at a time is a publish button that
 * looks broken.
 */
export async function buildBook(
  notes: readonly BookNote[],
  options: BuildBookOptions,
): Promise<Book> {
  const chapters = assignSlugs(notes);
  const resolveWiki = bookWikilinks(chapters);

  const pages = await Promise.all(
    notes.map(async (note, index) => {
      const chapter = chapters[index]!;

      const exportOptions: ExportOptions = {
        format: "html",
        title: note.title,
        includeFrontmatter: false,
        renderDiagrams: options.renderDiagrams,
        theme: options.theme,
      };

      const body = withHeadingIds(
        await toBodyHtml(
          note.markdown,
          note.frontmatter,
          exportOptions,
          options.resolveImage,
          resolveWiki,
        ),
      );

      return {
        path: `${chapter.slug}.html`,
        content: chapterPage({
          book: options.title,
          chapters,
          index,
          body,
          theme: options.theme,
          suggestUrl: options.suggestUrl?.(note) ?? null,
        }),
      };
    }),
  );

  return {
    chapters,
    files: [
      { path: `${INDEX}.html`, content: coverPage(options.title, chapters, options.theme) },
      ...pages,
      { path: BOOK_STYLESHEET, content: stylesheet(options.theme) },
    ],
  };
}

/**
 * The shared stylesheet: what a page looks like, plus what a book adds.
 *
 * Built from the same `pageStyles` a downloaded export inlines, so a chapter
 * and a single published note cannot drift into looking like two products.
 */
export function stylesheet(theme: "light" | "dark"): string {
  return `${pageStyles(theme)}
/* ── Book chrome ──────────────────────────────────────────────────────────
   Everything below exists only inside a book: the strip that says where you
   are, the contents page, and the treatment of a link whose target is not in
   this book. */

.book-nav {
  max-width: 46rem;
  margin: 0 auto 2.5rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--rule);
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem 1rem;
  font-size: 0.875rem;
}
.book-nav a { color: var(--accent); text-decoration: none; }
.book-nav a:hover { text-decoration: underline; }
.book-nav-where { color: var(--muted); }

.book-foot {
  max-width: 46rem;
  margin: 4rem auto 0;
  padding-top: 1.25rem;
  border-top: 1px solid var(--rule);
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0.75rem 1rem;
  font-size: 0.9375rem;
}
.book-foot a { color: var(--accent); text-decoration: none; font-weight: 600; }
.book-foot a:hover { text-decoration: underline; }
.book-foot-label { display: block; font-size: 0.75rem; color: var(--muted); font-weight: 400; }
.book-foot-next { margin-left: auto; text-align: right; }

/* ── The contents page ── */
.book-cover { max-width: 46rem; margin: 0 auto; }
.book-toc { list-style: none; margin: 2.5rem 0 0; padding: 0; counter-reset: chapter; }
.book-toc li { counter-increment: chapter; border-top: 1px solid var(--rule); }
.book-toc li:last-child { border-bottom: 1px solid var(--rule); }
/* The title block already closes itself with a rule. Without this the first
   chapter's own top border draws a second one parallel to it, and the band
   between the two reads as an empty row where a chapter should be. */
.book-toc li:first-child { border-top: none; }
.book-toc a {
  display: flex;
  gap: 1rem;
  align-items: baseline;
  padding: 0.9rem 0.25rem;
  color: var(--fg);
  text-decoration: none;
}
.book-toc a:hover { color: var(--accent); }
.book-toc a::before {
  content: counter(chapter, decimal-leading-zero);
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  font-size: 0.8125rem;
  color: var(--muted);
}

/* A wikilink whose target is not in this book. The words are what the author
   wrote and they stay; what goes is the suggestion that clicking does
   something, because it does not. */
a.fl-wikilink-missing {
  color: inherit;
  text-decoration: none;
  cursor: text;
  pointer-events: none;
}

@media print {
  .book-nav, .book-foot { display: none; }
}
`;
}

/** The `<head>` every page in a book shares. */
function head(title: string, theme: "light" | "dark"): string {
  return `<!doctype html>
<html lang="en" data-theme="${theme}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="${BOOK_STYLESHEET}">
</head>`;
}

/** One chapter, with the strip that says where in the book it is. */
function chapterPage(input: {
  book: string;
  chapters: readonly BookChapter[];
  index: number;
  body: string;
  theme: "light" | "dark";
  suggestUrl: string | null;
}): string {
  const chapter = input.chapters[input.index]!;
  const previous = input.chapters[input.index - 1];
  const next = input.chapters[input.index + 1];

  const suggest = input.suggestUrl
    ? `<aside class="doc-suggest">
  <a class="doc-suggest-link" href="${escapeHtml(input.suggestUrl)}" rel="noopener">Suggest an edit</a>
  <span class="doc-suggest-note">Opens this note on GitHub. Your change is sent to the author as a suggestion — nothing here changes until they accept it.</span>
</aside>`
    : "";

  return `${head(`${chapter.title} — ${input.book}`, input.theme)}
<body>
<nav class="book-nav">
  <a href="${INDEX}.html">← ${escapeHtml(input.book)}</a>
  <span class="book-nav-where">${input.index + 1} of ${input.chapters.length}</span>
</nav>
<main>
<header class="doc-head">
  <h1 class="doc-title">${escapeHtml(chapter.title)}</h1>
</header>
${input.body}
${suggest}
</main>
<nav class="book-foot">
${
  previous
    ? `  <a href="${previous.slug}.html"><span class="book-foot-label">Previous</span>${escapeHtml(previous.title)}</a>`
    : ""
}
${
  next
    ? `  <a class="book-foot-next" href="${next.slug}.html"><span class="book-foot-label">Next</span>${escapeHtml(next.title)}</a>`
    : ""
}
</nav>
</body>
</html>
`;
}

/** The contents page, which is also what the book's own URL serves. */
function coverPage(
  title: string,
  chapters: readonly BookChapter[],
  theme: "light" | "dark",
): string {
  const count = chapters.length === 1 ? "1 chapter" : `${chapters.length} chapters`;

  const items = chapters
    .map(
      (chapter) => `    <li><a href="${chapter.slug}.html">${escapeHtml(chapter.title)}</a></li>`,
    )
    .join("\n");

  return `${head(title, theme)}
<body>
<main class="book-cover">
<header class="doc-head">
  <h1 class="doc-title">${escapeHtml(title)}</h1>
  <p class="doc-meta">${count}</p>
</header>
  <ol class="book-toc">
${items}
  </ol>
</main>
</body>
</html>
`;
}
