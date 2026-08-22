import Image from "@tiptap/extension-image";

export interface ResolvedImageOptions {
  /**
   * Maps the `src` stored in the document to the URL actually loaded.
   *
   * Kept as an option rather than baked in so the editor package stays
   * unaware of where images live.
   */
  resolveSrc?: (src: string) => string;
}

/**
 * The image node, displayed through a resolver.
 *
 * The document stores exactly what belongs in the markdown file — usually a
 * repository-relative path like `../assets/chart.png`, which is what makes the
 * note render on github.com. The browser cannot load that, so the rendered
 * `<img>` gets a resolved URL while the node's own `src` attribute, which is
 * what gets serialised back to markdown, is left alone.
 *
 * `data-src` carries the original through any HTML round trip, so copying an
 * image from one note and pasting it into another does not paste a proxy URL.
 */
export const ResolvedImage = Image.extend<ResolvedImageOptions & Record<string, unknown>>({
  addOptions() {
    return {
      ...this.parent?.(),
      resolveSrc: undefined,
    };
  },

  addAttributes() {
    return {
      ...this.parent?.(),
      src: {
        default: null,
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-src") ?? element.getAttribute("src"),
        renderHTML: (attributes: Record<string, unknown>) => {
          const src = typeof attributes.src === "string" ? attributes.src : "";
          if (!src) return {};

          const resolve = (this.options as ResolvedImageOptions).resolveSrc;
          if (!resolve) return { src };

          const resolved = resolve(src);
          return resolved === src ? { src } : { src: resolved, "data-src": src };
        },
      },
    };
  },

  /**
   * Markdown bridge.
   *
   * Without one, tiptap-markdown falls back to its inline-image serialiser —
   * and this node is a *block* (`inline: false`), so nothing ever closed the
   * block after it. The next block was written straight onto the end of the
   * image, which turned a diagram that followed an image into
   * `![shot](a.png)```mermaid` on one line: no longer a fence, no longer a
   * diagram, and no longer valid markdown anywhere else either.
   */
  addStorage() {
    return {
      ...this.parent?.(),
      markdown: {
        serialize(state: MarkdownSerializerLike, node: { attrs: Record<string, unknown> }) {
          const src = typeof node.attrs.src === "string" ? node.attrs.src : "";
          const alt = typeof node.attrs.alt === "string" ? node.attrs.alt : "";
          const title = typeof node.attrs.title === "string" ? node.attrs.title : "";

          state.write(
            `![${alt.replace(/[[\]]/g, "\\$&")}](${encodeSrc(src)}${
              title ? ` "${title.replace(/"/g, '\\"')}"` : ""
            })`,
          );
          // The line this fixes.
          state.closeBlock(node);
        },
      },
    };
  },
});

/**
 * A src safe to sit inside `(…)`.
 *
 * A path with a space or a bracket in it ends the link early; angle brackets
 * are markdown's own way of saying "all of this is the URL".
 */
function encodeSrc(src: string): string {
  return /[\s()<>]/.test(src) ? `<${src.replace(/[<>]/g, encodeURIComponent)}>` : src;
}

/** The subset of prosemirror-markdown's serializer state that we use. */
interface MarkdownSerializerLike {
  write(text: string): void;
  closeBlock(node: unknown): void;
}
