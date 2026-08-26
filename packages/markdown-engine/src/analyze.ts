import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import { visit } from "unist-util-visit";
import { toString as mdastToString } from "mdast-util-to-string";
import GithubSlugger from "github-slugger";
import type { Root, Code, Heading } from "mdast";

/** Reusable parser — building the unified pipeline per call is measurably slower. */
const parser = unified().use(remarkParse).use(remarkGfm);

export function parseToAst(markdown: string): Root {
  return parser.parse(markdown) as Root;
}

export interface OutlineEntry {
  depth: 1 | 2 | 3 | 4 | 5 | 6;
  text: string;
  /** GitHub-compatible anchor slug, deduplicated across the document. */
  slug: string;
  /** 1-based line number of the heading in the source. */
  line: number;
}

/** Extracts the heading outline, used by the table-of-contents panel. */
export function extractOutline(markdown: string): OutlineEntry[] {
  const slugger = new GithubSlugger();
  const out: OutlineEntry[] = [];

  visit(parseToAst(markdown), "heading", (node: Heading) => {
    const text = mdastToString(node).trim();
    if (!text) return;
    out.push({
      depth: node.depth,
      text,
      slug: slugger.slug(text),
      line: node.position?.start.line ?? 0,
    });
  });

  return out;
}

export interface DiagramBlock {
  /** Mermaid source inside the fence. */
  code: string;
  /** Character offsets of the whole fenced block in the source. */
  start: number;
  end: number;
}

/** Finds every ```mermaid fenced block, for export and preview rendering. */
export function extractMermaidBlocks(markdown: string): DiagramBlock[] {
  const blocks: DiagramBlock[] = [];

  visit(parseToAst(markdown), "code", (node: Code) => {
    if (node.lang !== "mermaid") return;
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (start === undefined || end === undefined) return;
    blocks.push({ code: node.value, start, end });
  });

  return blocks;
}

export interface DocumentStats {
  words: number;
  characters: number;
  /** Characters excluding whitespace. */
  charactersNoSpaces: number;
  headings: number;
  /** Fenced and indented code blocks, mermaid ones included. */
  codeBlocks: number;
  /** The mermaid subset of `codeBlocks`. */
  diagrams: number;
  /** Inline and reference links. An image inside a link counts as both. */
  links: number;
  images: number;
  tasks: { total: number; done: number };
  /** Estimated minutes at 225 wpm, minimum 1 for non-empty documents. */
  readingMinutes: number;
}

const WORD_RE = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;
const TASK_RE = /^[ \t]*[-*+] \[( |x|X)\]/gm;
/**
 * The markup a coloured highlight is written as.
 *
 * It is markup, not writing: counting `mark class fl hl blue` as five words
 * made the word count jump every time somebody highlighted a sentence, which
 * is the opposite of what a word count is for.
 */
const HIGHLIGHT_TAG_RE = /<\/?mark(?: class="fl-hl-[a-z]+")?>/g;

/**
 * Words in a document, ignoring highlight markup.
 *
 * Split out of `documentStats` because the history timeline needs this one
 * number for every revision of a note and nothing else it computes: parsing
 * thirty revisions to markdown ASTs to count words would be thirty parses
 * spent on a figure a regular expression already has.
 */
export function countWords(markdown: string): number {
  return markdown.replace(HIGHLIGHT_TAG_RE, "").match(WORD_RE)?.length ?? 0;
}

/** Cheap document statistics for the properties panel. */
export function documentStats(markdown: string): DocumentStats {
  const prose = markdown.replace(HIGHLIGHT_TAG_RE, "");
  const words = countWords(markdown);

  let total = 0;
  let done = 0;
  for (const match of markdown.matchAll(TASK_RE)) {
    total += 1;
    if (match[1] !== " ") done += 1;
  }

  // One parse and one walk. This used to call extractOutline and
  // extractMermaidBlocks, which parsed the whole document again each — three
  // passes to answer four questions, on a function the panel calls on every
  // keystroke.
  let headings = 0;
  let codeBlocks = 0;
  let diagrams = 0;
  let links = 0;
  let images = 0;

  visit(parseToAst(markdown), (node) => {
    switch (node.type) {
      case "heading":
        // Matches extractOutline, which leaves out headings with no text.
        if (mdastToString(node).trim()) headings += 1;
        break;
      case "code":
        codeBlocks += 1;
        if ((node as Code).lang === "mermaid") diagrams += 1;
        break;
      case "link":
      case "linkReference":
        links += 1;
        break;
      case "image":
      case "imageReference":
        images += 1;
        break;
    }
  });

  return {
    words,
    characters: prose.length,
    charactersNoSpaces: prose.replace(/\s/g, "").length,
    headings,
    codeBlocks,
    diagrams,
    links,
    images,
    tasks: { total, done },
    readingMinutes: words === 0 ? 0 : Math.max(1, Math.round(words / 225)),
  };
}

/**
 * Works out a display title for a note, in priority order:
 * frontmatter title → first H1 → filename without extension.
 */
export function deriveTitle(markdown: string, frontmatterTitle: unknown, path: string): string {
  if (typeof frontmatterTitle === "string" && frontmatterTitle.trim()) {
    return frontmatterTitle.trim();
  }

  const heading = extractOutline(markdown).find((h) => h.depth === 1);
  if (heading) return heading.text;

  const base = path.split("/").pop() ?? "Untitled";
  return base.replace(/\.mdx?$/i, "") || "Untitled";
}

/** Collects tags from frontmatter and inline `#tag` mentions. */
export function extractTags(markdown: string, frontmatterTags: unknown): string[] {
  const tags = new Set<string>();

  if (Array.isArray(frontmatterTags)) {
    for (const t of frontmatterTags) {
      if (typeof t === "string" && t.trim()) tags.add(t.trim());
    }
  }

  // Only match hashtags that begin a word, and skip markdown headings (`# foo`)
  // by requiring a non-space character straight after the hash.
  for (const match of markdown.matchAll(/(?:^|[\s(])#([\p{L}][\p{L}\p{N}_/-]*)/gu)) {
    if (match[1]) tags.add(match[1]);
  }

  return [...tags].sort();
}
