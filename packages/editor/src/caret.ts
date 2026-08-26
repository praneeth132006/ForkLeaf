import { TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

/**
 * Puts the caret on a line below whatever was just inserted, making one if the
 * document has nothing there.
 *
 * Blocks that are not text — a pasted screenshot, an embedded video, a diagram
 * — leave the selection *on the node* once they are inserted, so the next
 * keystroke replaces the thing that was just added. Pasting a picture into a
 * note is almost always followed by writing about the picture, and having to
 * know to click below it first is a rule nobody should have to learn.
 *
 * `after` is the position immediately following the inserted node.
 */
export function caretBelow(view: EditorView, after: number): void {
  const { state } = view;
  const target = Math.min(Math.max(after, 0), state.doc.content.size);
  const $after = state.doc.resolve(target);

  /**
   * Three cases, in the order they actually come up.
   *
   * Inserting a block into a paragraph splits it, and the position just after
   * the insertion is then already inside the remainder — an empty line below
   * the picture, which is where the caret belongs and where it now goes.
   * Arithmetic on node sizes got this wrong by exactly the split's two tokens,
   * which is how the caret ended up on the line *above* a pasted screenshot.
   */
  if ($after.parent.isTextblock) {
    view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, target)).scrollIntoView());
    return;
  }

  // A block boundary with something writable underneath: go into it.
  const next = $after.nodeAfter;
  if (next?.isTextblock) {
    view.dispatch(
      state.tr.setSelection(TextSelection.create(state.doc, target + 1)).scrollIntoView(),
    );
    return;
  }

  // Nothing to write in — the end of the note, or another block. Deliberately
  // not searching further down the document: the next textblock might be
  // inside a code block, and typing prose into one is worse than making a
  // line.
  const paragraph = state.schema.nodes.paragraph;
  if (!paragraph) return;

  const tr = state.tr.insert(target, paragraph.create());
  tr.setSelection(TextSelection.create(tr.doc, target + 1));
  view.dispatch(tr.scrollIntoView());
}
