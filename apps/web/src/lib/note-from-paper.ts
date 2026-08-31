import { displayTitle, flattenOutline, type PdfMetadata, type PdfOutlineItem } from "@forkleaf/pdf";
import type { NoteFrontmatter } from "@forkleaf/types";
import { relativeSrc } from "@/lib/assets";

/**
 * Starting a note from a paper, rather than from a blank page.
 *
 * Everything this fills in is already known: the title and author are in the
 * file's own metadata, the section headings are its table of contents, and the
 * page each one begins on is what the outline resolves to. Typing that out by
 * hand is twenty minutes of transcription before a single thought gets
 * written down — and it is transcription, so it is also where the page numbers
 * come out wrong.
 *
 * The headings matter more than the metadata. A blank page asks you to have an
 * opinion about the whole paper at once; a page that already says
 * "Introduction", "Method", "Results" asks you three smaller questions, each
 * beside a link to the pages that answer it.
 *
 * Nothing is invented. A paper with no table of contents gets no headings —
 * inventing a structure for it would be worse than the blank page, because it
 * would be a structure the reader then has to argue with.
 */

export interface PaperNote {
  /** What the note is called, which also decides its filename. */
  title: string;
  frontmatter: NoteFrontmatter;
  /** The body, written relative to `notePath`. */
  content: string;
}

/**
 * How deep into the paper's contents to go.
 *
 * The top level, which is the sections. Unless the top level is one entry —
 * some documents wrap everything in a single root — in which case the level
 * below it is the one that is actually the sections.
 */
function sectionsOf(outline: readonly PdfOutlineItem[]) {
  const rows = flattenOutline(outline);
  const top = rows.filter((row) => row.depth === 0);
  return top.length >= 2 ? top : rows.filter((row) => row.depth <= 1);
}

/**
 * The most headings worth starting with.
 *
 * A paper whose contents list every numbered subsection would otherwise open
 * as ninety empty headings, which is not a page anybody writes on.
 */
const MAX_HEADINGS = 24;

export function paperNote(options: {
  metadata: PdfMetadata;
  /** The document's filename, for a paper whose metadata has no title. */
  filename: string;
  outline: readonly PdfOutlineItem[];
  pageCount: number;
  /**
   * Where the paper lives in the repository, or null for one opened from a
   * desktop — which has no path a note could link to, so the note names it
   * rather than linking to it.
   */
  pdfPath: string | null;
  /** Where the note itself will live, since its links are written relative. */
  notePath: string;
}): PaperNote {
  const title = displayTitle(options.metadata, options.filename);
  const link = (page?: number) => {
    if (!options.pdfPath) return null;
    const target = relativeSrc(options.notePath, options.pdfPath);
    return page ? `${target}#page=${page}` : target;
  };

  const frontmatter: NoteFrontmatter = {
    title,
    tags: ["paper"],
    ...(options.metadata.author ? { author: options.metadata.author } : {}),
    // The date the paper carries, not today's — `created` already records when
    // the note was started, and the two are different facts.
    ...(options.metadata.createdAt ? { published: options.metadata.createdAt.slice(0, 10) } : {}),
    ...(options.pdfPath ? { source: options.pdfPath } : {}),
  };

  const paperLink = link();
  const lines: string[] = [
    `# ${title}`,
    "",
    [
      paperLink ? `[${title}](${paperLink})` : title,
      options.metadata.author,
      `${options.pageCount} page${options.pageCount === 1 ? "" : "s"}`,
    ]
      .filter(Boolean)
      .join(" · "),
    "",
  ];

  const headings = sectionsOf(options.outline).slice(0, MAX_HEADINGS);

  if (headings.length === 0) {
    // No contents to work from, so no structure is invented — an empty
    // heading somebody has to argue with is worse than a blank page.
    lines.push("## Notes", "", "");
  } else {
    for (const heading of headings) {
      lines.push(`## ${heading.title}`, "");

      const pageLink = heading.page == null ? null : link(heading.page);
      if (pageLink) lines.push(`[p. ${heading.page}](${pageLink})`, "");
      else if (heading.page != null) lines.push(`p. ${heading.page}`, "");

      // A blank line under each heading: the place the writing goes.
      lines.push("");
    }
  }

  return { title, frontmatter, content: `${lines.join("\n").trimEnd()}\n` };
}
