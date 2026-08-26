import { Extension } from "@tiptap/core";
import type { Editor } from "@tiptap/core";

/**
 * Getting out of inline code, or out of a link, without leaving the line.
 *
 * Marks that reach the end of the text carry on: type after a code span and
 * the new words are code too, type after a link and they are part of the link.
 * Tiptap has an answer — `exitable` marks step out when you press → at the end
 * of a *node* — but a node here is a paragraph, and Enter in this editor makes
 * a line rather than a paragraph. So the escape only worked on the last line
 * of a paragraph, and everywhere else the only way out of a code span was to
 * start a new line and come back, or to select the following words and untick
 * the button. People wrote the rest of the sentence in monospace instead.
 *
 * This is the same gesture, extended to where the writing actually happens:
 * pressing → at the end of a code span or a link — end of the line, end of the
 * paragraph, or with the rest of the line already written — drops the mark and
 * puts the caret outside it. At the very end of a line it leaves a space
 * behind, because a caret with nothing after it needs somewhere to sit that is
 * visibly *not* in the code; mid-line it simply steps over the boundary, which
 * is what → has always done there.
 *
 * Escape does the same thing without moving the caret at all, for anyone who
 * would rather not have the space.
 */

/** The marks that trap the caret. Bold and the rest have an obvious toggle. */
const TRAPPING = ["code", "link"] as const;

export const LeaveInlineMark = Extension.create({
  name: "leaveInlineMark",

  addKeyboardShortcuts() {
    return {
      ArrowRight: () => leave(this.editor, true),
      Escape: () => leave(this.editor, false),
    };
  },
});

function leave(editor: Editor, spacer: boolean): boolean {
  const { state } = editor;
  const { selection, storedMarks } = state;
  if (!selection.empty) return false;

  const $caret = selection.$from;
  const here = storedMarks ?? $caret.marks();
  const trapping = here.filter((mark) =>
    TRAPPING.includes(mark.type.name as (typeof TRAPPING)[number]),
  );
  if (trapping.length === 0) return false;

  // Only at the end of the run: anywhere else, → moves through the text and
  // the mark ends on its own.
  const after = $caret.nodeAfter;
  const stillInside = after?.isText && trapping.every((mark) => mark.isInSet(after.marks));
  if (stillInside) return false;

  const tr = state.tr;
  for (const mark of trapping) tr.removeStoredMark(mark);

  // Nothing after the caret but the end of the line, so there is nowhere
  // unmarked to stand. A space is somewhere.
  if (spacer && (!after || after.type.name === "hardBreak")) {
    tr.insertText(" ", $caret.pos);
    for (const mark of trapping) tr.removeStoredMark(mark);
  }

  editor.view.dispatch(tr);
  return true;
}
