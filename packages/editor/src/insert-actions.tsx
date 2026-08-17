"use client";

import React from "react";
import type { Editor } from "@tiptap/core";
import type { InsertAction } from "./EditorToolbar";
import type { SourceEditorHandle } from "./SourceEditor";

/**
 * The single definition of "what you can insert into a note".
 *
 * Each entry knows how to apply itself to a ProseMirror document *and* to a
 * markdown string, which is what lets the toolbar, the `/` menu in rich text
 * and the `/` menu in Source all offer exactly the same list.
 */
export interface InsertDefinition extends InsertAction {
  rich: (editor: Editor) => void;
  /** Markdown to splice in, and where to leave the caret inside it. */
  markdown: { text: string; cursor?: number };
  /** Extra words that should match this action when searching. */
  keywords?: string[];
  /**
   * Which surfaces can offer this.
   *
   * A few Markdown constructs are supported by the renderer (remark-gfm) but
   * have no Tiptap node — footnotes are the clearest case. Offering those in
   * rich text would insert something the block editor cannot represent, so the
   * menus filter by view instead of showing an item that half-works.
   */
  availableIn?: "both" | "rich" | "source";
}

/** Prompts for an image URL, rejecting anything that is not http(s). */
function promptImageUrl(): string | null {
  const url = window.prompt("Image URL");
  if (!url) return null;

  // A javascript: or data: URL here would be a stored-XSS vector in every
  // renderer that later displays the note.
  if (!/^https?:\/\//i.test(url)) {
    window.alert("Please use an http:// or https:// image URL.");
    return null;
  }
  return url;
}

const MERMAID_STARTER = "flowchart TD\n  A[Start] --> B[Finish]";

