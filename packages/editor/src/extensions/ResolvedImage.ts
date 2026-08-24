import Image from "@tiptap/extension-image";

export interface ResolvedImageOptions {
  /**
   * Maps the `src` stored in the document to the URL actually loaded.
   *
   * Kept as an option rather than baked in so the editor package stays
   * unaware of where images live.
   */
  resolveSrc?: (src: string) => string;
  /**
   * Tells us the resolver's answers have changed, so images can re-ask.
   *
   * Resolving is not a pure function of the `src`: it is a lookup in a store
   * that fills up while the note is open — an image pasted a second ago is
   * still being written to the local asset store when its node is inserted.
   * Without this, the first answer is the only answer, and "not on this
   * device" is what a freshly pasted screenshot renders as forever.
   *
   * Returns an unsubscribe function.
   */
  subscribe?: (listener: () => void) => () => void;
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
      subscribe: undefined,
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
   * The rendered `<img>`, kept in step with the resolver.
   *
   * ProseMirror renders a node's DOM once and reuses it for as long as the
   * node itself does not change, so `renderHTML` alone gives an image exactly
   * one chance to be resolved. For a pasted screenshot that chance comes a
   * moment too early: the node is inserted as soon as the bytes are stored,
   * and the store the resolver reads has not yet published the new entry, so
   * the image resolved to the "not on this device" placeholder and stayed
   * there until the note was closed and opened again.
   *
   * A node view can re-ask. The node's own `src` attribute — the one that gets
   * serialised back to markdown — is never touched, so re-resolving cannot
   * change what is written to the file, and it never marks the note dirty.
   */
  addNodeView() {
    return ({ node, HTMLAttributes }) => {
      const options = this.options as ResolvedImageOptions;
      const dom = document.createElement("img");

      for (const [key, value] of Object.entries(HTMLAttributes)) {
        if (key === "src" || key === "data-src") continue;
        if (value === null || value === undefined) continue;
        dom.setAttribute(key, String(value));
      }

      let attrs = node.attrs as Record<string, unknown>;

      const paint = () => {
        const src = typeof attrs.src === "string" ? attrs.src : "";
        if (!src) {
          dom.removeAttribute("src");
          return;
        }

        const resolved = options.resolveSrc?.(src) ?? src;
        // Only on a real change: reassigning the same src restarts the load,
        // which flickers the image on every keystroke in the note.
        if (dom.getAttribute("src") !== resolved) dom.setAttribute("src", resolved);
        // What the markdown says, carried through any HTML round trip so
        // copying an image between notes does not paste a proxy URL.
        if (resolved !== src) dom.setAttribute("data-src", src);
        else dom.removeAttribute("data-src");
      };

      const applyText = () => {
        const alt = typeof attrs.alt === "string" ? attrs.alt : "";
        const title = typeof attrs.title === "string" ? attrs.title : "";
        if (alt) dom.setAttribute("alt", alt);
        else dom.removeAttribute("alt");
        if (title) dom.setAttribute("title", title);
        else dom.removeAttribute("title");
      };

      applyText();
      paint();

      const unsubscribe = options.subscribe?.(paint);

      return {
        dom,
        update: (updated) => {
          if (updated.type.name !== node.type.name) return false;
          attrs = updated.attrs as Record<string, unknown>;
          applyText();
          paint();
          return true;
        },
        destroy: () => {
          unsubscribe?.();
        },
      };
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
