import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import {
  findWords,
  matchCase,
  SuggestionBubble,
  type FoundWord,
  type SpellBridge,
} from "../spelling";

/**
 * Spelling suggestions in rich text.
 *
 * A misspelt word gets a wavy underline. Finishing one — typing the space or
 * full stop after it — opens a small bubble under it with the likely
 * corrections; so does putting the caret in any underlined word, by click,
 * tap or arrow keys. Picking a correction replaces the word, in the case it
 * was typed in. Escape closes the bubble without changing anything.
 *
 * The underlines are decorations, so the note's text is never touched until a
 * correction is chosen. The word the caret is at the end of is never
 * underlined: it may still be being typed.
 */

export interface SpellingOptions {
  bridge: () => SpellBridge | undefined;
}

export const spellingKey = new PluginKey<SpellingState>("forkleaf-spelling");

interface Located extends FoundWord {
  /** Document positions. */
  from: number;
  to: number;
}

interface SpellingState {
  decorations: DecorationSet;
  /**
   * The word just finished by typing a space or punctuation after it, kept
   * until the next word is finished or the caret goes elsewhere.
   */
  finished: Located | null;
  /** Whether the last change was to the text, as opposed to the caret moving. */
  typed: boolean;
}

/** Blocks whose text is not prose. */
const SKIPPED = new Set(["codeBlock", "mermaidBlock", "frontmatter"]);
/**
 * Marks whose text is not prose. A link's words are checked like any others —
 * its address is not in the text, and a bare address is skipped as one.
 */
const SKIPPED_MARKS = new Set(["code"]);

/**
 * Words found in a text block, cached by node.
 *
 * ProseMirror keeps every unchanged node object from one transaction to the
 * next, so typing in one paragraph re-reads only that paragraph.
 */
const wordsByNode = new WeakMap<ProseMirrorNode, FoundWord[]>();

function wordsIn(node: ProseMirrorNode): FoundWord[] {
  const cached = wordsByNode.get(node);
  if (cached) return cached;

  // Text in a code span is blanked to spaces rather than removed,
  // so offsets still line up with the document.
  let text = "";
  node.forEach((child) => {
    if (child.isText) {
      const skip = child.marks.some((mark) => SKIPPED_MARKS.has(mark.type.name));
      text += skip ? " ".repeat(child.text!.length) : child.text!;
    } else {
      text += " ".repeat(child.nodeSize);
    }
  });

  const words = findWords(text);
  wordsByNode.set(node, words);
  return words;
}

/** Every checkable word in the document, with document positions. */
function eachWord(doc: ProseMirrorNode, visit: (word: Located) => void): void {
  doc.descendants((node, pos) => {
    if (SKIPPED.has(node.type.name)) return false;
    if (!node.isTextblock) return true;
    for (const word of wordsIn(node)) {
      visit({ word: word.word, from: pos + 1 + word.from, to: pos + 1 + word.to });
    }
    return false;
  });
}

/** The word covering a position in the document, if it is a checkable one. */
function wordAround(doc: ProseMirrorNode, at: number): Located | null {
  const $pos = doc.resolve(at);
  const block = $pos.parent;
  if (!block.isTextblock || SKIPPED.has(block.type.name)) return null;
  const start = $pos.start();
  const offset = at - start;
  const word = wordsIn(block).find((entry) => offset >= entry.from && offset <= entry.to);
  return word ? { word: word.word, from: start + word.from, to: start + word.to } : null;
}

function paint(
  state: EditorState,
  bridge: SpellBridge | undefined,
  typing: boolean,
): DecorationSet {
  if (!bridge?.enabled) return DecorationSet.empty;
  const { selection } = state;
  // The word being typed is left alone until it is finished.
  const typingAt = typing && selection.empty ? selection.head : -1;
  const decorations: Decoration[] = [];

  eachWord(state.doc, (word) => {
    if (word.to === typingAt) return;
    if (bridge.check(word.word) !== false) return;
    decorations.push(
      Decoration.inline(word.from, word.to, {
        class: "fl-misspelt",
        "data-misspelt": word.word,
      }),
    );
  });

  return DecorationSet.create(state.doc, decorations);
}

/**
 * The word that typing a separator just finished, if this transaction did that.
 *
 * "Separator" is a space or punctuation typed straight after a word. A paste
 * or an undo is not someone finishing a word, so only small insertions count.
 */
