import {
  createLinkResolver,
  type LinkCandidate,
  type WikilinkResolver,
} from "@forkleaf/markdown-engine";
import type { ExportOptions } from "@forkleaf/types";
import { toBodyHtml, pageStyles, escapeHtml, type ImageResolver } from "./html";
import { GARDEN_STYLES, gardenLinks, gardenMapSvg, type GardenLinks } from "./garden";

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
  /**
   * Publish as a garden: every page lists the notes that link to it, and the
   * contents page carries a map of how they all connect.
   */
  garden?: boolean;
  /** Comments under every chapter, kept in the notes' GitHub Discussions. */
  comments?: BookComments;
}

/**
 * Where a book's comments are kept: a public repository's Discussions, through
 * giscus — the open-source widget that shows a discussion under a page and
 * lets readers sign in with GitHub to join it.
 *
 * Each chapter's discussion is found by its note's path (giscus's "specific"
 * mapping, strict), and ForkLeaf writes the SHA-1 of that same path into
 * every conversation it opens — so the comments under a chapter and the Chat
 * tab beside the note are one conversation, whichever side starts it.
 */
export interface BookComments {
  /** `owner/name`. giscus needs it to be public. */
  repo: string;
  repoId: string;
  category: string;
  categoryId: string;
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

      // The id makes a heading addressable; the link is how a reader gets the
      // address without reading the source. Hidden until the heading is
      // hovered or the link itself is focused, so it costs a reader who does
      // not want it nothing at all.
      // Empty on purpose: the "#" is drawn by the stylesheet. Put in the
      // markup it becomes part of the heading's own text, so the heading reads
      // as "Why a book?#" — to a screen reader, and to anyone who copies it.
      const anchor = `<a class="anchor" href="#${id}" aria-label="Link to this section"></a>`;

      return `<h${level}${attrs} id="${id}">${inner}${anchor}</h${level}>`;
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
 * The resolution itself is the app's own — the same link resolver the
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
  const resolve = createLinkResolver(candidates);

