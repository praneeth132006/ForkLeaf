"use client";

import React, { useEffect, useMemo, useState, useRef } from "react";
import { markdownToHtml, extractMermaidBlocks } from "@mdnotion/markdown-engine";
import { renderDiagram, LIGHT_THEME, DARK_THEME } from "@mdnotion/diagrams";
import { useDocumentTheme } from "./useDocumentTheme";

export interface PreviewProps {
  markdown: string;
  /** Omit to follow the app's current theme. */
  theme?: "light" | "dark";
  className?: string;
  /** Called when the user clicks a rendered diagram, to open it for editing. */
  onDiagramClick?: (code: string, index: number) => void;
}

/** Placeholder token swapped in for a diagram before sanitisation. */
const TOKEN = (index: number) => `MDNOTIONDIAGRAM${index}TOKEN`;

/**
 * Rendered markdown preview with live Mermaid diagrams.
 *
 * Diagrams are rendered separately from the markdown and spliced back in
 * afterwards. That ordering matters: the markdown sanitiser strips SVG (it has
 * to, because note content is untrusted), so the SVG has to arrive after
 * sanitisation — already sanitised by the diagram renderer itself.
 */
export function Preview({ markdown, theme, className, onDiagramClick }: PreviewProps) {
  const documentTheme = useDocumentTheme();
  const resolved = theme ?? documentTheme;
  const [diagrams, setDiagrams] = useState<Map<number, string>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);

  const blocks = useMemo(() => extractMermaidBlocks(markdown), [markdown]);

  // Markdown with each diagram replaced by a token, rendered and sanitised.
  const html = useMemo(() => {
    if (blocks.length === 0) return markdownToHtml(markdown);

    let source = "";
    let cursor = 0;
    blocks.forEach((block, index) => {
      source += markdown.slice(cursor, block.start);
      source += `\n\n${TOKEN(index)}\n\n`;
      cursor = block.end;
    });
    source += markdown.slice(cursor);

    return markdownToHtml(source);
  }, [markdown, blocks]);

  // Render diagrams off the critical path so typing never blocks on mermaid.
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const palette = resolved === "dark" ? DARK_THEME : LIGHT_THEME;
      const rendered = new Map<number, string>();

      for (const [index, block] of blocks.entries()) {
        const { svg } = await renderDiagram(block.code, palette);
        if (cancelled) return;
        if (svg) rendered.set(index, svg);
      }

      if (!cancelled) setDiagrams(rendered);
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [blocks, resolved]);

  // Swap the tokens for rendered SVG once both halves are ready.
  const finalHtml = useMemo(() => {
    if (blocks.length === 0) return html;

    return html.replace(/MDNOTIONDIAGRAM(\d+)TOKEN/g, (_match, raw: string) => {
      const index = Number(raw);
      const svg = diagrams.get(index);

      if (!svg) {
        // Still rendering, or the source is mid-edit and invalid. Show the
        // source rather than a blank gap so nothing appears to vanish.
        const code = blocks[index]?.code ?? "";
        return `<pre class="mdn-diagram-pending"><code>${escapeHtml(code)}</code></pre>`;
      }

      return `<figure class="mdn-diagram" data-diagram-index="${index}" tabindex="0" role="img">${svg}</figure>`;
    });
  }, [html, diagrams, blocks]);

  // Diagram clicks are delegated from the container: the SVG is injected as
  // raw HTML, so there is no React element to attach a handler to.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !onDiagramClick) return;

    const handler = (event: Event) => {
      const figure = (event.target as HTMLElement).closest<HTMLElement>("[data-diagram-index]");
      if (!figure) return;

      const index = Number(figure.dataset.diagramIndex);
      const code = blocks[index]?.code;
      if (code !== undefined) onDiagramClick(code, index);
    };

    container.addEventListener("click", handler);
    return () => container.removeEventListener("click", handler);
  }, [blocks, onDiagramClick]);

  return (
    <div
      ref={containerRef}
      className={`mdn-prose ${className ?? ""}`}
      // Safe: `markdownToHtml` sanitises the note content, and each SVG was
      // sanitised by the diagram renderer before being spliced in.
      dangerouslySetInnerHTML={{ __html: finalHtml }}
    />
  );
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
