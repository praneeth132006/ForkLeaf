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
});
