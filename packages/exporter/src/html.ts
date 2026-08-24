import { markdownToHtml, extractMermaidBlocks, serializeDocument } from "@forkleaf/markdown-engine";
import { renderDiagram, LIGHT_THEME, DARK_THEME } from "@forkleaf/diagrams";
import type { ExportOptions } from "@forkleaf/types";

/**
 * Turns a note-relative image path into something that survives leaving the
 * app — a `data:` URL.
 *
 * Notes reference images the way a hand-written markdown file does, by a
 * relative path like `../assets/chart.png`. That is the right thing to store,
 * and it is meaningless once the HTML is a file on somebody's desktop or a
 * page inside a print frame: the browser resolves it against the wrong base,
 * gets nothing, and draws a broken-image icon. Every exported image was
 * missing from every PDF for exactly this reason.
 *
 * Resolving is the app's job, not this package's — only the app knows where
 * the bytes are, which for a private repository means a same-origin proxy and
 * for a local workspace means IndexedDB. So the caller passes this in.
 */
export type ImageResolver = (src: string) => Promise<string | null>;

/**
 * Rewrites every `src` in the rendered HTML through the resolver.
 *
 * Done on the HTML rather than on the markdown so it catches images however
 * they were written — markdown syntax, an inline `<img>`, a reference link.
 * A resolver that returns null leaves the original path alone, which is right
 * for an absolute URL and honest for an image we genuinely cannot find.
 */
async function inlineImages(html: string, resolve: ImageResolver): Promise<string> {
  const sources = new Set<string>();
  for (const match of html.matchAll(/<img\b[^>]*?\bsrc="([^"]*)"/gi)) {
    if (match[1]) sources.add(match[1]);
  }
  if (sources.size === 0) return html;

  const resolved = new Map<string, string>();
  await Promise.all(
    [...sources].map(async (src) => {
      try {
        const data = await resolve(src);
        if (data) resolved.set(src, data);
      } catch {
        // One unreadable image must not fail the whole export; the original
        // path stays and the rest of the document is still produced.
      }
    }),
  );

  return html.replace(
    /(<img\b[^>]*?\bsrc=")([^"]*)(")/gi,
    (whole, before: string, src: string, after: string) => {
      const data = resolved.get(src);
      return data ? `${before}${data}${after}` : whole;
    },
  );
}

/**
 * Standalone HTML export.
 *
 * Everything is inlined — styles, and diagrams as SVG — so the resulting file
 * opens correctly from a USB stick with no network. This is also the input to
 * the PDF exporter, which prints it.
 */

/** Replaces each ```mermaid block with its rendered SVG, in document order. */
async function inlineDiagrams(markdown: string, theme: "light" | "dark"): Promise<string> {
  const blocks = extractMermaidBlocks(markdown);
  if (blocks.length === 0) return markdown;

  const palette = theme === "dark" ? DARK_THEME : LIGHT_THEME;
  let result = "";
  let cursor = 0;

  for (const block of blocks) {
    result += markdown.slice(cursor, block.start);

    const { svg } = await renderDiagram(block.code, palette);
    result += svg
      ? // Blank lines keep the raw HTML as its own markdown block.
        `\n\n<div class="diagram">${svg}</div>\n\n`
      : // Rendering failed: keep the source visible rather than dropping content.
        `\n\n\`\`\`\n${block.code}\n\`\`\`\n\n`;

    cursor = block.end;
  }

  return result + markdown.slice(cursor);
}

/**
 * Markdown → a complete HTML document.
 *
 * Diagram SVGs are spliced in after sanitisation, because the sanitiser used
 * for note content strips SVG entirely — the SVG is separately sanitised by the
 * diagram renderer before it gets here.
 */
export async function toHtml(
  markdown: string,
  frontmatter: Record<string, unknown>,
  options: ExportOptions,
  resolveImage?: ImageResolver,
): Promise<string> {
  const source = options.includeFrontmatter ? serializeDocument(markdown, frontmatter) : markdown;

  const withDiagrams = options.renderDiagrams
    ? await inlineDiagrams(source, options.theme)
    : source;

  // Swap each diagram for an opaque token, render + sanitise the markdown, then
  // put the SVGs back. Without this the sanitiser would strip them.
  const svgs: string[] = [];
  const tokenised = withDiagrams.replace(
    /<div class="diagram">([\s\S]*?)<\/div>/g,
    (_match, svg: string) => {
      svgs.push(svg);
      return `\n\nFORKLEAFDIAGRAM${svgs.length - 1}TOKEN\n\n`;
    },
  );

  let body = markdownToHtml(tokenised);
  body = body.replace(
    /FORKLEAFDIAGRAM(\d+)TOKEN/g,
    (_match, index: string) => `<div class="diagram">${svgs[Number(index)] ?? ""}</div>`,
  );

  if (resolveImage) body = await inlineImages(body, resolveImage);

  return document(options.title, body, options.theme);
}

/**
 * The ForkLeaf mark, as inline SVG.
 *
 * Inline rather than linked, because the whole promise of this export is one
 * file that opens from a USB stick with no network — a logo fetched from a
 * server would be the one thing in the document that needed one.
 */
const BRAND_MARK = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21v-7"/><path d="M12 14 6.5 8.5A4 4 0 0 1 5.4 5.7L5 3l2.7.4a4 4 0 0 1 2.8 1.1L12 6"/><path d="m12 14 5.5-5.5a4 4 0 0 0 1.1-2.8L19 3l-2.7.4a4 4 0 0 0-2.8 1.1L12 6"/></svg>`;

