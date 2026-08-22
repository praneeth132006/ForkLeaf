import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeHighlight from "rehype-highlight";
import { all as allLanguages } from "lowlight";
import rehypeSanitize, { defaultSchema, type Options as SanitizeSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkStringify from "remark-stringify";
import { visit } from "unist-util-visit";
import type { Root as MdastRoot, Text as MdastText, PhrasingContent, Parent } from "mdast";
import type { Root as HastRoot, Element } from "hast";

/**
 * Markdown → HTML rendering.
 *
 * Output is always sanitised. Note content can arrive from a public GitHub repo
 * that the user merely has read access to, so it is untrusted input: rendering
 * raw HTML from it would be a stored-XSS hole in the preview pane.
 */

/**
 * Sanitiser schema extended for the features we actually use:
 * task-list checkboxes, heading anchors, syntax-highlight class names, and the
 * `data-mermaid` marker we attach to diagram placeholders.
 */
const schema: SanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    // `hljs` sits alongside `language-*` on the <code> the highlighter wraps;
    // without it the stylesheet has nothing to hook onto.
    code: [...(defaultSchema.attributes?.code ?? []), ["className", /^language-./, "hljs"]],
    pre: [...(defaultSchema.attributes?.pre ?? []), ["className", "hljs"]],
    span: [...(defaultSchema.attributes?.span ?? []), ["className", /^hljs-/]],
    input: [
      ...(defaultSchema.attributes?.input ?? []),
      "checked",
      "disabled",
      ["type", "checkbox"],
    ],
    div: [...(defaultSchema.attributes?.div ?? []), "className", "dataMermaid"],
    // `loading` keeps a note full of screenshots from fetching every one of
    // them at once; the rest are what the default schema already allows.
    img: [...(defaultSchema.attributes?.img ?? []), ["loading", "lazy"]],
    "*": [...(defaultSchema.attributes?.["*"] ?? []), "id"],
  },
  // `mark` is what `==highlight==` becomes. The editor has always offered
  // highlighting; without this the preview showed the equals signs as literal
  // text, so the button appeared to do nothing.
  tagNames: [...(defaultSchema.tagNames ?? []), "input", "mark"],
  protocols: {
    ...defaultSchema.protocols,
    // Notes written offline embed their images inline, so `data:` has to
    // survive sanitisation. `src` is only reachable on `img` here, and the
    // rewrite step below has already thrown out every data URL that is not a
    // raster image — an `<img>` cannot run script in any case.
    src: [...(defaultSchema.protocols?.src ?? []), "data"],
  },
};

/** Data URLs allowed through: raster images only, never a document format. */
const SAFE_DATA_IMAGE =
  /^data:image\/(png|jpeg|jpg|gif|webp|avif|bmp|x-icon|vnd\.microsoft\.icon);base64,/i;

/**
 * `==text==` → `<mark>text</mark>`.
 *
 * Not part of CommonMark or GFM, so nothing upstream parses it — but it is the
 * convention every markdown note-taking tool has settled on, and it is what
 * the rich-text editor writes when you highlight something. Implemented as a
 * pass over text nodes rather than a micromark extension because the syntax
 * has no nesting rules worth honouring: it is a pair of delimiters on one line.
 */
function remarkHighlight() {
  return (tree: MdastRoot) => {
    visit(
      tree,
      "text",
      (node: MdastText, index: number | undefined, parent: Parent | undefined) => {
        if (!parent || index === undefined || !node.value.includes("==")) return;

        const parts: PhrasingContent[] = [];
        const pattern = /==(?!\s)([^=\n]+?)(?<!\s)==/g;
        let cursor = 0;
        let match: RegExpExecArray | null;

        while ((match = pattern.exec(node.value)) !== null) {
          if (match.index > cursor) {
            parts.push({ type: "text", value: node.value.slice(cursor, match.index) });
          }
          parts.push({
            type: "emphasis",
            children: [{ type: "text", value: match[1] ?? "" }],
            // Rendered as <mark> rather than <em>; the node type is only a
            // carrier for the phrasing content.
            data: { hName: "mark" },
          });
          cursor = match.index + match[0].length;
        }

        if (parts.length === 0) return;
        if (cursor < node.value.length) {
          parts.push({ type: "text", value: node.value.slice(cursor) });
        }

        parent.children.splice(index, 1, ...parts);
        // Skip past what was just inserted.
        return index + parts.length;
      },
    );
  };
}

