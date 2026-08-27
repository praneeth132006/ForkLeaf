import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import remarkRehype from "remark-rehype";
import rehypeHighlight from "rehype-highlight";
import { all as allLanguages } from "lowlight";
import rehypeSanitize, { defaultSchema, type Options as SanitizeSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkStringify from "remark-stringify";
import { visit } from "unist-util-visit";
import type { Root as MdastRoot, Text as MdastText, PhrasingContent, Parent } from "mdast";
import type { Root as HastRoot, Element } from "hast";
import { remarkWikilink, type WikilinkResolver } from "./wikilinks";
import { youtubeEmbedUrl, youtubeVideoFrom, YOUTUBE_EMBED_ORIGIN } from "./youtube";

/**
 * Markdown → HTML rendering.
 *
 * Output is always sanitised. Note content can arrive from a public GitHub repo
 * that the user merely has read access to, so it is untrusted input: rendering
 * raw HTML from it would be a stored-XSS hole in the preview pane.
 */

/**
 * Sanitiser schema extended for the features we actually use:
 * task-list checkboxes, heading anchors, syntax-highlight class names, and the
 * `data-mermaid` marker we attach to diagram placeholders.
 */
/**
 * Adds class names to an element's allowlist, folding them into whatever
 * `className` entry is already there.
 */
type AttributeRule = NonNullable<NonNullable<SanitizeSchema["attributes"]>[string]>[number];

function withClasses(rules: readonly AttributeRule[], classes: string[]): AttributeRule[] {
  const existing = rules.find(
    (rule): rule is [string, ...(string | number | boolean | RegExp)[]] =>
      Array.isArray(rule) && rule[0] === "className",
  );

  const merged: AttributeRule = ["className", ...(existing?.slice(1) ?? []), ...classes];
  return [...rules.filter((rule) => rule !== existing), merged];
}

const schema: SanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    // `hljs` sits alongside `language-*` on the <code> the highlighter wraps;
    // without it the stylesheet has nothing to hook onto.
    code: [...(defaultSchema.attributes?.code ?? []), ["className", /^language-./, "hljs"]],
    pre: [...(defaultSchema.attributes?.pre ?? []), ["className", "hljs"]],
    span: [...(defaultSchema.attributes?.span ?? []), ["className", /^hljs-/]],
    input: [
      ...(defaultSchema.attributes?.input ?? []),
      "checked",
      "disabled",
      ["type", "checkbox"],
    ],
    div: [...(defaultSchema.attributes?.div ?? []), "className", "dataMermaid"],
    // Highlight colours, by name from a closed set — never an arbitrary class,
    // which would let note content borrow any style in the app.
    mark: [
      ...(defaultSchema.attributes?.mark ?? []),
      ["className", /^fl-hl-(yellow|green|blue|pink|purple|orange)$/],
    ],
    // Wikilinks render as ordinary anchors carrying the target they were
    // written with, so a click can open the note in a tab rather than
    // navigating. The class list is constrained to our own three names —
    // allowing `className` outright on `a` would let note content borrow any
    // style in the app, including the ones that hide things.
    //
    // The default schema already allows one class on `a` (footnote backrefs),
    // and the sanitiser honours only the first entry it finds for a property.
    // So our names are merged into that entry rather than appended as a second
    // one, which is silently ignored.
    //
    // `target` and `rel` are pinned to single values rather than allowed as
    // free text: a link in a note is content, and the only thing it is allowed
    // to say about where it opens is "a new tab, with no handle on this one".
    a: withClasses(defaultSchema.attributes?.a ?? [], [
      "fl-wikilink",
      "fl-wikilink-found",
      "fl-wikilink-missing",
      "fl-external",
    ]).concat([
      "dataWikilink",
      "dataWikilinkAnchor",
      ["target", "_blank"],
      // Listed as two tokens, not one string: the sanitiser matches each
      // value of a multi-valued attribute against the allowlist separately.
      ["rel", "noopener", "noreferrer"],
    ]),
    // `loading` keeps a note full of screenshots from fetching every one of
    // them at once; the rest are what the default schema already allows.
    img: [...(defaultSchema.attributes?.img ?? []), ["loading", "lazy"]],
    /**
     * The video player, and nothing else.
     *
     * An iframe is the one element in this schema that can load a whole other
     * document, so `src` is pinned to the embed path of the player origin by
     * pattern rather than allowed as a URL. Note content cannot reach this
     * anyway — inline HTML in a note is escaped, never parsed — so the only
     * iframes in the tree are the ones the pass below built. The rule is here
     * because "the sanitiser would have caught it" should stay true.
     */
    iframe: [
      ["src", new RegExp(`^${YOUTUBE_EMBED_ORIGIN.replace(/[.]/g, "\\.")}/embed/`)],
      "title",
      ["loading", "lazy"],
      "allow",
      "allowFullScreen",
      "referrerPolicy",
      ["className", "fl-embed-frame"],
    ],
    "*": [...(defaultSchema.attributes?.["*"] ?? []), "id"],
  },
  // `mark` is what `==highlight==` becomes. The editor has always offered
  // highlighting; without this the preview showed the equals signs as literal
  // text, so the button appeared to do nothing.
  tagNames: [...(defaultSchema.tagNames ?? []), "input", "mark", "iframe"],
  protocols: {
    ...defaultSchema.protocols,
    // Notes written offline embed their images inline, so `data:` has to
    // survive sanitisation. `src` is only reachable on `img` here, and the
    // rewrite step below has already thrown out every data URL that is not a
    // raster image — an `<img>` cannot run script in any case.
    src: [...(defaultSchema.protocols?.src ?? []), "data"],
  },
};

