import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeHighlight from "rehype-highlight";
import { all as allLanguages } from "lowlight";
import rehypeSanitize, { defaultSchema, type Options as SanitizeSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkStringify from "remark-stringify";
import type { Root as MdastRoot } from "mdast";

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
    "*": [...(defaultSchema.attributes?.["*"] ?? []), "id"],
  },
  tagNames: [...(defaultSchema.tagNames ?? []), "input"],
};

const htmlPipeline = unified()
  .use(remarkParse)
  .use(remarkGfm)
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
  .use(rehypeSanitize, schema)
  .use(rehypeStringify);

/** Renders markdown to sanitised HTML. Safe to inject with innerHTML. */
export function markdownToHtml(markdown: string): string {
  return String(htmlPipeline.processSync(markdown));
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
