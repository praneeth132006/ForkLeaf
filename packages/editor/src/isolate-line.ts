import type { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import type { ResolvedPos } from "@tiptap/pm/model";

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
 * The same is true of a selection: highlighting one line of a paragraph and
 * pressing Heading 3 made a heading of every line in that paragraph, including
 * the link above it that nobody had selected. So the lines the selection
 * covers are separated out too, and the selection is carried across the splits
 * so the command lands on exactly what was highlighted.
 *
 * Inline commands — bold, a link, an image — must not do this, or asking for
 * bold would silently break a paragraph in three.
 *
 * Returns true if the document changed.
 */
export function isolateCurrentLine(editor: Editor): boolean {
  const { state } = editor;
  const { $from, $to, empty } = state.selection;

  if (!$from.parent.isTextblock || !$to.parent.isTextblock) return false;

  // The breaks bounding the lines the selection touches. Either may be absent:
  // it can start on the first line of its block and end on the last of its own.
  const before = breaksIn($from)
    .filter((position) => position < $from.pos)
    .pop();
  const after = breaksIn($to).find((position) => position >= $to.pos);

  if (before === undefined && after === undefined) return false;

  // Where the first line begins, and how far into it the caret sits. The
  // caret's own position is no use for restoring it: an empty line puts it
  // exactly on a split boundary, and a boundary belongs to both blocks — map it
  // forward and `/h1` styles the line below, map it back and it styles the line
  // above. Both of those were observed. The line's *start* is unambiguous.
  const lineStart = before === undefined ? $from.start() : before + 1;
  const offsetInLine = $from.pos - lineStart;
  const { from, to } = state.selection;

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

  if (empty) {
    // Put the caret back where it was, measured from the start of the line it
    // was on — which is now the start of a block of its own.
    const restored = tr.mapping.map(lineStart, 1) + offsetInLine;
    tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(restored, tr.doc.content.size))));
  } else {
    // A range has two unambiguous ends, so they can simply be carried through
    // the splits: forward at the start, backward at the end, so neither end
    // slides onto a boundary that now belongs to the block next door.
    const start = tr.mapping.map(from, 1);
    const end = tr.mapping.map(to, -1);
    tr.setSelection(TextSelection.create(tr.doc, start, Math.max(start, end)));
  }

  editor.view.dispatch(tr);
  return true;
}

/** Absolute positions of the hard breaks in the block a position sits in. */
function breaksIn($position: ResolvedPos): number[] {
  const start = $position.start();
  const breaks: number[] = [];

  $position.parent.forEach((child, offset) => {
    if (child.type.name === "hardBreak") breaks.push(start + offset);
  });

  return breaks;
}
