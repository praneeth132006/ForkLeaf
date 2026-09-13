import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { GapCursor } from "@tiptap/pm/gapcursor";

/**
 * Somewhere to write next to a block that is not text.
 *
 * A code block, a diagram, an image or a rule that ends the note ends the
 * note: there is no paragraph after it to put a caret in, clicking the empty
 * space underneath drops the caret *into* the block — so the next sentence is
 * typed inside the code — and there is no key that makes a new line below it.
 * The same thing happens between two such blocks, which is how a code block
 * followed by a horizontal rule became a place nobody could write.
 *
 * ProseMirror already has a gap cursor for the between case, and it is now
 * drawn (see `.ProseMirror-gapcursor` in the stylesheet) rather than being an
 * invisible thing you have to know exists. This adds the two ways people
 * actually reach for:
 *
 * - clicking the empty space below the last block puts a paragraph there;
 * - ↓ from the last block does the same, for anyone not using a mouse.
 *
 * Deliberately on demand. The obvious alternative — always keeping a trailing
 * paragraph in the document — rewrites every note that ends in a code block
 * the moment it is opened, which on a connected repository is a commit nobody
 * asked for.
 */
export const RoomToWrite = Extension.create({
  name: "roomToWrite",

  addKeyboardShortcuts() {
    return {
      /** Down from the last block, when there is nothing below it to reach. */
      ArrowDown: () => {
        const { state, view } = this.editor;
        const { selection } = state;
        const last = state.doc.lastChild;
        if (!last || isWritable(last.type.name)) return false;

        // Only when the selection is actually in that last block.
        const lastStart = state.doc.content.size - last.nodeSize;
        if (selection.from < lastStart) return false;

        return appendParagraph(state, view);
      },

      /** Enter at a gap cursor, which otherwise waits for a character. */
      Enter: () => {
        const { state, view } = this.editor;
        if (!(state.selection instanceof GapCursor)) return false;

        const paragraph = state.schema.nodes.paragraph;
        if (!paragraph) return false;

        const tr = state.tr.insert(state.selection.from, paragraph.create());
        tr.setSelection(TextSelection.create(tr.doc, state.selection.from + 1));
        view.dispatch(tr.scrollIntoView());
        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("roomToWrite"),
        props: {
          handleDOMEvents: {
            mousedown: (view, event) => {
              if ((event as MouseEvent).button !== 0) return false;
              if (!roomBelow(view, (event as MouseEvent).clientY)) return false;
              event.preventDefault();
              return true;
            },
          },
        },
      }),
    ];
  },
});

/**
 * A click below everything in the note, when the note ends in a block that
 * cannot be typed in: a paragraph goes there, with the caret in it.
 *
 * Exported for the editor's surroundings as well as the editor itself. In a
 * note taller than the screen, the empty space under the last block is the
 * padding of the page around the editor, not the editor — so a click there
 * never reached the handler above, and a note ending in a canvas or a card
 * had nowhere to type after it.
 */
export function roomBelow(view: EditorView, clientY: number): boolean {
  const last = view.state.doc.lastChild;
  if (!last || isWritable(last.type.name)) return false;

  // Below everything in the document, rather than on it: a click on the block
  // itself must still go where it was aimed.
  const dom = view.dom as HTMLElement;
  const bottom = dom.lastElementChild?.getBoundingClientRect().bottom;
  if (bottom === undefined || clientY <= bottom) return false;
  if (!dom.getBoundingClientRect().width) return false;

  return appendParagraph(view.state, view);
}

/** Blocks you can already type in, which need no help from any of this. */
function isWritable(name: string): boolean {
  return name === "paragraph" || name === "heading" || name === "blockquote" || name === "listItem";
}

/** A new paragraph at the end of the document, with the caret in it. */
function appendParagraph(
  state: EditorState,
  view: { dispatch: (tr: Transaction) => void } | EditorView,
): boolean {
  const paragraph = state.schema.nodes.paragraph;
  if (!paragraph) return false;

  const end = state.doc.content.size;
  const tr = state.tr.insert(end, paragraph.create());
  tr.setSelection(TextSelection.create(tr.doc, end + 1));
  view.dispatch(tr.scrollIntoView());
  return true;
}
