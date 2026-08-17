import type { CompletionContext, CompletionResult, Completion } from "@codemirror/autocomplete";
import type { EditorView } from "@codemirror/view";

/**
 * Slash commands for the raw-markdown editor.
 *
 * `/` opened a block menu in the rich-text editor but did nothing in Split or
 * Source view, so the same keystroke silently meant two different things
 * depending on which tab you were on. This makes it work everywhere: the same
 * commands, inserting the markdown the rich editor would have produced.
 *
 * Implemented as a CodeMirror completion source rather than a bespoke popup so
 * it inherits arrow-key navigation, Enter to accept, Escape to dismiss and the
 * existing tooltip theming for free.
 */

interface Snippet {
  label: string;
  detail: string;
  info: string;
  /** Text inserted in place of the `/query`. */
  text: string;
  /**
   * Where to leave the caret, counted from the start of `text`.
   * Defaults to the end.
   */
  cursor?: number;
  keywords?: string[];
}

const SNIPPETS: Snippet[] = [
  {
    label: "Heading 1",
    detail: "#",
    info: "Large section heading",
    text: "# ",
    keywords: ["h1", "title"],
  },
  {
    label: "Heading 2",
    detail: "##",
    info: "Medium section heading",
    text: "## ",
    keywords: ["h2", "subtitle"],
  },
  {
    label: "Heading 3",
    detail: "###",
    info: "Small section heading",
    text: "### ",
    keywords: ["h3"],
  },
  {
    label: "Diagram",
    detail: "mermaid",
    info: "A Mermaid diagram — flowchart, sequence, ERD and more",
    text: "```mermaid\nflowchart TD\n  A[Start] --> B[Finish]\n```\n",
    cursor: 11,
    keywords: ["mermaid", "flowchart", "chart", "graph", "sequence", "erd", "gantt", "mindmap"],
  },
  {
    label: "Bulleted list",
    detail: "-",
    info: "A simple bulleted list",
    text: "- ",
    keywords: ["ul", "bullet", "unordered"],
  },
  {
    label: "Numbered list",
    detail: "1.",
    info: "A list with numbers",
    text: "1. ",
    keywords: ["ol", "ordered", "number"],
  },
  {
    label: "To-do list",
    detail: "- [ ]",
    info: "Track tasks with checkboxes",
    text: "- [ ] ",
    keywords: ["task", "todo", "checkbox"],
  },
  {
    label: "Code block",
    detail: "```",
    info: "Syntax-highlighted code",
    text: "```\n\n```\n",
    cursor: 4,
    keywords: ["snippet", "pre", "monospace"],
  },
  {
    label: "Quote",
    detail: ">",
    info: "Set text apart as a quotation",
    text: "> ",
    keywords: ["blockquote", "citation"],
  },
  {
    label: "Table",
    detail: "3×3",
    info: "Insert a three-column table",
    text: "| Column | Column | Column |\n| --- | --- | --- |\n|  |  |  |\n|  |  |  |\n",
    keywords: ["grid", "rows", "columns"],
  },
  {
    label: "Divider",
    detail: "---",
    info: "A horizontal rule",
    text: "\n---\n\n",
    keywords: ["hr", "separator", "line"],
  },
  {
    label: "Link",
    detail: "[]()",
    info: "A markdown link",
    text: "[](https://)",
    cursor: 1,
    keywords: ["url", "href", "anchor"],
  },
  {
    label: "Image",
    detail: "![]()",
    info: "Embed an image by URL",
    text: "![](https://)",
    cursor: 2,
    keywords: ["picture", "photo", "img"],
  },
  {
    label: "Front matter",
    detail: "---",
    info: "YAML metadata block at the top of the note",
    text: "---\ntitle: \ntags: []\n---\n",
    cursor: 11,
    keywords: ["yaml", "metadata", "frontmatter", "tags"],
  },
];

/**
 * Applies a snippet in place of the typed `/query`.
 *
 * Written as an explicit `apply` rather than letting CodeMirror splice the
 * label in, because the inserted text and the searchable label are different
 * things — you type "/diagram" and get a fenced mermaid block.
 */
function applySnippet(snippet: Snippet) {
  return (view: EditorView, _completion: Completion, from: number, to: number) => {
    const anchor = from + (snippet.cursor ?? snippet.text.length);

    view.dispatch({
      changes: { from, to, insert: snippet.text },
      selection: { anchor },
      scrollIntoView: true,
    });
  };
}

/**
 * Completion source that fires on a `/` at the start of a line or after
 * whitespace — never mid-word, so URLs and file paths are left alone.
 */
export function markdownSlashCommands(context: CompletionContext): CompletionResult | null {
  const match = context.matchBefore(/\/[a-zA-Z]*/);
  if (!match) return null;

  // An explicit invocation (Ctrl-Space) should still open on a bare slash;
  // typing should not, or every path separator would pop the menu.
  if (match.from === match.to && !context.explicit) return null;

  const line = context.state.doc.lineAt(match.from);
  const charBefore = match.from > line.from ? context.state.sliceDoc(match.from - 1, match.from) : "";
  if (charBefore && !/\s/.test(charBefore)) return null;

  // Filtered here rather than by CodeMirror, which only scores against the
  // visible label — that would stop "/erd" or "/flowchart" from finding
  // "Diagram", which is the single most useful thing in this list.
  const needle = match.text.slice(1).toLowerCase();
  const matches = needle
    ? SNIPPETS.filter(
        (snippet) =>
          snippet.label.toLowerCase().includes(needle) ||
          (snippet.keywords ?? []).some((keyword) => keyword.includes(needle)),
      )
    : SNIPPETS;

  if (matches.length === 0) return null;

  return {
    from: match.from,
    // Keeps the menu open while more of the query is typed instead of
    // re-querying the source on every keystroke.
    validFor: /^\/[a-zA-Z]*$/,
    filter: false,
    options: matches.map((snippet) => ({
      label: `/${snippet.label}`,
      detail: snippet.detail,
      info: snippet.info,
      type: "keyword",
      apply: applySnippet(snippet),
    })),
  };
}
