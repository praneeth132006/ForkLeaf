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

/**
 * How close the caret may come to the top and bottom of the screen before the
 * note scrolls, in pixels.
 *
 * ProseMirror's default is a few pixels, which let the line being written sit
 * on the very bottom edge of the window — or, after a paste, just under it.
 * Writing at the bottom of a screen with nothing visible below the caret is
 * writing into a wall; this keeps a band of room under it.
 */
export const CARET_ROOM = { top: 80, right: 0, bottom: 160, left: 0 };

/**
 * Keeps the caret on screen while pictures above it finish loading.
 *
 * A pasted screenshot is inserted, the caret is put below it and scrolled into
 * view — and only then does the picture load and grow from nothing to its full
 * height, pushing the caret off the bottom of the window. So for a short while
 * after an insert, every image that finishes loading in the note scrolls the
 * caret back into view, unless the writer has scrolled away on purpose.
 */
export function followCaretWhileImagesLoad(view: EditorView, forMs = 8000): void {
  const dom = view.dom as HTMLElement;
  const scroller = scrollParentOf(dom);
  let userScrolled = false;
  const onWheel = () => {
    userScrolled = true;
  };
  const follow = () => {
    if (userScrolled || (view as { isDestroyed?: boolean }).isDestroyed) return;
    view.dispatch(view.state.tr.scrollIntoView());
  };
  const onLoad = (event: Event) => {
    if (event.target instanceof HTMLImageElement) follow();
  };

  // `load` does not bubble, so it is caught on the way down. The note growing
  // is watched too, for a picture that was already loaded — or one drawn by a
  // node view that sizes itself — before the listener was in place.
  dom.addEventListener("load", onLoad, true);
  const growth = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => follow());
  growth?.observe(dom);
  scroller?.addEventListener("wheel", onWheel, { passive: true });
  scroller?.addEventListener("touchmove", onWheel, { passive: true });
  setTimeout(() => {
    growth?.disconnect();
    dom.removeEventListener("load", onLoad, true);
    scroller?.removeEventListener("wheel", onWheel);
    scroller?.removeEventListener("touchmove", onWheel);
  }, forMs);
}

function scrollParentOf(element: HTMLElement): HTMLElement | null {
  let node = element.parentElement;
  while (node) {
    const { overflowY } = getComputedStyle(node);
    if (/(auto|scroll)/.test(overflowY)) return node;
    node = node.parentElement;
  }
  return null;
}
