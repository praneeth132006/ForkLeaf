import { Extension } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import type { EditorState, Transaction } from "@tiptap/pm/state";

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
 * Backspace is the other half of the same contract, and undoes exactly what
 * Enter did: see `joinAcross` below.
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

      /**
       * Backspace undoes Enter, one press per press.
       *
       * Deleting the gap between two paragraphs used to run them into each
       * other: the caret went to the start of the second line, Backspace
       * joined the blocks, and `assetfinder tcm-sec.com` and `amass enum -d
       * tcm-sec.com` became one line reading `tcm-sec.comamass`. Two words
       * that were never next to each other now are, and nothing says a
       * character was not deleted — it looks like a typo you made.
       *
       * That is ProseMirror's default and it is the right default for an
       * editor where Enter splits the paragraph. Here Enter makes a line, so
       * the paragraph gap someone is deleting was *two* presses of Enter, and
       * taking it away in one press has to leave the line break behind. Press
       * Backspace again and that break goes too, which is where the old
       * behaviour ends up — a press later, and on purpose.
       */
      Backspace: () =>
        this.editor.commands.command(({ state, tr, dispatch }) =>
          joinAcross(state, tr, Boolean(dispatch), "backward"),
        ),

      /** Delete, from the end of the line above. The same edit, aimed forward. */
      Delete: () =>
        this.editor.commands.command(({ state, tr, dispatch }) =>
          joinAcross(state, tr, Boolean(dispatch), "forward"),
        ),
    };
  },
});

/**
 * Merges two adjacent paragraphs into one, with a line break between them.
 *
 * Declines — leaving ProseMirror's own handling in place — for anything that
 * is not two plain, non-empty, top-level paragraphs with the caret exactly on
 * the boundary between them. Deleting an empty paragraph should still delete
 * it rather than turn it into a break, and a list item, a quote or a table
 * cell has its own idea of what joining means.
 */
function joinAcross(
  state: EditorState,
  tr: Transaction,
  apply: boolean,
  direction: "backward" | "forward",
): boolean {
  const { selection, schema } = state;
  if (!selection.empty) return false;

  const $caret = selection.$from;
  // Top level only, and only between two paragraphs.
  if ($caret.depth !== 1 || $caret.parent.type.name !== "paragraph") return false;

  const atStart = $caret.parentOffset === 0;
  const atEnd = $caret.parentOffset === $caret.parent.content.size;
  if (direction === "backward" ? !atStart : !atEnd) return false;

  const index = $caret.index(0);
  const doc = $caret.node(0);
  const otherIndex = direction === "backward" ? index - 1 : index + 1;
  if (otherIndex < 0 || otherIndex >= doc.childCount) return false;

  const other = doc.child(otherIndex);
  if (other.type.name !== "paragraph") return false;

  // An empty paragraph on either side is a blank line somebody is removing,
  // not two lines they are joining.
  if (other.content.size === 0 || $caret.parent.content.size === 0) return false;

  const hardBreak = schema.nodes.hardBreak;
  if (!hardBreak) return false;

  // The boundary between the two blocks: the closing token of the first sits
  // immediately before it, the opening token of the second immediately after.
  const boundary = direction === "backward" ? $caret.before() : $caret.after();

  if (apply) {
    // Into the end of the first paragraph, then close the gap. Inserting
    // before joining keeps the break on the line it belongs to and moves the
    // boundary along by exactly the one node inserted.
    tr.insert(boundary - 1, hardBreak.create());
    tr.join(boundary + 1);
    // Just after the break, which is where the caret was in relation to the
    // text either side of it before the join.
    tr.setSelection(TextSelection.create(tr.doc, boundary));
    tr.scrollIntoView();
  }

  return true;
}