function justFinished(tr: Transaction, state: EditorState): Located | null {
  if (!tr.docChanged || !state.selection.empty) return null;
  const head = state.selection.head;
  if (head < 2) return null;
  const before = state.doc.textBetween(head - 1, head, "\n", "\n");
  if (!/^[\s.,;:!?)\]"”’]$/.test(before)) return null;

  let inserted = 0;
  for (const step of tr.steps) {
    step.getMap().forEach((_oldStart, _oldEnd, newStart, newEnd) => {
      inserted += newEnd - newStart;
    });
  }
  if (inserted === 0 || inserted > 2) return null;

  const word = wordAround(state.doc, head - 1);
  return word && word.to === head - 1 ? word : null;
}

export const Spelling = Extension.create<SpellingOptions>({
  name: "spelling",

  addOptions() {
    return { bridge: () => undefined };
  },

  addProseMirrorPlugins() {
    const bridgeOf = this.options.bridge;

    return [
      new Plugin<SpellingState>({
        key: spellingKey,
        state: {
          init: (_config, state) => ({
            decorations: paint(state, bridgeOf(), false),
            finished: null,
            typed: false,
          }),
          apply(tr, previous, _old, state) {
            const repaint =
              tr.docChanged || tr.selectionSet || tr.getMeta(spellingKey) !== undefined;
            const meta = tr.getMeta(spellingKey) as { dismiss?: boolean } | undefined;

            let finished = previous.finished;
            if (meta?.dismiss) {
              finished = null;
            } else if (tr.docChanged) {
              const fresh = justFinished(tr, state);
              if (fresh) {
                finished = fresh;
              } else if (finished) {
                // Follow it through the edit, and let it go once it has been
                // changed or the caret has wandered off into another block.
                const from = tr.mapping.map(finished.from, 1);
                const to = tr.mapping.map(finished.to, -1);
                const now = to > from ? state.doc.textBetween(from, to) : "";
                const sameBlock = state.doc.resolve(from).parent === state.selection.$head.parent;
                finished = now === finished.word && sameBlock ? { ...finished, from, to } : null;
              }
            } else if (tr.selectionSet && finished) {
              // Moving the caret somewhere else means the moment has passed.
              const head = state.selection.head;
              if (head < finished.from || head > finished.to + 64) finished = null;
            }

            const typed = tr.docChanged ? true : tr.selectionSet ? false : previous.typed;
            return {
              decorations: repaint
                ? paint(state, bridgeOf(), typed)
                : previous.decorations.map(tr.mapping, tr.doc),
              finished,
              typed,
            };
          },
        },
        props: {
          decorations: (state) => spellingKey.getState(state)?.decorations ?? DecorationSet.empty,
          handleKeyDown(view, event) {
            if (event.key !== "Escape") return false;
            const plugin = spellingView.get(view);
            if (!plugin?.bubble.visible) return false;
            plugin.bubble.hide();
            plugin.dismissed = plugin.target?.from ?? null;
            view.dispatch(view.state.tr.setMeta(spellingKey, { dismiss: true }));
            return true;
          },
          handleDOMEvents: {
            blur(view) {
              spellingView.get(view)?.hideBubble();
              return false;
            },
          },
        },
        view: (view) => new SpellingView(view, bridgeOf),
      }),
    ];
  },
});

const spellingView = new WeakMap<EditorView, SpellingView>();

class SpellingView {
  readonly bubble = new SuggestionBubble();
  /** The word the bubble is showing, in document positions. */
  target: Located | null = null;
  /** A word the bubble was closed for with Escape; not reopened until left. */
  dismissed: number | null = null;
  private readonly suggestions = new Map<string, readonly string[]>();
  private readonly onScroll = () => this.reposition();

  constructor(
    private readonly view: EditorView,
    private readonly bridgeOf: () => SpellBridge | undefined,
  ) {
    spellingView.set(view, this);
    globalThis.window?.addEventListener("scroll", this.onScroll, true);
    globalThis.window?.addEventListener("resize", this.onScroll);
    this.update(view);
  }

  update(view: EditorView): void {
    const bridge = this.bridgeOf();
    if (!bridge?.enabled) {
      this.close();
      return;
    }

    this.askAbout(view.state, bridge);
    this.decide(view, bridge);
  }

