import { Extension, type ChainedCommands } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

/**
 * Markdown shortcuts at the start of any line, not just the start of a block.
 *
 * Tiptap's input rules fire on text at the start of a *text block*. That is
 * the right rule almost everywhere, and it is wrong here because of a decision
 * made elsewhere: `EnterIsALineBreak` makes Enter insert a hard break rather
 * than split the paragraph, so the split view can promise that one line here
 * is one line there.
 *
 * The two together produced a bug that looked like flakiness. Typing `- ` made
 * a bullet on the first line of a paragraph and did nothing on the second,
 * because the second line is not the start of a block — it is text after a
 * hard break, halfway through one. From the outside that is "sometimes the
 * dash works and sometimes it doesn't", which is the worst kind of bug: there
 * is no rule to learn, so you stop trusting the feature and type the bullets
 * by hand.
 *
 * This cannot be written as an input rule. Tiptap builds the text before the
 * cursor with `%leaf%` standing in for a leaf node, and then deliberately
 * refuses any match that spans one, because a leaf's length in text and in the
 * document differ and the resulting positions would be wrong. So the rule is a
 * plain `handleTextInput` plugin, which sees the same keystroke and is free to
 * work in document positions from the start.
 */

/** A prefix that starts a line, and what the line becomes. */
interface Prefix {
  /** Matched against the current line, excluding the space just typed. */
  find: RegExp;
  run: (chain: ChainedCommands, match: RegExpMatchArray) => void;
}

const PREFIXES: Prefix[] = [
  {
    // `- `, `* `, `+ `
    find: /^[ \t]*([-*+])$/,
    run: (chain) => {
      chain.toggleBulletList().run();
    },
  },
  {
    // `1. `, `1) `
    find: /^[ \t]*(\d{1,9})[.)]$/,
    run: (chain) => {
      chain.toggleOrderedList().run();
    },
  },
  {
    // `[] `, `[ ] `, `[x] `
    find: /^[ \t]*\[([ xX]?)\]$/,
    run: (chain) => {
      chain.toggleTaskList().run();
    },
  },
  {
    // `# ` through `###### `
    find: /^[ \t]*(#{1,6})$/,
    run: (chain, match) => {
      chain.setNode("heading", { level: match[1]!.length }).run();
    },
  },
  {
    // `> `
    find: /^[ \t]*>$/,
    run: (chain) => {
      chain.toggleBlockquote().run();
    },
  },
];

/** Node types where splitting the block would break the structure around it. */
const PROTECTED = new Set(["tableCell", "tableHeader", "codeBlock"]);

export const ShortcutsAfterLineBreak = Extension.create({
  name: "shortcutsAfterLineBreak",

  addProseMirrorPlugins() {
    const { editor } = this;

    return [
      new Plugin({
        key: new PluginKey("shortcutsAfterLineBreak"),

        props: {
          handleTextInput(view, from, to, text) {
            // Every one of these prefixes is confirmed by a space.
            if (text !== " " || view.composing) return false;

            const $from = view.state.doc.resolve(from);
            const parent = $from.parent;

            // A dash in a code block is a dash.
            if (parent.type.spec.code) return false;
            for (let depth = $from.depth; depth > 0; depth -= 1) {
              if (PROTECTED.has($from.node(depth).type.name)) return false;
            }

            // Where the current line starts: just after the last hard break
            // before the cursor, if there is one.
            let lineStart = -1;
            let breakPos = -1;

            parent.forEach((node, offset) => {
              if (offset >= $from.parentOffset) return;
              if (node.type.name === "hardBreak") {
                lineStart = offset + node.nodeSize;
                breakPos = $from.start() + offset;
              }
            });

            // No break before the cursor means this *is* the start of the
            // block, which Tiptap's own input rules already handle. Claiming
            // it here as well would apply the transform twice.
            if (breakPos === -1) return false;

            const line = parent.textBetween(lineStart, $from.parentOffset, undefined, "");

            for (const { find, run } of PREFIXES) {
              const match = find.exec(line);
              if (!match) continue;

              // Take out the break and the prefix, split where the break was,
              // and let the command shape the block that is left — which is
              // exactly where the block-start rule would have put it.
              run(editor.chain().deleteRange({ from: breakPos, to }).splitBlock(), match);
              return true;
            }

            return false;
          },
        },
      }),
    ];
  },
});
