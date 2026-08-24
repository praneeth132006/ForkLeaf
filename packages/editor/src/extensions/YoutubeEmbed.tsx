"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { youtubeEmbedUrl, youtubeVideoFrom, youtubeWatchUrl } from "@forkleaf/markdown-engine";

/**
 * A YouTube video as a block in the WYSIWYG editor.
 *
 * The note stores an ordinary markdown link on a line of its own — nothing
 * app-specific, no HTML, no custom syntax — so a note with a video in it still
 * reads correctly on github.com, in an IDE, and in every other markdown tool,
 * where it shows up as the link it is. The player is how *this* editor and the
 * preview choose to draw that line, and the same rule governs both: a link
 * that is the whole paragraph becomes the video, a link inside a sentence
 * stays a link.
 */

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    youtubeEmbed: {
      /** Inserts a video. Returns false for a URL that names no video. */
      insertYoutubeEmbed: (url: string) => ReturnType;
    };
  }
}

function YoutubeNodeView({ node, selected }: NodeViewProps) {
  const src = (node.attrs.src as string) ?? "";
  const video = youtubeVideoFrom(src);

  return (
    <NodeViewWrapper
      className="fl-embed-node my-4"
      data-type="youtube"
      data-drag-handle
      draggable="true"
    >
      {video ? (
        <figure
          className={`relative overflow-hidden rounded-xl border bg-black transition-colors ${
            selected ? "border-[var(--fl-accent)]" : "border-[var(--fl-border)]"
          }`}
        >
          {/* 16:9, held by the padding trick rather than `aspect-ratio` so the
              box is the right size before the player has loaded anything. */}
          <div className="relative h-0 w-full pb-[56.25%]">
            <iframe
              className="absolute inset-0 h-full w-full"
              src={youtubeEmbedUrl(video)}
              title="YouTube video player"
              loading="lazy"
              allow="accelerometer; encrypted-media; picture-in-picture; web-share; fullscreen"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
        </figure>
      ) : (
        <p className="rounded-lg border border-dashed border-[var(--fl-border)] px-3 py-2 text-sm text-[var(--fl-muted)]">
          Not a YouTube link: {src}
        </p>
      )}

      {/* The URL stays visible. It is what the file actually contains, and a
          player with no link under it gives no way to see or copy that. */}
      <figcaption className="mt-1 truncate text-xs text-[var(--fl-muted)]">
        <a
          href={video ? youtubeWatchUrl(video) : src}
          target="_blank"
          rel="noopener noreferrer"
          className="underline-offset-2 hover:underline"
        >
          {video ? youtubeWatchUrl(video) : src}
        </a>
      </figcaption>
    </NodeViewWrapper>
  );
}

export const YoutubeEmbed = Node.create({
  name: "youtubeEmbed",
  group: "block",
  // Atomic: there is nothing inside it for ProseMirror to edit.
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-src") ?? "",
        renderHTML: (attributes) => ({ "data-src": attributes.src as string }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="youtube"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "youtube" })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(YoutubeNodeView);
  },

  addCommands() {
    return {
      insertYoutubeEmbed:
        (url: string) =>
        ({ commands }) => {
          const video = youtubeVideoFrom(url);
          if (!video) return false;
          return commands.insertContent({
            type: this.name,
            attrs: { src: youtubeWatchUrl(video) },
          });
        },
    };
  },

  /**
   * Pasting a video link where the whole paragraph would be that link.
   *
   * Without this the embed would only appear the next time the note was parsed
   * from markdown — paste a link, get a link; reopen the note an hour later,
   * find a player. Pasting into the middle of a sentence still just pastes the
   * link, which is the same rule the renderer applies.
   */
  addProseMirrorPlugins() {
    const type = this.type;

    return [
      new Plugin({
        key: new PluginKey("youtubeEmbedPaste"),
        props: {
          handlePaste: (view, event) => {
            const text = event.clipboardData?.getData("text/plain").trim() ?? "";
            if (!text || /\s/.test(text)) return false;

            const video = youtubeVideoFrom(text);
            if (!video) return false;

            const { $from, empty } = view.state.selection;
            // Only where the link would stand alone: an empty paragraph, or
            // the whole of one selected.
            const parent = $from.parent;
            if (parent.type.name !== "paragraph") return false;
            if (empty ? parent.content.size > 0 : !selectionCoversBlock(view.state)) return false;

            event.preventDefault();
            const node = type.create({ src: youtubeWatchUrl(video) });
            const tr = view.state.tr.replaceSelectionWith(node);
            view.dispatch(tr);
            return true;
          },
        },
      }),
    ];
  },

  /**
   * Markdown bridge.
   *
   * Out: the watch URL on a line of its own, which GFM autolinks — a plain
   * link in the file, readable anywhere. In: a paragraph that holds nothing
   * but a link to a video becomes this node again.
   */
  addStorage() {
    return {
      markdown: {
        serialize(state: MarkdownSerializerLike, node: { attrs: { src?: string } }) {
          state.write(node.attrs.src ?? "");
          state.closeBlock(node);
        },
        parse: {
          updateDOM(element: HTMLElement) {
            for (const paragraph of Array.from(element.querySelectorAll<HTMLElement>("p"))) {
              const children = Array.from(paragraph.childNodes).filter(
                (child) => child.nodeType !== 3 || (child.textContent ?? "").trim() !== "",
              );

              const only = children.length === 1 ? children[0] : null;
              if (!only || !(only instanceof HTMLAnchorElement)) continue;

              const video = youtubeVideoFrom(only.getAttribute("href") ?? "");
              if (!video) continue;

              const replacement = element.ownerDocument.createElement("div");
              replacement.setAttribute("data-type", "youtube");
              replacement.setAttribute("data-src", youtubeWatchUrl(video));
              paragraph.replaceWith(replacement);
            }
          },
        },
      },
    };
  },
});

/** True when the selection is exactly the block it sits in. */
function selectionCoversBlock(state: {
  selection: {
    $from: { parent: { content: { size: number } }; parentOffset: number };
    to: number;
    from: number;
  };
}): boolean {
  const { $from, from, to } = state.selection;
  return $from.parentOffset === 0 && to - from === $from.parent.content.size;
}

/** The subset of prosemirror-markdown's serializer state that we use. */
interface MarkdownSerializerLike {
  write(text: string): void;
  closeBlock(node: unknown): void;
}
