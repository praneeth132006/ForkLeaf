import Highlight from "@tiptap/extension-highlight";

/**
 * Highlighting, in more than one colour, without leaving markdown behind.
 *
 * `==text==` is the syntax every markdown notebook has settled on, and it
 * carries no colour — so a second colour has to be written some other way or
 * not exist. The way chosen here is `<mark class="fl-hl-green">`, because it is
 * the one form that degrades honestly everywhere else: GitHub renders a `<mark>`
 * as a highlight (it drops the class, so the colour becomes its default), and
 * an editor that shows raw HTML shows a tag whose meaning is obvious. Nothing
 * silently loses the words.
 *
 * Yellow — the default — stays plain `==text==`, so the common case writes the
 * same file it always did and a note full of ordinary highlights is unchanged.
 */

/** The palette. A closed set: these become class names in the file. */
export const HIGHLIGHT_COLOURS = [
  { name: "yellow", label: "Yellow" },
  { name: "green", label: "Green" },
  { name: "blue", label: "Blue" },
  { name: "pink", label: "Pink" },
  { name: "purple", label: "Purple" },
  { name: "orange", label: "Orange" },
] as const;

export type HighlightColour = (typeof HIGHLIGHT_COLOURS)[number]["name"];

const NAMES = new Set<string>(HIGHLIGHT_COLOURS.map((colour) => colour.name));

/** The default, written as `==text==` and needing no class of its own. */
export const DEFAULT_HIGHLIGHT: HighlightColour = "yellow";

/** A colour name we recognise, or null for anything else. */
export function highlightColour(value: unknown): HighlightColour | null {
  return typeof value === "string" && NAMES.has(value) ? (value as HighlightColour) : null;
}

/** `fl-hl-green` → `green`. */
function colourFromClass(className: string | null): HighlightColour | null {
  const match = /(?:^|\s)fl-hl-([a-z]+)(?:\s|$)/.exec(className ?? "");
  return highlightColour(match?.[1]);
}

export const ColouredHighlight = Highlight.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      /**
       * Which colour, by name rather than by value.
       *
       * A name lets the two themes each pick their own shade — a highlight that
       * works on white is unreadable on black — and keeps the note free of
       * colour values that would look wrong the moment the palette changed.
       */
      color: {
        default: null,
        parseHTML: (element: HTMLElement) =>
          colourFromClass(element.getAttribute("class")) ??
          highlightColour(element.getAttribute("data-color")),
        renderHTML: (attributes: Record<string, unknown>) => {
          const colour = highlightColour(attributes.color);
          if (!colour || colour === DEFAULT_HIGHLIGHT) return {};
          return { class: `fl-hl-${colour}`, "data-color": colour };
        },
      },
    };
  },

  addStorage() {
    return {
      ...this.parent?.(),
      markdown: {
        serialize: {
          open: (_state: unknown, mark: { attrs?: Record<string, unknown> }) => {
            const colour = highlightColour(mark.attrs?.color);
            return !colour || colour === DEFAULT_HIGHLIGHT
              ? "=="
              : `<mark class="fl-hl-${colour}">`;
          },
          close: (_state: unknown, mark: { attrs?: Record<string, unknown> }) => {
            const colour = highlightColour(mark.attrs?.color);
            return !colour || colour === DEFAULT_HIGHLIGHT ? "==" : "</mark>";
          },
          mixable: true,
          expelEnclosingWhitespace: true,
        },
        parse: {
          /**
           * Turns our own `<mark>` back into a highlight on the way in.
           *
           * The markdown parser is deliberately run with HTML off — note
           * content is untrusted, and a notebook that executes the HTML in its
           * files is a notebook with a stored-XSS hole. So the tag arrives here
           * as escaped text, and exactly one pattern is un-escaped again: our
           * own mark, with a class from a closed set of colour names. Anything
           * else stays the literal text it was written as.
           */
          updateDOM(element: HTMLElement) {
            const pattern = /&lt;mark class="fl-hl-([a-z]+)"&gt;([\s\S]*?)&lt;\/mark&gt;/g;

            const rewrite = (html: string) =>
              html.replace(pattern, (whole, name: string, inner: string) =>
                highlightColour(name)
                  ? `<mark class="fl-hl-${name}" data-color="${name}">${inner}</mark>`
                  : whole,
              );

            const next = rewrite(element.innerHTML);
            if (next !== element.innerHTML) element.innerHTML = next;
          },
        },
      },
    };
  },
});