/** Data URLs allowed through: raster images only, never a document format. */
const SAFE_DATA_IMAGE =
  /^data:image\/(png|jpeg|jpg|gif|webp|avif|bmp|x-icon|vnd\.microsoft\.icon);base64,/i;

/**
 * `==text==` → `<mark>text</mark>`.
 *
 * Not part of CommonMark or GFM, so nothing upstream parses it — but it is the
 * convention every markdown note-taking tool has settled on, and it is what
 * the rich-text editor writes when you highlight something. Implemented as a
 * pass over text nodes rather than a micromark extension because the syntax
 * has no nesting rules worth honouring: it is a pair of delimiters on one line.
 */
function remarkHighlight() {
  return (tree: MdastRoot) => {
    visit(
      tree,
      "text",
      (node: MdastText, index: number | undefined, parent: Parent | undefined) => {
        if (!parent || index === undefined || !node.value.includes("==")) return;

        const parts: PhrasingContent[] = [];
        const pattern = /==(?!\s)([^=\n]+?)(?<!\s)==/g;
        let cursor = 0;
        let match: RegExpExecArray | null;

        while ((match = pattern.exec(node.value)) !== null) {
          if (match.index > cursor) {
            parts.push({ type: "text", value: node.value.slice(cursor, match.index) });
          }
          parts.push({
            type: "emphasis",
            children: [{ type: "text", value: match[1] ?? "" }],
            // Rendered as <mark> rather than <em>; the node type is only a
            // carrier for the phrasing content.
            data: { hName: "mark" },
          });
          cursor = match.index + match[0].length;
        }

        if (parts.length === 0) return;
        if (cursor < node.value.length) {
          parts.push({ type: "text", value: node.value.slice(cursor) });
        }

        parent.children.splice(index, 1, ...parts);
        // Skip past what was just inserted.
        return index + parts.length;
      },
    );
  };
}

/** Colour names a highlight may carry. A closed set: these reach the DOM. */
const HIGHLIGHT_COLOURS = /^(yellow|green|blue|pink|purple|orange)$/;

/**
 * `<mark class="fl-hl-green">text</mark>` → a highlight in that colour.
 *
 * `==text==` carries no colour, so a second one has to be written some other
 * way or not exist at all. This is the way that degrades honestly everywhere
 * else: GitHub renders a `<mark>` as a highlight (dropping the class, so the
 * colour becomes its default), and an editor showing raw HTML shows a tag whose
 * meaning is obvious. The words survive in every case.
 *
 * Recognised as a *pattern*, with HTML parsing left off. Note content can come
 * from any repository the reader can see, so it is untrusted, and a renderer
 * that executes the HTML in its files is a stored-XSS hole in every note. The
 * opening tag is matched exactly — colour name from a closed set, nothing else
 * permitted — and anything that does not match is left to be dropped as the
 * unparsed HTML it is.
 */
