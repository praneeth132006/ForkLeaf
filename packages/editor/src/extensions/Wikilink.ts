import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { EditorState } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { extractWikilinks } from "@forkleaf/markdown-engine";
import type { LinkBridge } from "../links";

/**
 * `[[wikilinks]]` in the rich-text editor.
 *
 * Implemented as decorations rather than as a node type, which is the whole
 * point. A node would mean teaching the markdown serialiser to write it back
 * out, and any gap in that round trip destroys someone's file — the one thing
 * this editor must never do. Decorations touch the document not at all: the
 * text stays exactly `[[target]]`, and this only changes how it is painted and
 * what a click on it does.
 *
 * The cost is that the brackets stay visible. That is a fair trade for a
 * format whose entire promise is that the file is still the file, and it is
 * what every markdown-first editor that survives contact with real notes does.
 */

const key = new PluginKey("forkleaf-wikilink");

export interface WikilinkOptions {
  /** Read through a ref so a bridge arriving later still reaches the editor. */
  bridge: () => LinkBridge | undefined;
}

/** Walks the document's text blocks, decorating every `[[link]]` in them. */
function decorate(state: EditorState, bridge: LinkBridge | undefined): DecorationSet {
  const decorations: Decoration[] = [];

  state.doc.descendants((node, position) => {
    if (!node.isTextblock) return true;
    // Code blocks are code: a wikilink written in one is a literal, exactly as
    // it is in the markdown renderer.
    if (node.type.name === "codeBlock") return false;

    const text = node.textContent;
    if (!text.includes("[[")) return false;

    for (const link of extractWikilinks(text)) {
      const resolved = bridge?.resolve(link) ?? null;

      decorations.push(
        Decoration.inline(
          // +1 for the text block's own opening token.
          position + 1 + link.start,
          position + 1 + link.end,
          {
            class: `fl-wikilink ${resolved?.exists === false ? "fl-wikilink-missing" : "fl-wikilink-found"}`,
            "data-wikilink": link.target,
            ...(link.anchor ? { "data-wikilink-anchor": link.anchor } : {}),
            ...(resolved?.title ? { title: resolved.title } : {}),
          },
        ),
      );
    }

    return false;
  });

  return DecorationSet.create(state.doc, decorations);
}

export const Wikilink = Extension.create<WikilinkOptions>({
  name: "wikilink",

  addOptions() {
    return { bridge: () => undefined };
  },

  addProseMirrorPlugins() {
    const bridge = this.options.bridge;

    return [
      new Plugin({
        key,
        state: {
          init: (_config, state) => decorate(state, bridge()),
          // Recomputed only when the document actually changed. Decorations
          // are cheap to build but not free, and a plain cursor move through a
          // long note fires this on every keypress otherwise.
          apply: (transaction, previous, _old, state) =>
            transaction.docChanged ? decorate(state, bridge()) : previous,
        },
        props: {
          decorations: (state) => key.getState(state) as DecorationSet | undefined,

          /**
           * Opens the note on a modifier-click, the way every editor that has
           * both links and editable text handles it.
           *
           * A plain click has to keep placing the cursor: this is text being
           * written, and a link you cannot put your caret inside is a link you
           * cannot edit.
           */
          handleClick: (view: EditorView, _pos, event: MouseEvent) => {
            if (!event.metaKey && !event.ctrlKey) return false;

            const element = (event.target as HTMLElement | null)?.closest<HTMLElement>(
              "[data-wikilink]",
            );
            const target = element?.dataset.wikilink;
            if (!target) return false;

            bridge()?.open(target, element?.dataset.wikilinkAnchor ?? null);
            view.dispatch(view.state.tr);
            return true;
          },
        },
      }),
    ];
  },
});
