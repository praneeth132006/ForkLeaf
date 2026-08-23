import type { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";

/**
 * Make the line the cursor is on into a block of its own.
 *
 * Enter in this editor inserts a hard break rather than splitting the
 * paragraph, so what looks like five lines is one paragraph with four `<br>`s
 * in it. Every block-level command — headings, lists, quotes, code — applies to
 * a *node*, so running one of them from the slash menu on the last line rewrote
 * all five: type `/h1` at the bottom of a paragraph and everything above it
 * became part of the heading.
 *
 * That is a real answer to "what block is the cursor in", and a completely
 * wrong answer to what the writer meant. They pointed at a line. So before a
 * block command runs, the line is separated out: the hard breaks either side of
 * it become real block boundaries, and the command then has exactly the line
 * the writer was looking at to work on.
 *
 * Inline commands — bold, a link, an image — must not do this, or asking for
 * bold would silently break a paragraph in three.
 *
 * Returns true if the document changed.
 */
export function isolateCurrentLine(editor: Editor): boolean {
  const { state } = editor;
  const { $from, empty } = state.selection;

  if (!empty) return false;

  const parent = $from.parent;
  if (!parent.isTextblock) return false;

  const blockStart = $from.start();
  const cursor = $from.pos;

  // Absolute positions of the hard breaks inside this block.
  const breaks: number[] = [];
  parent.forEach((child, offset) => {
    if (child.type.name === "hardBreak") breaks.push(blockStart + offset);
  });

  if (breaks.length === 0) return false;

  // The breaks that bound the line the cursor sits on. Either may be absent:
  // the cursor can be on the first or the last line of the block.
  const before = breaks.filter((position) => position < cursor).pop();
  const after = breaks.find((position) => position >= cursor);

  if (before === undefined && after === undefined) return false;

  // Where the line begins and ends, and how far into it the caret sits. The
  // caret's own position is no use for restoring it: an empty line puts it
  // exactly on a split boundary, and a boundary belongs to both blocks — map it
  // forward and `/h1` styles the line below, map it back and it styles the line
  // above. Both of those were observed. The line's *start* is unambiguous.
  const lineStart = before === undefined ? blockStart : before + 1;
  const offsetInLine = cursor - lineStart;

  const tr = state.tr;

  // The later split first. Splitting at `before` would shift everything after
  // it, and then `after` would point one node to the left of the break it was
  // measured from.
  if (after !== undefined) {
    tr.delete(after, after + 1);
    tr.split(after);
  }

  if (before !== undefined) {
    tr.delete(before, before + 1);
    tr.split(before);
  }

  // Put the caret back where it was, measured from the start of the line it was
  // on — which is now the start of a block of its own.
  const restored = tr.mapping.map(lineStart, 1) + offsetInLine;
  tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(restored, tr.doc.content.size))));

  editor.view.dispatch(tr);
  return true;
}
