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
  const paragraph = state.schema.nodes.paragraph;
  if (!paragraph) return;

  const next = after < state.doc.content.size ? state.doc.resolve(after).nodeAfter : null;
  const tr = state.tr;

  // Only when there is nothing writable there already: pasting above an
  // existing paragraph should use that paragraph rather than add an empty one.
  if (!next || !next.isTextblock) {
    tr.insert(after, paragraph.create());
  }

  tr.setSelection(TextSelection.create(tr.doc, Math.min(after + 1, tr.doc.content.size)));
  view.dispatch(tr.scrollIntoView());
}
