import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
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
    code: [...(defaultSchema.attributes?.code ?? []), ["className", /^language-./]],
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
