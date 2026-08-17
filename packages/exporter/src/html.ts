import { markdownToHtml, extractMermaidBlocks, serializeDocument } from "@forkleaf/markdown-engine";
import { renderDiagram, LIGHT_THEME, DARK_THEME } from "@forkleaf/diagrams";
import type { ExportOptions } from "@forkleaf/types";

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

  return document(options.title, body, options.theme);
}

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
  /* Keep headings with their content and never split a diagram across pages. */
  @media print {
    body { padding: 0; background: #fff; color: #000; }
    h1, h2, h3 { break-after: avoid; }
    pre, blockquote, table, .diagram { break-inside: avoid; }
    a { color: inherit; text-decoration: none; }
  }
</style>
</head>
<body>
<main>
${body}
</main>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