export interface RenderOptions {
  /**
   * Maps an image `src` written in the note to one the browser can load.
   *
   * Notes reference images by repository-relative path, which is what makes
   * them render on github.com; the page showing them has no way to resolve
   * such a path on its own. Rendering is where the two meet.
   */
  resolveImageSrc?: (src: string) => string;
}

/**
 * Rewrites image sources, and drops the ones nothing should load.
 *
 * Runs before the sanitiser, so whatever a resolver hands back is still
 * subject to the same schema as everything else in the document.
 */
function rehypeImages(options: RenderOptions) {
  return (tree: HastRoot) => {
    visit(tree, "element", (node: Element) => {
      if (node.tagName !== "img") return;

      const src = typeof node.properties?.src === "string" ? node.properties.src : "";
      if (!src) return;

      if (src.startsWith("data:")) {
        // A `data:` document — SVG, HTML — has no business being an image.
        if (!SAFE_DATA_IMAGE.test(src)) delete node.properties.src;
        return;
      }

      if (options.resolveImageSrc) node.properties.src = options.resolveImageSrc(src);
      node.properties.loading = "lazy";
    });
  };
}

const buildHtmlPipeline = (options: RenderOptions) =>
  unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkHighlight)
    // allowDangerousHtml is deliberately off — inline HTML in notes is escaped.
    .use(remarkRehype)
    // Highlighting runs *before* sanitising, so the `hljs-` spans it emits are
    // subject to the same schema as everything else.
    //
    // The full language set, not highlight.js's `common` bundle: common is ~35
    // languages and silently renders anything outside it — Zig, Nim, Elixir,
    // Haskell — as flat grey text, which is exactly the case someone writing
    // documentation for an unusual project runs into. `detect` stays off, since
    // guessing the language of an unlabelled three-line snippet is usually wrong
    // and colours it misleadingly.
    .use(rehypeHighlight, { detect: false, languages: allLanguages })
    .use(rehypeImages, options)
    .use(rehypeSanitize, schema)
    .use(rehypeStringify);

/**
 * The pipeline with no image resolver, built once.
 *
 * Assembling a unified pipeline is not free, and the overwhelmingly common
 * case — rendering with default options — should not pay for it on every
 * keystroke of a live preview.
 */
const defaultHtmlPipeline = buildHtmlPipeline({});

/** Renders markdown to sanitised HTML. Safe to inject with innerHTML. */
export function markdownToHtml(markdown: string, options?: RenderOptions): string {
  const pipeline = options?.resolveImageSrc ? buildHtmlPipeline(options) : defaultHtmlPipeline;
  return String(pipeline.processSync(markdown));
}

const stringifyPipeline = unified().use(remarkStringify, {
  bullet: "-",
  emphasis: "_",
  strong: "*",
  fence: "`",
  fences: true,
  rule: "-",
  listItemIndent: "one",
});

/** Serialises an mdast tree back to markdown with our house formatting. */
export function astToMarkdown(tree: MdastRoot): string {
  return stringifyPipeline.stringify(tree);
}

/**
 * Normalises markdown formatting (bullet style, fence style, spacing) by doing a
 * parse/stringify round trip. Used by the "Format document" command.
 */
export function formatMarkdown(markdown: string): string {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(markdown) as MdastRoot;
  return astToMarkdown(tree);
}
