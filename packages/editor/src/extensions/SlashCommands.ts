import { Extension } from "@tiptap/core";
import type { Editor } from "@tiptap/core";

/**
 * Slash-command definitions.
 *
 * Kept as data rather than JSX so the list can be filtered, tested and reused
 * by the command palette without dragging React in.
 */
export interface SlashCommand {
  title: string;
  description: string;
  /** Short glyph shown in the menu. */
  icon: string;
  /** Extra words that should match this command when searching. */
  keywords: string[];
  run: (editor: Editor) => void;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    title: "Heading 1",
    description: "Large section heading",
    icon: "H1",
    keywords: ["title", "big", "h1"],
    run: (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run(),
  },
  {
    title: "Heading 2",
    description: "Medium section heading",
    icon: "H2",
    keywords: ["subtitle", "h2"],
    run: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    title: "Heading 3",
    description: "Small section heading",
    icon: "H3",
    keywords: ["h3"],
    run: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run(),
  },
  {
    title: "Text",
    description: "Plain paragraph",
    icon: "¶",
    keywords: ["paragraph", "body", "normal"],
    run: (editor) => editor.chain().focus().setParagraph().run(),
  },
  {
    title: "Diagram",
    description: "Flowchart, sequence, ERD and more",
    icon: "◇",
    keywords: ["mermaid", "flowchart", "chart", "graph", "sequence", "erd", "gantt", "mindmap"],
    run: (editor) => editor.chain().focus().insertMermaidBlock().run(),
  },
  {
    title: "Bulleted list",
    description: "A simple bulleted list",
    icon: "•",
    keywords: ["unordered", "ul", "bullet"],
    run: (editor) => editor.chain().focus().toggleBulletList().run(),
  },
  {
    title: "Numbered list",
    description: "A list with numbers",
    icon: "1.",
    keywords: ["ordered", "ol", "number"],
    run: (editor) => editor.chain().focus().toggleOrderedList().run(),
  },
  {
    title: "To-do list",
    description: "Track tasks with checkboxes",
    icon: "☑",
    keywords: ["task", "checkbox", "todo"],
    run: (editor) => editor.chain().focus().toggleTaskList().run(),
  },
  {
    title: "Code block",
    description: "Syntax-highlighted code",
    icon: "</>",
    keywords: ["snippet", "pre", "monospace"],
    run: (editor) => editor.chain().focus().toggleCodeBlock().run(),
  },
  {
    title: "Quote",
    description: "Set text apart as a quotation",
    icon: "❝",
    keywords: ["blockquote", "citation"],
    run: (editor) => editor.chain().focus().toggleBlockquote().run(),
  },
  {
    title: "Table",
    description: "Insert a 3×3 table",
    icon: "▦",
    keywords: ["grid", "rows", "columns"],
    run: (editor) =>
      editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  },
  {
    title: "Divider",
    description: "A horizontal rule",
    icon: "—",
    keywords: ["hr", "separator", "line", "break"],
    run: (editor) => editor.chain().focus().setHorizontalRule().run(),
  },
  {
    title: "Image",
    description: "Embed an image by URL",
    icon: "🖼",
    keywords: ["picture", "photo", "img"],
    run: (editor) => {
      const url = window.prompt("Image URL");
      // Only http(s) — a javascript: or data: URL here would be an XSS vector.
      if (url && /^https?:\/\//i.test(url)) {
        editor.chain().focus().setImage({ src: url }).run();
      } else if (url) {
        window.alert("Please use an http:// or https:// image URL.");
      }
    },
  },
];

/** Filters commands by a search query typed after the slash. */
export function filterSlashCommands(query: string): SlashCommand[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return SLASH_COMMANDS;

  return SLASH_COMMANDS.filter(
    (command) =>
      command.title.toLowerCase().includes(needle) ||
      command.keywords.some((keyword) => keyword.includes(needle)),
  );
}

/**
 * Tracks whether a slash menu should be open.
 *
 * The trigger rules live here rather than in the React component so they can be
 * unit tested: the menu opens on `/` at the start of an empty-ish paragraph and
 * closes as soon as the query stops matching anything.
 */
export interface SlashState {
  active: boolean;
  query: string;
  /** Document position of the `/` character. */
  from: number;
}

export function readSlashState(editor: Editor): SlashState {
  const { state } = editor;
  const { $from, empty } = state.selection;

  if (!empty) return { active: false, query: "", from: 0 };

  // Only consider the text between the start of the block and the cursor.
  const textBefore = $from.parent.textBetween(0, $from.parentOffset, undefined, "￼");
  const slashIndex = textBefore.lastIndexOf("/");
  if (slashIndex === -1) return { active: false, query: "", from: 0 };

  // A slash mid-word (as in a URL or a path) should not open the menu.
  const charBefore = slashIndex > 0 ? textBefore[slashIndex - 1] : "";
  if (charBefore && !/\s/.test(charBefore)) return { active: false, query: "", from: 0 };

  const query = textBefore.slice(slashIndex + 1);
  // A space ends the query — the user moved on to writing prose.
  if (/\s/.test(query)) return { active: false, query: "", from: 0 };

  return {
    active: true,
    query,
    from: $from.start() + slashIndex,
  };
}

/** No-op extension kept so the menu can later attach ProseMirror plugins. */
export const SlashCommands = Extension.create({
  name: "slashCommands",
});
