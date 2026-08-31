"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { markdownToHtml, extractMermaidBlocks } from "@forkleaf/markdown-engine";
import {
  renderDiagram,
  extractDiagramLinks,
  markLinkedNodes,
  LIGHT_THEME,
  DARK_THEME,
  type DiagramLink,
} from "@forkleaf/diagrams";
import { useDocumentTheme } from "./useDocumentTheme";
import { handleLinkClick, type LinkBridge } from "./links";

export interface PreviewProps {
  markdown: string;
  /** Omit to follow the app's current theme. */
  theme?: "light" | "dark";
  className?: string;
  /** Called when the user clicks a rendered diagram, to open it for editing. */
  onDiagramClick?: (code: string, index: number) => void;
  /**
   * Maps an image `src` in the note to a URL the browser can load.
   *
   * Memoise it: the whole document is re-rendered whenever this identity
   * changes.
   */
  resolveImageSrc?: (src: string) => string;
  /**
   * How `[[wikilinks]]` resolve, and what a click on one does.
   *
   * Memoise it alongside `resolveImageSrc`: it is a render dependency for the
   * same reason.
   */
  links?: LinkBridge;
}

/**
 * Placeholder token swapped in for a diagram before sanitisation.
 *
 * The random part matters: a note whose prose happens to contain the literal
 * token — a note about how this component works, for instance — would otherwise
 * have that text replaced by somebody else's diagram.
 */
const RUN = Math.random().toString(36).slice(2, 10).toUpperCase();
const TOKEN = (index: number) => `FORKLEAFDIAGRAM${RUN}X${index}TOKEN`;
const TOKEN_PATTERN = new RegExp(`FORKLEAFDIAGRAM${RUN}X(\\d+)TOKEN`, "g");

/**
 * Rendered markdown preview with live Mermaid diagrams.
 *
 * Diagrams are rendered separately from the markdown and spliced back in
 * afterwards. That ordering matters: the markdown sanitiser strips SVG (it has
 * to, because note content is untrusted), so the SVG has to arrive after
 * sanitisation — already sanitised by the diagram renderer itself.
 */