  /** Sends every word not yet known to the dictionary, which ignores repeats. */
  private askAbout(state: EditorState, bridge: SpellBridge): void {
    const unknown = new Set<string>();
    eachWord(state.doc, (word) => {
      if (bridge.check(word.word) === undefined) unknown.add(word.word);
    });
    if (unknown.size > 0) bridge.request([...unknown]);
  }

  /** Opens, moves or closes the bubble for where the caret is now. */
  private decide(view: EditorView, bridge: SpellBridge): void {
    const { state } = view;
    if (!view.editable || view.composing || !state.selection.empty || !view.hasFocus()) {
      this.close();
      return;
    }

    const head = state.selection.head;
    const atCaret = wordAround(state.doc, head);
    const plugin = spellingKey.getState(state);
    const finished = plugin?.finished ?? null;

    // The word the caret is inside (but not merely at the end of, since that
    // one may still be being typed), else the one just finished.
    const candidates = [
      atCaret && head < atCaret.to ? atCaret : null,
      // At the very end of a word only when the caret was put there, never
      // while that word is being typed.
      atCaret && head === atCaret.to && !plugin?.typed ? atCaret : null,
      finished,
    ];
    const target =
      candidates.find((word): word is Located => !!word && bridge.check(word.word) === false) ??
      null;

    if (!target) {
      this.dismissed = null;
      this.close();
      return;
    }
    if (this.dismissed === target.from) return;
    this.dismissed = null;

    if (
      this.bubble.visible &&
      this.target?.from === target.from &&
      this.target.word === target.word
    ) {
      this.target = target;
      this.reposition();
      return;
    }
    this.open(target, bridge);
  }

  private open(target: Located, bridge: SpellBridge): void {
    this.target = target;
    const known = this.suggestions.get(target.word);
    this.render(target, bridge, known ?? null);

    if (!known) {
      bridge.suggest(target.word).then(
        (found) => {
          this.suggestions.set(target.word, found);
          // Only if the bubble is still open for this word.
          if (this.target === target && this.bubble.word === target.word) {
            this.render(target, bridge, found);
          }
        },
        () => {
          this.suggestions.set(target.word, []);
          if (this.target === target && this.bubble.word === target.word) {
            this.render(target, bridge, []);
          }
        },
      );
    }
  }

  private render(target: Located, bridge: SpellBridge, suggestions: readonly string[] | null) {
    const rect = this.rectOf(target);
    if (!rect) return;
    this.bubble.show({
      word: target.word,
      rect,
      suggestions,
      onPick: (replacement) => this.replace(target, replacement),
      onLearn: () => {
        bridge.learn(target.word);
        this.repaint();
      },
      onIgnore: () => {
        bridge.ignore(target.word);
        this.repaint();
      },
    });
  }

  private replace(target: Located, replacement: string): void {
    const { state } = this.view;
    // The word may have moved, or been edited, since the bubble opened.
    if (state.doc.textBetween(target.from, target.to) !== target.word) return;
    const tr = state.tr
      .insertText(matchCase(target.word, replacement), target.from, target.to)
      .setMeta(spellingKey, { dismiss: true });
    this.view.dispatch(tr);
    this.view.focus();
  }

  private repaint(): void {
    this.view.dispatch(this.view.state.tr.setMeta(spellingKey, { dismiss: true }));
  }

  private rectOf(target: Located) {
    try {
      const start = this.view.coordsAtPos(target.from);
      const end = this.view.coordsAtPos(target.to);
      return { left: start.left, top: start.top, bottom: Math.max(start.bottom, end.bottom) };
    } catch {
      return null;
    }
  }

  private reposition(): void {
    if (!this.target || !this.bubble.visible) return;
    const rect = this.rectOf(this.target);
    if (rect) this.bubble.place(rect);
  }

  /** Closes the bubble; it opens again when the caret next lands on a misspelt word. */
  hideBubble(): void {
    this.close();
  }

  private close(): void {
    this.bubble.hide();
    this.target = null;
  }

  destroy(): void {
    this.close();
    spellingView.delete(this.view);
    globalThis.window?.removeEventListener("scroll", this.onScroll, true);
    globalThis.window?.removeEventListener("resize", this.onScroll);
  }
}