function remarkColouredHighlight() {
  const OPEN = /^<mark class="fl-hl-([a-z]+)">$/;

  return (tree: MdastRoot) => {
    visit(tree, (node: unknown) => {
      const parent = node as Parent;
      if (!Array.isArray(parent.children)) return;

      for (let index = 0; index < parent.children.length; index += 1) {
        const child = parent.children[index];
        if (!child || child.type !== "html") continue;

        const colour = OPEN.exec(child.value.trim())?.[1];
        if (!colour || !HIGHLIGHT_COLOURS.test(colour)) continue;

        const closing = parent.children.findIndex(
          (candidate, at) =>
            at > index && candidate.type === "html" && candidate.value.trim() === "</mark>",
        );
        if (closing === -1) continue;

        const inner = parent.children.slice(index + 1, closing) as PhrasingContent[];
        parent.children.splice(index, closing - index + 1, {
          type: "emphasis",
          children: inner,
          data: { hName: "mark", hProperties: { className: [`fl-hl-${colour}`] } },
        } as PhrasingContent);
      }
    });
  };
}

export interface RenderOptions {
  /**
   * Maps an image `src` written in the note to one the browser can load.
   *
   * Notes reference images by repository-relative path, which is what makes
   * them render on github.com; the page showing them has no way to resolve
   * such a path on its own. Rendering is where the two meet.
   */
  resolveImageSrc?: (src: string) => string;

  /**
   * Turns a `[[wikilink]]` into an href, and says whether the note exists.
   *
   * With no resolver, wikilinks still render as links — to `#target` — rather
   * than as literal brackets, so a preview with no workspace behind it reads
   * as prose instead of as syntax.
   */
  resolveWikilink?: WikilinkResolver;
}

/**
 * Rewrites image sources, and drops the ones nothing should load.
 *
 * Runs before the sanitiser, so whatever a resolver hands back is still
 * subject to the same schema as everything else in the document.
 */
function rehypeImages(options: RenderOptions) {
  return (tree: HastRoot) => {
    visit(tree, "element", (node: Element) => {
      if (node.tagName !== "img") return;

      const src = typeof node.properties?.src === "string" ? node.properties.src : "";
      if (!src) return;

      if (src.startsWith("data:")) {
        // A `data:` document — SVG, HTML — has no business being an image.
        if (!SAFE_DATA_IMAGE.test(src)) delete node.properties.src;
        return;
      }

      if (options.resolveImageSrc) node.properties.src = options.resolveImageSrc(src);
      node.properties.loading = "lazy";
    });
  };
}

/**
 * A link out of the notebook opens a tab of its own.
 *
 * Without this, clicking the source on a captured web page — the whole point
 * of capturing one — replaced the editor with that page, and any unsaved
 * paragraph went with it. Every other note-taking tool opens outward links in
 * a new tab for exactly this reason.
 *
 * Only absolute `http(s)` links are touched. In-page anchors, wikilinks and
 * the app's own relative hrefs stay as they are: those go somewhere the app
 * can render itself, and a new tab for them would be a bug, not a courtesy.
 *
 * `rel` is not optional here. `target="_blank"` without `noopener` hands the
 * opened page a live reference back to this one.
 */