export function Preview({
  markdown,
  theme,
  className,
  onDiagramClick,
  resolveImageSrc,
  links,
}: PreviewProps) {
  const documentTheme = useDocumentTheme();
  const resolved = theme ?? documentTheme;
  const [diagrams, setDiagrams] = useState<Map<number, string>>(new Map());
  /**
   * The notes each diagram's boxes stand for, by block.
   *
   * Held beside the rendered SVG rather than inside it: the marking is done
   * against the live DOM once the SVG is on the page, because matching on
   * mermaid's own element ids would be matching on an implementation detail.
   */
  const [diagramLinks, setDiagramLinks] = useState<Map<number, DiagramLink[]>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);

  const blocks = useMemo(() => extractMermaidBlocks(markdown), [markdown]);

  /**
   * The diagram sources, as one string.
   *
   * `blocks` is a fresh array on every keystroke, so using it as an effect
   * dependency re-ran the render pass for every character typed anywhere in
   * the note — including in prose three paragraphs from the nearest diagram.
   * What the render pass actually depends on is the diagram *source*, and that
   * only changes when a diagram does.
   */
  const blockKey = useMemo(() => blocks.map((block) => block.code).join("\u0000"), [blocks]);

  // Markdown with each diagram replaced by a token, rendered and sanitised.
  const html = useMemo(() => {
    const options =
      resolveImageSrc || links
        ? {
            ...(resolveImageSrc ? { resolveImageSrc } : {}),
            ...(links ? { resolveWikilink: links.resolve } : {}),
          }
        : undefined;
    if (blocks.length === 0) return markdownToHtml(markdown, options);

    let source = "";
    let cursor = 0;
    blocks.forEach((block, index) => {
      source += markdown.slice(cursor, block.start);
      source += `\n\n${TOKEN(index)}\n\n`;
      cursor = block.end;
    });
    source += markdown.slice(cursor);

    return markdownToHtml(source, options);
  }, [markdown, blocks, resolveImageSrc, links]);

  // Render diagrams off the critical path so typing never blocks on mermaid.
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const palette = resolved === "dark" ? DARK_THEME : LIGHT_THEME;
      const rendered = new Map<number, string>();

      const links = new Map<number, DiagramLink[]>();

      for (const [index, block] of blocks.entries()) {
        // The wikilinks come out before mermaid sees the source: it has no
        // idea what `[[…]]` means and would render the brackets, or read them
        // as one of its own shapes.
        const linked = extractDiagramLinks(block.code);
        if (linked.links.length > 0) links.set(index, linked.links);

        const { svg } = await renderDiagram(linked.code, palette);
        if (cancelled) return;
        if (svg) rendered.set(index, svg);
      }

      if (!cancelled) {
        setDiagrams(rendered);
        setDiagramLinks(links);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
    // `blocks` is deliberately absent: it is a new array every render, and
    // `blockKey` is the part of it this pass depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockKey, resolved]);

  // Swap the tokens for rendered SVG once both halves are ready.
  const finalHtml = useMemo(() => {
    if (blocks.length === 0) return html;

    return html.replace(TOKEN_PATTERN, (_match, raw: string) => {
      const index = Number(raw);
      const svg = diagrams.get(index);

      if (!svg) {
        // Still rendering, or the source is mid-edit and invalid. Show the
        // source rather than a blank gap so nothing appears to vanish.
        const code = blocks[index]?.code ?? "";
        return `<pre class="fl-diagram-pending"><code>${escapeHtml(code)}</code></pre>`;
      }

      return `<figure class="fl-diagram" data-diagram-index="${index}" tabindex="0" role="img">${svg}</figure>`;
    });
  }, [html, diagrams, blocks]);

  /**
   * Finds the boxes that stand for notes, once they are drawn.
   *
   * After the paint rather than during it, because the SVG arrives through
   * `dangerouslySetInnerHTML` and there is no React element to hang this on.
   * Runs whenever the drawn diagrams change, which is also when a label could
   * have changed under a mark.
   */
  useEffect(() => {
    const container = containerRef.current;
    if (!container || diagramLinks.size === 0) return;

    for (const [index, links] of diagramLinks) {
      const figure = container.querySelector(`[data-diagram-index="${index}"]`);
      if (figure) markLinkedNodes(figure, links);
    }
  }, [finalHtml, diagramLinks]);

  // Diagram and wikilink clicks are both delegated from the container: the
  // HTML is injected raw, so there is no React element to attach a handler to.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handler = (event: MouseEvent) => {
      if (handleLinkClick(event, links)) return;

      // A box that stands for a note goes to the note, and does not also open
      // the diagram editor underneath it.
      const box = (event.target as HTMLElement).closest?.("[data-fl-note]");
      if (box && links) {
        event.preventDefault();
        event.stopPropagation();
        links.open(box.getAttribute("data-fl-note") ?? "", box.getAttribute("data-fl-anchor"));
        return;
      }

      if (!onDiagramClick) return;

      const figure = (event.target as HTMLElement).closest<HTMLElement>("[data-diagram-index]");
      if (!figure) return;

      const index = Number(figure.dataset.diagramIndex);
      const code = blocks[index]?.code;
      if (code !== undefined) onDiagramClick(code, index);
    };

    container.addEventListener("click", handler);
    return () => container.removeEventListener("click", handler);
  }, [blocks, onDiagramClick, links]);

  return (
    <div
      ref={containerRef}
      className={`fl-prose ${className ?? ""}`}
      // Safe: `markdownToHtml` sanitises the note content, and each SVG was
      // sanitised by the diagram renderer before being spliced in.
      dangerouslySetInnerHTML={{ __html: finalHtml }}
    />
  );
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
