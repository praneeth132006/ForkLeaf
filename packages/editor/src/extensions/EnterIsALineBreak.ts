import { Extension } from "@tiptap/core";

/**
 * Enter makes a line, not a paragraph.
 *
 * Tiptap's default is to split the paragraph, which serialises to a blank line
 * — markdown's paragraph separator. That is correct markdown and the wrong
 * contract for this editor: pressing Enter once in rich text put *two* lines in
 * the source view, so the two surfaces never lined up and writing in one while
 * watching the other was disorienting. "One line here is one line there" is the
 * thing people actually rely on in a split view.
 *
 * So Enter inserts a hard break instead. With `breaks` on in the markdown
 * parser, a hard break round-trips as a bare newline, which is exactly the
 * one-to-one mapping the split view needs.
 *
 * A paragraph gap is still available and still honest: press Enter twice. Two
 * breaks serialise to a blank line, markdown reads that back as two paragraphs,
 * and it re-serialises to the same blank line — so the file is stable however
 * the document happens to be shaped in memory.
 *
 * This deliberately does *not* touch Enter anywhere it already means something
 * else. In a list it makes the next item, in a heading it starts the paragraph
 * after it, in a table it moves on, in a code block it does what a code block
 * does. Overriding those would trade one surprise for five.
 */

/** Contexts where Enter already has a better meaning than "new line". */
const RESERVED = [
  "listItem",
  "taskItem",
  "codeBlock",
  "table",
  "tableCell",
  "tableHeader",
  "heading",
] as const;

export const EnterIsALineBreak = Extension.create({
  name: "enterIsALineBreak",

  addKeyboardShortcuts() {
    return {
      Enter: () => {
        const { editor } = this;

        // Not a plain paragraph — a heading, a list, a table cell. Let the
        // node that owns Enter handle it.
        if (!editor.isActive("paragraph")) return false;
        if (RESERVED.some((node) => editor.isActive(node))) return false;

        return editor.commands.setHardBreak();
      },

      /**
       * Shift+Enter keeps splitting the paragraph, so the two are simply
       * swapped rather than one of them being taken away. Anyone who wants
       * markdown's real paragraph break still has a single keystroke for it.
       */
      "Shift-Enter": () => {
        const { editor } = this;
        if (!editor.isActive("paragraph")) return false;
        if (RESERVED.some((node) => editor.isActive(node))) return false;

        return editor.commands.splitBlock();
      },
    };
  },
});
