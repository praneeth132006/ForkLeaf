import { syntaxTree } from "@codemirror/language";
import { RangeSetBuilder, StateEffect, type Extension } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { findWords, matchCase, SuggestionBubble, type SpellBridge } from "../spelling";

/**
 * Spelling suggestions in the Markdown source.
 *
 * The same rules as rich text — the same words found, the same bubble — over
 * the raw file. The Markdown syntax tree says what is prose: fenced and
 * indented code, inline code, link addresses, HTML and front matter are left
 * alone, so a technical note is not a sea of red.
 *
 * Only the lines on screen are checked, which keeps a long file cheap.
 */

/** Tells the plugin the bridge has new answers, so underlines are redrawn. */
export const respell = StateEffect.define<null>();

/** Syntax nodes whose text is not prose. */
const NOT_PROSE = new Set([
  "FencedCode",
  "CodeBlock",
  "InlineCode",
  "CodeText",
  "URL",
  "LinkReference",
  "LinkLabel",
  "HTMLBlock",
  "HTMLTag",
  "Comment",
  "CommentBlock",
  "ProcessingInstruction",
  "Autolink",
  "FrontMatter",
  "YAMLFrontMatter",
]);

interface Located {
  word: string;
  from: number;
  to: number;
}

/** Front matter at the top of the file, which the Markdown grammar does not know. */
function frontMatterEnd(view: EditorView): number {
  const doc = view.state.doc;
  if (doc.lines < 2 || doc.line(1).text.trim() !== "---") return 0;
  for (let n = 2; n <= Math.min(doc.lines, 200); n += 1) {
    if (/^(---|\.\.\.)\s*$/.test(doc.line(n).text)) return doc.line(n).to;
  }
  return 0;
}

/** Checkable words in the visible part of the document. */
function visibleWords(view: EditorView): Located[] {
  const words: Located[] = [];
  const tree = syntaxTree(view.state);
  const skipUntil = frontMatterEnd(view);

  for (const { from, to } of view.visibleRanges) {
    const skipped: Array<[number, number]> = [];
    tree.iterate({
      from,
      to,
      enter: (node) => {
        if (NOT_PROSE.has(node.name)) {
          skipped.push([node.from, node.to]);
          return false;
        }
        return undefined;
      },
    });

    const text = view.state.doc.sliceString(from, to);
    for (const word of findWords(text)) {
      const start = from + word.from;
      const end = from + word.to;
      if (start < skipUntil) continue;
      if (skipped.some(([a, b]) => start < b && end > a)) continue;
      words.push({ word: word.word, from: start, to: end });
    }
  }
  return words;
}