function document(title: string, body: string, theme: "light" | "dark"): string {
  const dark = theme === "dark";
  const colors = dark
    ? {
        bg: "#14181F",
        fg: "#EDEAE2",
        muted: "#8A93A3",
        rule: "#2A3240",
        accent: "#3FA796",
        code: "#1E2530",
      }
    : {
        bg: "#FFFFFF",
        fg: "#22262E",
        muted: "#6B7280",
        rule: "#E5E3DC",
        accent: "#2F7F72",
        code: "#F5F3ED",
      };

  return `<!doctype html>
<html lang="en" data-theme="${theme}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  :root {
    --bg: ${colors.bg};
    --fg: ${colors.fg};
    --muted: ${colors.muted};
    --rule: ${colors.rule};
    --accent: ${colors.accent};
    --code-bg: ${colors.code};
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 3rem 1.5rem 6rem;
    background: var(--bg);
    color: var(--fg);
    font: 16px/1.7 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  main { max-width: 46rem; margin: 0 auto; }
  h1, h2, h3, h4 { line-height: 1.25; margin: 2.5rem 0 1rem; font-weight: 650; }
  h1 { font-size: 2.25rem; margin-top: 0; letter-spacing: -0.02em; }
  h2 { font-size: 1.6rem; }
  h3 { font-size: 1.25rem; }
  p, ul, ol, blockquote, table, pre { margin: 0 0 1.25rem; }
  a { color: var(--accent); }
  hr { border: none; border-top: 1px solid var(--rule); margin: 2.5rem 0; }
  blockquote {
    margin-left: 0;
    padding: 0.25rem 0 0.25rem 1.25rem;
    border-left: 3px solid var(--accent);
    color: var(--muted);
  }
  code {
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
    font-size: 0.9em;
    background: var(--code-bg);
    padding: 0.15em 0.4em;
    border-radius: 4px;
  }
  pre {
    background: var(--code-bg);
    padding: 1rem 1.25rem;
    border-radius: 8px;
    overflow-x: auto;
  }
  pre code { background: none; padding: 0; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid var(--rule); padding: 0.5rem 0.75rem; text-align: left; }
  th { background: var(--code-bg); font-weight: 600; }
  img { max-width: 100%; height: auto; }
  ul li::marker { color: var(--muted); }
  input[type="checkbox"] { margin-right: 0.5rem; }
  .diagram { margin: 2rem 0; text-align: center; overflow-x: auto; }
  .diagram svg { max-width: 100%; height: auto; }
  /* ── The document's own title block ──────────────────────────────────
     A PDF gets handed on with no filename attached to it once it is in an
     email, so it has to say what it is on the page itself. */
  .doc-head {
    margin: 0 0 2.5rem;
    padding-bottom: 1.25rem;
    border-bottom: 1px solid var(--rule);
  }
  .doc-title {
    margin: 0;
    font-size: 2.25rem;
    line-height: 1.2;
    letter-spacing: -0.02em;
    font-weight: 650;
  }
  .doc-meta { margin: 0.5rem 0 0; color: var(--muted); font-size: 0.85rem; }
  /* The body's own leading H1 would repeat the title block. */
  .doc-head + h1:first-of-type { margin-top: 0; }

  /* ── The footer ──────────────────────────────────────────────────────
     Hidden on screen, where the app's own chrome is already saying all of
     this, and shown on paper where nothing else is. */
  .doc-foot { display: none; }

  /* Keep headings with their content and never split a diagram across pages. */
  @media print {
    /* Margins belong to the page, not the body: a body margin is applied once
       at the top of the document, so every page after the first printed into
       the sheet's edge. */
    @page { margin: 18mm 16mm 20mm; }
    body { padding: 0; background: #fff; color: #000; }
    h1, h2, h3 { break-after: avoid; }
    pre, blockquote, table, .diagram, figure, img { break-inside: avoid; }
    a { color: inherit; text-decoration: none; }
    /* A link is worth nothing on paper unless you can see where it goes. */
    a[href^="http"]::after {
      content: " (" attr(href) ")";
      font-size: 0.8em;
      color: #555;
      word-break: break-all;
    }
    .doc-head { border-bottom-color: #ccc; }
    .doc-meta { color: #555; }

    /* A fixed element inside a paged context repeats on every sheet, which is
       how a running footer is done without the @page margin boxes that no
       browser actually implements. */
    .doc-foot {
      position: fixed;
      bottom: -12mm;
      left: 0;
      right: 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      padding-top: 2mm;
      border-top: 1px solid #ddd;
      font-size: 9pt;
      color: #666;
    }
    .doc-foot-title {
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .doc-foot-brand {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      white-space: nowrap;
    }
  }
</style>
</head>
<body>
<main>
<header class="doc-head">
  <h1 class="doc-title">${escapeHtml(title)}</h1>
  <p class="doc-meta">${escapeHtml(printedOn())}</p>
</header>
${body}
</main>
<footer class="doc-foot" aria-hidden="true">
  <span class="doc-foot-title">${escapeHtml(title)}</span>
  <span class="doc-foot-brand">${BRAND_MARK} ForkLeaf</span>
</footer>
</body>
</html>`;
}

/** The date the file was made, in the reader's own locale. */
function printedOn(): string {
  try {
    return new Date().toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
