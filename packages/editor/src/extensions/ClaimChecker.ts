import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/**
 * The claim checker, as marks in the text being written.
 *
 * A sentence that states something nothing else in the notebook backs gets a
 * dotted underline, and one that is backed says where when hovered. Painted as
 * decorations, so the note's text is never touched, and only while the checker
 * is on for the note. What counts as a claim, and what backs one, is the app's
 * to decide; this finds the sentences and marks them.
 */

export type ClaimVerdict =
  { status: "supported"; title: string } | { status: "unsupported" } | null;

export interface ClaimBridge {
  /** Whether the checker is on for this note. */
  enabled: boolean;
  check: (sentence: string) => ClaimVerdict;
}

export interface ClaimCheckerOptions {
  bridge: () => ClaimBridge | undefined;
}

export const claimCheckerKey = new PluginKey<DecorationSet>("forkleaf-claims");

/** Sentences end at . ! ? (and any closing quote or bracket), or at a line break. */
const SENTENCE = /[^.!?\n]+(?:[.!?]+["”’)\]]*|$)/g;
const SKIPPED = new Set(["codeBlock", "heading", "mermaidBlock"]);

/** A text block's text, with each character's document position. */
function textOf(node: ProseMirrorNode, start: number): { text: string; positions: number[] } {
  let text = "";
  const positions: number[] = [];
  node.forEach((child, offset) => {
    if (child.isText) {
      for (let i = 0; i < child.text!.length; i += 1) {
        text += child.text![i];
        positions.push(start + offset + i);
      }
    } else {
      // A line break or an inline atom ends a sentence as much as a full stop.
      text += "\n";
      positions.push(start + offset);
    }
  });
  return { text, positions };
}

export function claimDecorations(
  state: EditorState,
  bridge: ClaimBridge | undefined,
): DecorationSet {
  if (!bridge?.enabled) return DecorationSet.empty;
  const decorations: Decoration[] = [];

  state.doc.descendants((node, pos) => {
    if (SKIPPED.has(node.type.name)) return false;
    if (!node.isTextblock) return true;

    const { text, positions } = textOf(node, pos + 1);
    for (const match of text.matchAll(SENTENCE)) {
      const raw = match[0];
      const leading = raw.length - raw.trimStart().length;
      const sentence = raw.trim();
      if (!sentence) continue;
      const verdict = bridge.check(sentence);
      if (!verdict) continue;
      const from = positions[match.index! + leading]!;
      const to = positions[match.index! + leading + sentence.length - 1]! + 1;
      decorations.push(
        verdict.status === "unsupported"
          ? Decoration.inline(from, to, {
              class: "fl-claim-unsupported",
              title: "Nothing in your notes or saved sources backs this yet",
              "data-claim": "unsupported",
            })
          : Decoration.inline(from, to, {
              class: "fl-claim-supported",
              title: `Backed by ${verdict.title}`,
              "data-claim": "supported",
            }),
      );
    }
    return false;
  });

  return DecorationSet.create(state.doc, decorations);
}

export const ClaimChecker = Extension.create<ClaimCheckerOptions>({
  name: "claimChecker",

  addOptions() {
    return { bridge: () => undefined };
  },

  addProseMirrorPlugins() {
    const bridge = this.options.bridge;
    return [
      new Plugin<DecorationSet>({
        key: claimCheckerKey,
        state: {
          init: (_config, state) => claimDecorations(state, bridge()),
          // Rebuilt when the text changes or the app says the checker changed —
          // switched on or off, or a newer notebook to check against.
          apply: (tr, previous, _old, state) =>
            tr.docChanged || tr.getMeta(claimCheckerKey)
              ? claimDecorations(state, bridge())
              : previous,
        },
        props: {
          decorations: (state) => claimCheckerKey.getState(state),
        },
      }),
    ];
  },
});
