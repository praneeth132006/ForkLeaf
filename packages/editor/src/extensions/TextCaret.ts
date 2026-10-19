import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

/**
 * A caret the height of the text it is in.
 *
 * A note is set with generous leading (line-height 1.7) so it reads well, and
 * Safari — and the home-screen app on a Mac or iPhone, which is Safari — draws
 * the caret the full height of the line box rather than of the letters. In a
 * paragraph that came out at nearly twice the height of the text, poking well
 * above the capitals and below the descenders. No CSS property sizes the
 * caret, so the rich editor draws its own: a thin bar sized to the font at
 * the caret, centred in the line the way the leading is, and the browser's is
 * made transparent while it shows.
 *
 * It gives way to the browser's caret whenever there is any doubt: while text
 * is being composed with an input method, while something is selected, while
 * the focus is elsewhere (a field inside a block, a dialog), and whenever the
 * position cannot be measured. The native caret is only hidden while this one
 * is actually drawn.
 */

export const textCaretKey = new PluginKey("forkleaf-text-caret");

/** The share of the font size a caret covers: about ascender to descender. */
const CARET_EM = 1.2;

class CaretView {
  private readonly caret: HTMLDivElement;
  private frame = 0;
  private readonly schedule = () => {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.draw();
    });
  };

  constructor(private readonly view: EditorView) {
    const caret = document.createElement("div");
    caret.className = "fl-text-caret";
    caret.setAttribute("aria-hidden", "true");
    // Hidden by visibility rather than `hidden`: an element that is not laid
    // out has no offsetParent to be positioned against.
    caret.style.visibility = "hidden";
    this.caret = caret;
    // Beside the editable element, never inside it: ProseMirror removes
    // anything in its own DOM that it did not put there.
    view.dom.parentElement?.append(caret);
    window.addEventListener("scroll", this.schedule, true);
    window.addEventListener("resize", this.schedule);
    this.schedule();
  }

  update(): void {
    this.schedule();
  }

  /** Called on focus, blur and composition, which do not produce a transaction. */
  refresh(): void {
    this.schedule();
  }

  private draw(): void {
    const { view, caret } = this;
    const { selection } = view.state;
    if (
      !view.editable ||
      view.composing ||
      // A text caret only: a gap cursor between two blocks, a selected image
      // or a table cell selection draw themselves.
      !(selection instanceof TextSelection) ||
      !selection.empty ||
      !view.hasFocus() ||
      !caret.isConnected
    ) {
      this.useNative();
      return;
    }

    let rect: { top: number; bottom: number; left: number };
    let fontSize: number;
    try {
      rect = view.coordsAtPos(selection.head);
      const { node } = view.domAtPos(selection.head);
      const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
      fontSize = element ? parseFloat(getComputedStyle(element).fontSize) : NaN;
    } catch {
      this.useNative();
      return;
    }
    const lineHeight = rect.bottom - rect.top;
    const container = caret.offsetParent;
    if (!(lineHeight > 0) || !(fontSize > 0) || !container) {
      this.useNative();
      return;
    }

    // Leading is shared equally above and below the letters, so the text sits
    // in the middle of the line box: so does the caret.
    const height = Math.min(lineHeight, fontSize * CARET_EM);
    const top = rect.top + (lineHeight - height) / 2;
    const box = container.getBoundingClientRect();

    caret.style.height = `${height}px`;
    caret.style.top = `${top - box.top - container.clientTop + container.scrollTop}px`;
    caret.style.left = `${rect.left - box.left - container.clientLeft + container.scrollLeft}px`;
    // A caret that has just moved is shown solid, then blinks: restarting the
    // animation does that.
    caret.style.visibility = "";
    caret.classList.remove("is-blinking");
    void caret.offsetWidth;
    caret.classList.add("is-blinking");
    view.dom.classList.add("fl-own-caret");
  }

  private useNative(): void {
    this.caret.style.visibility = "hidden";
    this.view.dom.classList.remove("fl-own-caret");
  }

  destroy(): void {
    if (this.frame) cancelAnimationFrame(this.frame);
    window.removeEventListener("scroll", this.schedule, true);
    window.removeEventListener("resize", this.schedule);
    this.caret.remove();
    this.view.dom.classList.remove("fl-own-caret");
  }
}

const caretViews = new WeakMap<EditorView, CaretView>();

export const TextCaret = Extension.create({
  name: "textCaret",

  addProseMirrorPlugins() {
    const refresh = (view: EditorView) => {
      caretViews.get(view)?.refresh();
      return false;
    };
    return [
      new Plugin({
        key: textCaretKey,
        view: (view) => {
          const caret = new CaretView(view);
          caretViews.set(view, caret);
          return caret;
        },
        props: {
          handleDOMEvents: {
            focus: refresh,
            blur: refresh,
            compositionstart: refresh,
            compositionend: refresh,
          },
        },
      }),
    ];
  },
});