function rehypeExternalLinks() {
  return (tree: HastRoot) => {
    visit(tree, "element", (node: Element) => {
      if (node.tagName !== "a") return;

      const href = typeof node.properties?.href === "string" ? node.properties.href : "";
      if (!/^https?:\/\//i.test(href)) return;

      node.properties.target = "_blank";
      node.properties.rel = ["noopener", "noreferrer"];

      const classes = node.properties.className;
      node.properties.className = Array.isArray(classes)
        ? [...classes, "fl-external"]
        : ["fl-external"];
    });
  };
}

/**
 * A paragraph that is only a YouTube link becomes the video.
 *
 * The rule is deliberately narrow — the link has to be the whole paragraph —
 * so a sentence that mentions a video stays a sentence with a link in it, and
 * the writer keeps a way to link to a video without embedding it.
 *
 * Nothing about the markdown changes: the file still holds a plain link, which
 * is what makes the note read correctly on github.com and everywhere else.
 */
function rehypeYoutube() {
  return (tree: HastRoot) => {
    visit(tree, "element", (node: Element) => {
      if (node.tagName !== "p") return;

      const children = node.children.filter(
        (child) => child.type !== "text" || child.value.trim() !== "",
      );
      const only = children.length === 1 ? children[0] : undefined;
      if (!only || only.type !== "element" || only.tagName !== "a") return;

      const href = typeof only.properties?.href === "string" ? only.properties.href : "";
      const video = youtubeVideoFrom(href);
      if (!video) return;

      node.tagName = "div";
      node.properties = { className: ["fl-embed"] };
      node.children = [
        {
          type: "element",
          tagName: "iframe",
          properties: {
            src: youtubeEmbedUrl(video),
            title: "YouTube video player",
            className: ["fl-embed-frame"],
            loading: "lazy",
            allow: "accelerometer; encrypted-media; picture-in-picture; web-share; fullscreen",
            allowFullScreen: true,
            referrerPolicy: "strict-origin-when-cross-origin",
          },
          children: [],
        },
      ];
    });
  };
}

const buildHtmlPipeline = (options: RenderOptions) =>
  unified()
    .use(remarkParse)
    .use(remarkGfm)
    /**
     * A newline in a note is a newline.
     *
     * CommonMark says a single line break inside a paragraph is a space, which
     * is right for prose meant to be typeset and wrong for a notebook: someone
     * writing a list of names one per line, without bullets, means one per
     * line. Worse, it made the two editing surfaces disagree — the same file
     * showed as four lines in the source view and as one paragraph in rich
     * text, and nothing told the reader which one the file "really" was.
     *
     * The same choice Obsidian ships as its default, and applied to both sides
     * of the round trip: this parser, and the hard-break serialiser in the rich
     * editor. The cost is that lines separated by a single newline render as
     * one paragraph on github.com, which reads markdown the strict way — but a
     * blank line is a paragraph break in both, so anything written to be
     * portable already is.
     */
    .use(remarkBreaks)
    .use(remarkHighlight)
    // Before remark-rehype, which is where unparsed HTML nodes are dropped.
    .use(remarkColouredHighlight)
    // Before remark-rehype, because it produces mdast link nodes.
    .use(remarkWikilink, { resolve: options.resolveWikilink })
    // allowDangerousHtml is deliberately off — inline HTML in notes is escaped.
    .use(remarkRehype)
    // Highlighting runs *before* sanitising, so the `hljs-` spans it emits are
    // subject to the same schema as everything else.
    //
    // The full language set, not highlight.js's `common` bundle: common is ~35
    // languages and silently renders anything outside it — Zig, Nim, Elixir,
    // Haskell — as flat grey text, which is exactly the case someone writing
    // documentation for an unusual project runs into. `detect` stays off, since
    // guessing the language of an unlabelled three-line snippet is usually wrong
    // and colours it misleadingly.
    .use(rehypeHighlight, { detect: false, languages: allLanguages })
    .use(rehypeImages, options)
    .use(rehypeYoutube)
    // After the YouTube pass, which turns some links into iframes and leaves
    // the rest as links — those are the ones that need a tab of their own.
    .use(rehypeExternalLinks)
    .use(rehypeSanitize, schema)
    .use(rehypeStringify);

/**
 * The pipeline with no image resolver, built once.
 *
 * Assembling a unified pipeline is not free, and the overwhelmingly common
 * case — rendering with default options — should not pay for it on every
 * keystroke of a live preview.
 */
const defaultHtmlPipeline = buildHtmlPipeline({});

/** Renders markdown to sanitised HTML. Safe to inject with innerHTML. */
export function markdownToHtml(markdown: string, options?: RenderOptions): string {
  const pipeline =
    options?.resolveImageSrc || options?.resolveWikilink
      ? buildHtmlPipeline(options)
      : defaultHtmlPipeline;
  return String(pipeline.processSync(markdown));
}

const stringifyPipeline = unified().use(remarkStringify, {
  bullet: "-",
  emphasis: "_",
  strong: "*",
  fence: "`",
  fences: true,
  rule: "-",
  listItemIndent: "one",
});

/** Serialises an mdast tree back to markdown with our house formatting. */
export function astToMarkdown(tree: MdastRoot): string {
  return stringifyPipeline.stringify(tree);
}

/**
 * Normalises markdown formatting (bullet style, fence style, spacing) by doing a
 * parse/stringify round trip. Used by the "Format document" command.
 */
export function formatMarkdown(markdown: string): string {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(markdown) as MdastRoot;
  return astToMarkdown(tree);
}