export function spellingExtension(bridgeOf: () => SpellBridge | undefined): Extension {
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet = Decoration.none;
      readonly bubble = new SuggestionBubble();
      private target: Located | null = null;
      private typed = false;
      private finished: Located | null = null;
      private dismissed: number | null = null;
      private readonly suggestions = new Map<string, readonly string[]>();
      private readonly onScroll = () => this.reposition();

      constructor(readonly view: EditorView) {
        globalThis.window?.addEventListener("scroll", this.onScroll, true);
        globalThis.window?.addEventListener("resize", this.onScroll);
        this.refresh();
      }

      update(update: ViewUpdate) {
        const respelled = update.transactions.some((tr) =>
          tr.effects.some((effect) => effect.is(respell)),
        );

        if (update.docChanged) {
          this.typed = true;
          this.finished = this.justFinished(update) ?? this.followFinished(update);
        } else if (update.selectionSet) {
          this.typed = false;
          const head = update.state.selection.main.head;
          if (this.finished && (head < this.finished.from || head > this.finished.to + 64)) {
            this.finished = null;
          }
        }

        if (
          update.docChanged ||
          update.viewportChanged ||
          update.selectionSet ||
          update.focusChanged ||
          respelled
        ) {
          this.refresh();
        }
      }

      /** The word a just-typed space or punctuation mark finished, if any. */
      private justFinished(update: ViewUpdate): Located | null {
        const { state } = update;
        const selection = state.selection.main;
        if (!selection.empty || selection.head < 2) return null;
        let inserted = 0;
        update.changes.iterChanges((_fa, _ta, fromB, toB) => {
          inserted += toB - fromB;
        });
        if (inserted === 0 || inserted > 2) return null;
        const head = selection.head;
        if (!/^[\s.,;:!?)\]"”’]$/.test(state.doc.sliceString(head - 1, head))) return null;
        const line = state.doc.lineAt(head - 1);
        const word = findWords(line.text).find((entry) => line.from + entry.to === head - 1);
        return word ? { word: word.word, from: line.from + word.from, to: head - 1 } : null;
      }

      private followFinished(update: ViewUpdate): Located | null {
        const finished = this.finished;
        if (!finished) return null;
        const from = update.changes.mapPos(finished.from, 1);
        const to = update.changes.mapPos(finished.to, -1);
        if (to <= from || update.state.doc.sliceString(from, to) !== finished.word) return null;
        return { ...finished, from, to };
      }

      private refresh() {
        const bridge = bridgeOf();
        if (!bridge?.enabled) {
          this.decorations = Decoration.none;
          this.close();
          return;
        }

        const words = visibleWords(this.view);
        const selection = this.view.state.selection.main;
        const typingAt = this.typed && selection.empty ? selection.head : -1;

        const unknown = new Set<string>();
        const builder = new RangeSetBuilder<Decoration>();
        for (const word of words) {
          const verdict = bridge.check(word.word);
          if (verdict === undefined) unknown.add(word.word);
          if (verdict !== false || word.to === typingAt) continue;
          builder.add(
            word.from,
            word.to,
            Decoration.mark({ class: "fl-misspelt", attributes: { "data-misspelt": word.word } }),
          );
        }
        this.decorations = builder.finish();
        if (unknown.size > 0) bridge.request([...unknown]);

        this.decide(words, bridge);
      }

      private decide(words: readonly Located[], bridge: SpellBridge) {
        const view = this.view;
        const selection = view.state.selection.main;
        if (view.state.readOnly || !selection.empty || !view.hasFocus || view.composing) {
          this.close();
          return;
        }
        const head = selection.head;
        const atCaret = words.find((word) => head >= word.from && head <= word.to) ?? null;
        const candidates = [
          atCaret && head < atCaret.to ? atCaret : null,
          atCaret && head === atCaret.to && !this.typed ? atCaret : null,
          this.finished,
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
        if (this.bubble.visible && this.target?.from === target.from) {
          this.target = target;
          // Measure after CodeMirror has finished laying out this update.
          view.requestMeasure({ read: () => this.reposition() });
          return;
        }
        this.target = target;
        view.requestMeasure({ read: () => this.open(target, bridge) });
      }

      private open(target: Located, bridge: SpellBridge) {
        const known = this.suggestions.get(target.word);
        this.render(target, bridge, known ?? null);
        if (known) return;
        bridge.suggest(target.word).then(
          (found) => {
            this.suggestions.set(target.word, found);
            if (this.target === target && this.bubble.word === target.word) {
              this.render(target, bridge, found);
            }
          },
          () => this.suggestions.set(target.word, []),
        );
      }

      private render(target: Located, bridge: SpellBridge, suggestions: readonly string[] | null) {
        const rect = this.rectOf(target);
        if (!rect) return;
        this.bubble.show({
          word: target.word,
          rect,
          suggestions,
          onPick: (replacement) => {
            const view = this.view;
            if (view.state.doc.sliceString(target.from, target.to) !== target.word) return;
            const insert = matchCase(target.word, replacement);
            this.finished = null;
            view.dispatch({
              changes: { from: target.from, to: target.to, insert },
              selection: { anchor: target.from + insert.length },
            });
            view.focus();
          },
          onLearn: () => {
            bridge.learn(target.word);
            this.finished = null;
            this.view.dispatch({ effects: respell.of(null) });
          },
          onIgnore: () => {
            bridge.ignore(target.word);
            this.finished = null;
            this.view.dispatch({ effects: respell.of(null) });
          },
        });
      }

      private rectOf(target: Located) {
        const start = this.view.coordsAtPos(target.from);
        const end = this.view.coordsAtPos(target.to);
        if (!start) return null;
        return {
          left: start.left,
          top: start.top,
          bottom: Math.max(start.bottom, end?.bottom ?? start.bottom),
        };
      }

      private reposition() {
        if (!this.target || !this.bubble.visible) return;
        const rect = this.rectOf(this.target);
        if (rect) this.bubble.place(rect);
      }

      /** Escape: close the bubble, and leave this word alone until the caret leaves it. */
      dismiss(): boolean {
        if (!this.bubble.visible) return false;
        this.dismissed = this.target?.from ?? null;
        this.finished = null;
        this.close();
        return true;
      }

      close() {
        this.bubble.hide();
        this.target = null;
      }

      destroy() {
        this.close();
        globalThis.window?.removeEventListener("scroll", this.onScroll, true);
        globalThis.window?.removeEventListener("resize", this.onScroll);
      }
    },
    { decorations: (instance) => instance.decorations },
  );

  return [
    plugin,
    EditorView.domEventHandlers({
      keydown(event, view) {
        if (event.key !== "Escape") return false;
        const instance = view.plugin(plugin);
        if (!instance?.dismiss()) return false;
        event.preventDefault();
        return true;
      },
      blur(_event, view) {
        view.plugin(plugin)?.close();
        return false;
      },
    }),
  ];
}