export const INSERT_DEFINITIONS: InsertDefinition[] = [
  {
    id: "diagram",
    keywords: [
      "mermaid",
      "flowchart",
      "chart",
      "graph",
      "sequence",
      "erd",
      "gantt",
      "mindmap",
      "uml",
    ],
    label: "Diagram",
    hint: "Flowchart, sequence, ERD, Gantt and more",
    primary: true,
    icon: <Glyph d="M3 3h4v4H3zM9 9h4v4H9zM5 7v2h4M11 3h2M11 5h2" />,
    rich: (editor) => editor.chain().focus().insertMermaidBlock().run(),
    markdown: { text: `\`\`\`mermaid\n${MERMAID_STARTER}\n\`\`\`\n`, cursor: 11 },
  },
  {
    id: "h1",
    keywords: ["title", "big", "heading"],
    label: "Heading 1",
    hint: "Large section heading",
    icon: <TextGlyph>H1</TextGlyph>,
    rich: (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run(),
    markdown: { text: "# " },
  },
  {
    id: "h2",
    keywords: ["subtitle", "heading"],
    label: "Heading 2",
    hint: "Medium section heading",
    icon: <TextGlyph>H2</TextGlyph>,
    rich: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    markdown: { text: "## " },
  },
  {
    id: "h3",
    keywords: ["heading"],
    label: "Heading 3",
    hint: "Small section heading",
    icon: <TextGlyph>H3</TextGlyph>,
    rich: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run(),
    markdown: { text: "### " },
  },
  {
    id: "paragraph",
    keywords: ["text", "body", "normal"],
    label: "Text",
    hint: "Plain paragraph",
    icon: <TextGlyph>¶</TextGlyph>,
    rich: (editor) => editor.chain().focus().setParagraph().run(),
    markdown: { text: "\n" },
  },
  {
    id: "bullet",
    keywords: ["ul", "unordered", "list"],
    label: "Bulleted list",
    hint: "A simple bulleted list",
    icon: <Glyph d="M4 4h.01M4 8h.01M4 12h.01M7 4h6M7 8h6M7 12h6" />,
    rich: (editor) => editor.chain().focus().toggleBulletList().run(),
    markdown: { text: "- " },
  },
  {
    id: "ordered",
    keywords: ["ol", "number", "list"],
    label: "Numbered list",
    hint: "A list with numbers",
    icon: <TextGlyph>1.</TextGlyph>,
    rich: (editor) => editor.chain().focus().toggleOrderedList().run(),
    markdown: { text: "1. " },
  },
  {
    id: "task",
    keywords: ["todo", "checkbox", "checklist"],
    label: "To-do list",
    hint: "Track tasks with checkboxes",
    icon: <Glyph d="M2.5 4.5h4v4h-4zM3.5 6.5l1 1 2-2.5M9 6.5h5M2.5 11.5h4M9 11.5h5" />,
    rich: (editor) => editor.chain().focus().toggleTaskList().run(),
    markdown: { text: "- [ ] " },
  },
  {
    id: "code",
    keywords: ["snippet", "pre", "monospace", "fence"],
    label: "Code block",
    hint: "Syntax-highlighted code",
    icon: <TextGlyph>{"</>"}</TextGlyph>,
    rich: (editor) => editor.chain().focus().toggleCodeBlock().run(),
    markdown: { text: "```\n\n```\n", cursor: 4 },
  },
  {
    id: "quote",
    keywords: ["blockquote", "citation"],
    label: "Quote",
    hint: "Set text apart as a quotation",
    icon: <TextGlyph>❝</TextGlyph>,
    rich: (editor) => editor.chain().focus().toggleBlockquote().run(),
    markdown: { text: "> " },
  },
  {
    id: "table",
    keywords: ["grid", "rows", "columns"],
    label: "Table",
    hint: "A three-column table with a header row",
    icon: <Glyph d="M2.5 3.5h11v9h-11zM2.5 6.5h11M6 6.5v6M10 6.5v6" />,
    rich: (editor) =>
      editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
    markdown: {
      text: "| Column | Column | Column |\n| --- | --- | --- |\n|  |  |  |\n|  |  |  |\n",
    },
  },
  {
    id: "divider",
    keywords: ["hr", "separator", "line", "rule"],
    label: "Divider",
    hint: "A horizontal rule",
    icon: <Glyph d="M2.5 8h11" />,
    rich: (editor) => editor.chain().focus().setHorizontalRule().run(),
    markdown: { text: "\n---\n\n" },
  },
  {
    id: "link",
    keywords: ["url", "href", "anchor"],
    label: "Link",
    hint: "Link out to a URL",
    icon: (
      <Glyph d="M6.5 9.5 9.5 6.5M6 4.5 7.5 3a2.8 2.8 0 0 1 4 4l-1.5 1.5M10 11.5 8.5 13a2.8 2.8 0 0 1-4-4L6 7.5" />
    ),
    rich: (editor) => {
      const url = window.prompt("Link URL");
      if (url && /^(https?:\/\/|mailto:)/i.test(url)) {
        editor.chain().focus().setLink({ href: url }).run();
      } else if (url) {
        window.alert("Please use an http://, https:// or mailto: link.");
      }
    },
    markdown: { text: "[](https://)", cursor: 1 },
  },
  {
    id: "image",
    keywords: ["picture", "photo", "img"],
    label: "Image",
    hint: "Embed an image by URL",
    icon: <Glyph d="M2.5 3.5h11v9h-11zM2.5 10l3-3 3 3 2-2 2.5 2.5M10 6h.01" />,
    rich: (editor) => {
      const url = promptImageUrl();
      if (url) editor.chain().focus().setImage({ src: url }).run();
    },
    markdown: { text: "![](https://)", cursor: 2 },
  },
  {
    id: "h4",
    keywords: ["heading"],
    label: "Heading 4",
    hint: "Fourth-level heading",
    icon: <TextGlyph>H4</TextGlyph>,
    rich: (editor) => editor.chain().focus().toggleHeading({ level: 4 }).run(),
    markdown: { text: "#### " },
  },
  {
    id: "h5",
    keywords: ["heading"],
    label: "Heading 5",
    hint: "Fifth-level heading",
    icon: <TextGlyph>H5</TextGlyph>,
    rich: (editor) => editor.chain().focus().toggleHeading({ level: 5 }).run(),
    markdown: { text: "##### " },
  },
  {
    id: "h6",
    keywords: ["heading"],
    label: "Heading 6",
    hint: "Sixth-level heading",
    icon: <TextGlyph>H6</TextGlyph>,
    rich: (editor) => editor.chain().focus().toggleHeading({ level: 6 }).run(),
    markdown: { text: "###### " },
  },
  {
    id: "bold",
    keywords: ["strong", "b"],
    label: "Bold",
    hint: "Bold the selection, or start bold text",
    icon: <TextGlyph>B</TextGlyph>,
    rich: (editor) => editor.chain().focus().toggleBold().run(),
    markdown: { text: "****", cursor: 2 },
  },
  {
    id: "italic",
    keywords: ["emphasis", "em", "i"],
    label: "Italic",
    hint: "Italicise the selection, or start italic text",
    icon: <TextGlyph>I</TextGlyph>,
    rich: (editor) => editor.chain().focus().toggleItalic().run(),
    markdown: { text: "__", cursor: 1 },
  },
  {
    id: "strike",
    keywords: ["strikethrough", "cross out", "del"],
    label: "Strikethrough",
    hint: "Cross out the selection",
    icon: <TextGlyph>S</TextGlyph>,
    rich: (editor) => editor.chain().focus().toggleStrike().run(),
    markdown: { text: "~~~~", cursor: 2 },
  },
  {
    id: "inline-code",
    keywords: ["monospace", "tick", "backtick"],
    label: "Inline code",
    hint: "Code inside a sentence",
    icon: <TextGlyph>`</TextGlyph>,
    rich: (editor) => editor.chain().focus().toggleCode().run(),
    markdown: { text: "``", cursor: 1 },
  },
  {
    id: "break",
    keywords: ["newline", "br", "hard break"],
    label: "Line break",
    hint: "Break the line without starting a paragraph",
    icon: <Glyph d="M13 3.5v4a2 2 0 0 1-2 2H3.5M6 7 3.5 9.5 6 12" />,
    rich: (editor) => editor.chain().focus().setHardBreak().run(),
    // Two trailing spaces is the portable hard break; a backslash is not
    // understood by every renderer.
    markdown: { text: "  \n" },
  },
  {
    id: "footnote",
    keywords: ["reference", "citation", "note"],
    label: "Footnote",
    hint: "A numbered note collected at the end",
    icon: <TextGlyph>[^]</TextGlyph>,
    // remark-gfm renders footnotes, but Tiptap has no node for them, so this
    // is offered only where it round-trips: the raw Markdown views.
    availableIn: "source",
    rich: () => undefined,
    markdown: { text: "[^1]\n\n[^1]: ", cursor: 4 },
  },
  {
    id: "frontmatter",
    keywords: ["yaml", "metadata", "tags", "title"],
    label: "Front matter",
    hint: "YAML metadata block at the top of the note",
    icon: <TextGlyph>---</TextGlyph>,
    // The properties panel writes this too; here it is for people editing raw.
    availableIn: "source",
    rich: () => undefined,
    markdown: { text: "---\ntitle: \ntags: []\n---\n", cursor: 11 },
  },
];

/** Which surface is asking. Rich text and raw Markdown differ in what they can hold. */
export type InsertSurface = "rich" | "source";

/** The definitions a surface can actually apply. */
export function insertDefinitionsFor(surface: InsertSurface): InsertDefinition[] {
  return INSERT_DEFINITIONS.filter(
    (definition) =>
      (definition.availableIn ?? "both") === "both" || definition.availableIn === surface,
  );
}

/** Toolbar-shaped view of the definitions, without the apply functions. */
export function insertActionsFor(surface: InsertSurface): InsertAction[] {
  return insertDefinitionsFor(surface).map(({ id, label, hint, icon, primary }) => ({
    id,
    label,
    hint,
    icon,
    ...(primary ? { primary } : {}),
  }));
}

/** Applies an action to the rich-text editor. */
export function runRichAction(editor: Editor, id: string): void {
  INSERT_DEFINITIONS.find((definition) => definition.id === id)?.rich(editor);
}

/** Applies an action to a CodeMirror source editor, at the caret. */
export function runSourceAction(handle: SourceEditorHandle | null, id: string): void {
  const definition = INSERT_DEFINITIONS.find((item) => item.id === id);
  if (!definition || !handle) return;

  if (definition.id === "image") {
    const url = promptImageUrl();
    if (url) handle.insertAtCursor(`![](${url})`, 2);
    return;
  }

  if (definition.id === "link") {
    const url = window.prompt("Link URL");
    if (url && !/^(https?:\/\/|mailto:)/i.test(url)) {
      window.alert("Please use an http://, https:// or mailto: link.");
      return;
    }
    handle.insertAtCursor(`[](${url ?? "https://"})`, 1);
    return;
  }

  handle.insertAtCursor(definition.markdown.text, definition.markdown.cursor);
}

// ─── Icon helpers ───────────────────────────────────────────────────────────

function Glyph({ d }: { d: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  );
}

function TextGlyph({ children }: { children: React.ReactNode }) {
  return (
    <span aria-hidden="true" className="text-[11px] font-semibold leading-none">
      {children}
    </span>
  );
}

/** Filters a surface's action list by a query typed after a slash. */
export function filterInsertActions(
  query: string,
  surface: InsertSurface = "rich",
): InsertDefinition[] {
  const available = insertDefinitionsFor(surface);
  const needle = query.trim().toLowerCase();
  if (!needle) return available;

  return available.filter(
    (action) =>
      action.label.toLowerCase().includes(needle) ||
      (action.keywords ?? []).some((keyword) => keyword.includes(needle)),
  );
}