  return (link) => {
    const found = resolve(link.target);
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

  // From the markdown rather than the rendered HTML: it is the words the
  // author wrote, before a diagram became four kilobytes of SVG.
  const minutes = notes.map((note) => readMinutes(note.markdown));
  const links = options.garden ? gardenLinks(notes) : null;

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
          minutes: minutes[index] ?? 1,
          body,
          theme: options.theme,
          suggestUrl: options.suggestUrl?.(note) ?? null,
          backlinks: links ? links.backlinks[index]!.map((from) => chapters[from]!) : null,
          comments: options.comments ? { config: options.comments, term: note.path } : null,
        }),
      };
    }),
  );

  return {
    chapters,
    files: [
      {
        path: `${INDEX}.html`,
        content: coverPage(options.title, chapters, minutes, options.theme, links),
      },
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
/**
 * The shared stylesheet: what a page looks like, plus what a book adds.
 *
 * Built from the same `pageStyles` a downloaded export inlines, so a chapter
 * and a single published note cannot drift into looking like two products.
 * Everything below is chrome that only exists inside a book — the contents
 * beside the text, the reading column, the strip that says where you are —
 * and it overrides the export's own layout rather than replacing it.
 */
export function stylesheet(theme: "light" | "dark"): string {
  return `${pageStyles(theme)}${GARDEN_STYLES}
/* ── Comments ── */
.book-comments { margin: 3rem 0 0; padding-top: 1.5rem; border-top: 1px solid var(--border, #e5e5e5); }
.book-comments h2 { font-size: 1.1rem; margin: 0 0 .25rem; }
.book-comments-note { font-size: .85rem; opacity: .7; margin: 0 0 1rem; }
/* ── Book chrome ──────────────────────────────────────────────────────────
   A published note is a document: one column, centred, nothing around it.
   A book is a place, and a reader who has just arrived in the middle of one
   needs to see that there is a middle to be in — which is what the contents
   beside the text are for, and why they stay put while the chapter scrolls. */

body.book { padding: 0; }

.book-shell {
  max-width: 72rem;
  margin: 0 auto;
  padding: 0 1.5rem;
}

.book-main { min-width: 0; padding: 1.5rem 0 5rem; }

/* The reading column is narrower than the page's own 46rem.
   Prose beside a table of contents is measured against the column it is in,
   not the window: somewhere near 70 characters is where a line stops needing
   the eye to travel back and find its place. */
.book-main main { max-width: 38rem; margin: 0; }

/* Headings break where the meaning does rather than wherever the box ends,
   and a paragraph never leaves one word alone on its last line. */
.book-main h1, .book-main h2, .book-main h3, .book-side-home, .doc-title {
  text-wrap: balance;
}
.book-main p, .book-main li { text-wrap: pretty; }

@media (min-width: 60rem) {
  .book-shell {
    display: grid;
    grid-template-columns: 14rem minmax(0, 1fr);
    gap: 4.5rem;
    align-items: start;
  }
  .book-main { padding: 3.5rem 0 6rem; }
}

/* ── The contents, beside the text ──
   One list, laid out two ways, because the alternatives were both worse. A
   details element cannot be forced open by a stylesheet — browsers hide its
   contents in a way the display property does not reach — and rendering the
   list twice, to get a disclosure on a phone and a column on a desktop, puts
   every chapter title in the file twice.

   So on a narrow screen it is a strip that scrolls sideways under the header:
   always visible, one line tall, no open-or-closed state to get wrong. On a
   wide screen the same list becomes the column that stays put while the
   chapter scrolls past it. */
.book-side { padding: 1rem 0 0; }

.book-side-home {
  display: block;
  color: var(--fg);
  text-decoration: none;
  font-weight: 650;
  font-size: 1.0625rem;
  line-height: 1.25;
}
.book-side-home:hover { color: var(--accent); }
.book-side-count {
  margin: 0.35rem 0 0.75rem;
  font-size: 0.75rem;
  color: var(--muted);
}

.book-side-list {
  list-style: none;
  margin: 0;
  padding: 0;
  counter-reset: side;
  font-size: 0.875rem;
  line-height: 1.4;

  /* The strip: a short list of links, not a carousel — so no scroll snap and
     no momentum-scrolling incantations. */
  display: flex;
  gap: 1.25rem;
  overflow-x: auto;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--rule);
}
.book-side-list li { counter-increment: side; }
.book-side-list a {
  display: flex;
  gap: 0.5rem;
  color: var(--muted);
  text-decoration: none;
  white-space: nowrap;
}
.book-side-list a::before {
  content: counter(side, decimal-leading-zero);
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  font-size: 0.6875rem;
  padding-top: 0.15em;
  opacity: 0.7;
}
.book-side-list a:hover { color: var(--fg); }
/* Where you are, said once and quietly. */
.book-side-list a[aria-current="page"] { color: var(--accent); font-weight: 600; }

@media (min-width: 60rem) {
  .book-side {
    position: sticky;
    top: 0;
    max-height: 100vh;
    overflow-y: auto;
    padding: 3.5rem 0 2rem;
  }
  .book-side-count { margin-bottom: 1rem; }
  .book-side-list {
    display: block;
    overflow-x: visible;
    padding-bottom: 0;
    border-bottom: none;
  }
  .book-side-list a { padding: 0.375rem 0; white-space: normal; }
}

/* ── A link to a heading, for anyone who wants to point at one ── */
.anchor::after { content: "#"; }
.anchor {
  margin-left: 0.4em;
  color: var(--muted);
  text-decoration: none;
  font-weight: 400;
  opacity: 0;
  transition: opacity 0.12s ease;
}
h1:hover > .anchor, h2:hover > .anchor, h3:hover > .anchor,
h4:hover > .anchor, h5:hover > .anchor, h6:hover > .anchor,
.anchor:focus { opacity: 1; }
.anchor:hover { color: var(--accent); }

/* ── Onwards ── */
.book-foot {
  max-width: 38rem;
  margin: 4rem 0 0;
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
.book-cover { max-width: 46rem; margin: 0 auto; padding: 4rem 1.5rem 6rem; }
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
.book-toc-title { flex: 1; min-width: 0; }
.book-toc-read { font-size: 0.75rem; color: var(--muted); white-space: nowrap; }

/* A wikilink whose target is not in this book. The words are what the author
   wrote and they stay; what goes is the suggestion that clicking does
   something, because it does not. */
a.fl-wikilink-missing {
  color: inherit;
  text-decoration: none;
  cursor: text;
  pointer-events: none;
}

/* Straight past the contents to the words, for anyone arriving by keyboard. */
.book-skip {
  position: absolute;
  left: -9999px;
  background: var(--bg);
  color: var(--fg);
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--rule);
  border-radius: 6px;
}
.book-skip:focus { left: 1rem; top: 1rem; z-index: 10; }

@media print {
  .book-side, .book-foot, .book-skip, .anchor { display: none; }
  .book-shell { display: block; padding: 0; }
  .book-main, .book-main main, .book-cover { max-width: none; padding: 0; }
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

/** "4 min read", or nothing at all for something too short to be worth saying. */
function readingTime(minutes: number): string {
  return `${minutes} min read`;
}

/**
 * How long a chapter takes to read, in minutes.
 *
 * Two hundred words a minute, rounded up, and never zero — the number exists
 * so a reader can decide whether to start now or later, and "0 min" answers
 * that question by looking broken.
 */
export function readMinutes(markdown: string): number {
  const words = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_`~\[\]()!-]/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;

  return Math.max(1, Math.round(words / 200));
}

/** The contents, as the sidebar draws them on every chapter. */
function sidebar(book: string, chapters: readonly BookChapter[], current: number): string {
  const items = chapters
    .map((chapter, index) => {
      const here = index === current ? ' aria-current="page"' : "";
      return `      <li><a href="${chapter.slug}.html"${here}>${escapeHtml(chapter.title)}</a></li>`;
    })
    .join("\n");

  const count = chapters.length === 1 ? "1 chapter" : `${chapters.length} chapters`;

  return `<nav class="book-side" aria-label="Chapters">
  <a class="book-side-home" href="${INDEX}.html">${escapeHtml(book)}</a>
  <p class="book-side-count">${count}</p>
  <ol class="book-side-list">
${items}
  </ol>
</nav>`;
}

/** One chapter, with the book around it. */
function chapterPage(input: {
  book: string;
  chapters: readonly BookChapter[];
  index: number;
  minutes: number;
  body: string;
  theme: "light" | "dark";
  suggestUrl: string | null;
  /** The chapters that link here, in a garden; null in a plain book. */
  backlinks?: readonly BookChapter[] | null;
  /** Comments under the chapter, and the term its discussion is found by. */
  comments?: { config: BookComments; term: string } | null;
}): string {
  const chapter = input.chapters[input.index]!;
  const previous = input.chapters[input.index - 1];
  const next = input.chapters[input.index + 1];
  const where = `Chapter ${input.index + 1} of ${input.chapters.length}`;

  const suggest = input.suggestUrl
    ? `<aside class="doc-suggest">
  <a class="doc-suggest-link" href="${escapeHtml(input.suggestUrl)}" rel="noopener">Suggest an edit</a>
  <span class="doc-suggest-note">Opens this note on GitHub. Your change is sent to the author as a suggestion — nothing here changes until they accept it.</span>
</aside>`
    : "";

  return `${head(`${chapter.title} — ${input.book}`, input.theme)}
<body class="book">
<a class="book-skip" href="#content">Skip to the chapter</a>
<div class="book-shell">
${sidebar(input.book, input.chapters, input.index)}
<div class="book-main">
  <main id="content">
<header class="doc-head">
  <h1 class="doc-title">${escapeHtml(chapter.title)}</h1>
  <p class="doc-meta">${where} · ${readingTime(input.minutes)}</p>
</header>
${input.body}
${backlinkList(input.backlinks ?? null)}
${suggest}
${input.comments ? commentsSection(input.comments.config, input.comments.term, input.theme) : ""}
  </main>
  <nav class="book-foot" aria-label="Chapters either side">
${
  previous
    ? `    <a href="${previous.slug}.html"><span class="book-foot-label">Previous</span>${escapeHtml(previous.title)}</a>`
    : ""
}
${
  next
    ? `    <a class="book-foot-next" href="${next.slug}.html"><span class="book-foot-label">Next</span>${escapeHtml(next.title)}</a>`
    : ""
}
  </nav>
</div>
</div>
</body>
</html>
`;
}

/**
 * Comments under a chapter, by giscus.
 *
 * Loaded lazily and only when a reader scrolls to it, so a page nobody
 * comments on costs its readers nothing. Every value is escaped: the term is
 * a file name, which can hold a quote.
 */
export function commentsSection(
  config: BookComments,
  term: string,
  theme: "light" | "dark",
): string {
  const attributes: Record<string, string> = {
    src: "https://giscus.app/client.js",
    "data-repo": config.repo,
    "data-repo-id": config.repoId,
    "data-category": config.category,
    "data-category-id": config.categoryId,
    "data-mapping": "specific",
    "data-term": term,
    "data-strict": "1",
    "data-reactions-enabled": "1",
    "data-emit-metadata": "0",
    "data-input-position": "bottom",
    "data-theme": theme,
    "data-lang": "en",
    "data-loading": "lazy",
    crossorigin: "anonymous",
  };
  const attrs = Object.entries(attributes)
    .map(([name, value]) => `${name}="${escapeHtml(value)}"`)
    .join(" ");
  return `<section class="book-comments" aria-labelledby="comments">
  <h2 id="comments">Comments</h2>
  <p class="book-comments-note">Comments are GitHub Discussions in ${escapeHtml(config.repo)}. Sign in with GitHub to join in.</p>
  <script ${attrs} async></script>
</section>`;
}

/**
 * "Linked from", under a garden's page.
 *
 * Absent from a plain book, and absent from a page nothing links to: an empty
 * box headed "Linked from" reads as something that failed to load.
 */
function backlinkList(backlinks: readonly BookChapter[] | null): string {
  if (!backlinks || backlinks.length === 0) return "";

  const items = backlinks
    .map(
      (chapter) => `    <li><a href="${chapter.slug}.html">${escapeHtml(chapter.title)}</a></li>`,
    )
    .join("\n");

  return `<aside class="garden-backlinks" aria-label="Pages that link here">
  <h2>Linked from</h2>
  <ul>
${items}
  </ul>
</aside>`;
}

/** The contents page, which is also what the book's own URL serves. */
function coverPage(
  title: string,
  chapters: readonly BookChapter[],
  minutes: readonly number[],
  theme: "light" | "dark",
  links: GardenLinks | null = null,
): string {
  const count = chapters.length === 1 ? "1 chapter" : `${chapters.length} chapters`;
  const total = minutes.reduce((sum, one) => sum + one, 0);

  const items = chapters
    .map(
      (chapter, index) => `    <li><a href="${chapter.slug}.html">
      <span class="book-toc-title">${escapeHtml(chapter.title)}</span>
      <span class="book-toc-read">${readingTime(minutes[index] ?? 1)}</span>
    </a></li>`,
    )
    .join("\n");

  return `${head(title, theme)}
<body class="book">
<main class="book-cover">
<header class="doc-head">
  <h1 class="doc-title">${escapeHtml(title)}</h1>
  <p class="doc-meta">${count} · ${readingTime(total)}</p>
</header>
  <ol class="book-toc">
${items}
  </ol>
${
  links && chapters.length > 1
    ? `<section class="garden" aria-labelledby="garden-map">
  <h2 id="garden-map">How the notes connect</h2>
${gardenMapSvg(
  chapters.map((chapter) => ({ title: chapter.title, href: `${chapter.slug}.html` })),
  links,
)}
</section>`
    : ""
}
</main>
</body>
</html>
`;
}
