"use client";

import { useEffect, useRef } from "react";
import { rectsForRange, type PdfPageText, type PdfSession } from "@forkleaf/pdf";

/**
 * One page of a PDF: the pixels, the words, and anything highlighted on it.
 *
 * Three layers, stacked, and each one is there for a reason the others cannot
 * cover:
 *
 *   1. **A canvas**, because that is the only way to draw a PDF faithfully.
 *   2. **A transparent text layer** of positioned spans, because a canvas
 *      cannot be selected, searched with the browser's own find, or read by a
 *      screen reader. This is how every serious web PDF viewer works, and it
 *      is what makes "select a sentence and cite it" possible at all.
 *   3. **A highlight layer**, drawn from character ranges rather than from
 *      coordinates — so a highlight is a *fact about the text* and survives
 *      zooming, re-rendering and the page being re-laid out.
 *
 * The page only draws when it is near the viewport. A three-hundred-page
 * document is three hundred canvases, and rendering them all costs more memory
 * than the tab has; keeping them within a screen or two of the reader is the
 * difference between a viewer that opens a thesis and one that crashes on it.
 */

export interface PdfHighlight {
  /** Character range in this page's text. */
  range: [number, number];
  /** `citation` is the passage a link points at; `search` is a find result. */
  kind: "citation" | "search";
  /** The one the reader is currently on, drawn more strongly. */
  current?: boolean;
}

export interface PdfPageProps {
  session: PdfSession;
  page: number;
  /** Page size in PDF points, before zoom. */
  size: { width: number; height: number };
  scale: number;
  text: PdfPageText | null;
  highlights: readonly PdfHighlight[];
  /** True when this page is close enough to the viewport to be worth drawing. */
  visible: boolean;
  onSelect?: (page: number, start: number, end: number) => void;
}

export function PdfPage({
  session,
  page,
  size,
  scale,
  text,
  highlights,
  visible,
  onSelect,
}: PdfPageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  /**
   * Draws the page, at the device's real pixel density.
   *
   * Without the device-pixel-ratio factor the canvas is drawn at CSS pixels
   * and then scaled up by the browser, which on any modern display makes the
   * text visibly soft — the single most common way a canvas-based PDF viewer
   * looks worse than the operating system's.
   *
   * Nothing waits for the draw to finish. An earlier version faded the canvas
   * in when `renderPage` resolved, which looked better and was wrong: pdf.js
   * renders incrementally through `requestAnimationFrame`, and a tab that is
   * not visible does not get animation frames — so in a background tab the
   * promise never settles, and a page that had painted perfectly stayed hidden
   * behind an opacity of zero until the tab was looked at. The page frame is
   * already white paper with a shadow, so an undrawn page reads as a page not
   * yet reached, which is exactly what it is.
   */
  useEffect(() => {
    if (!visible) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const density = Math.min(window.devicePixelRatio || 1, 2);

    void session.renderPage(page, canvas, scale * density).catch((problem: unknown) => {
      // A page that will not render is one page; the rest of the document is
      // still readable. Said out loud in development, because the failure is
      // otherwise completely silent.
      if (process.env.NODE_ENV !== "production") {
        console.warn(`[forkleaf] PDF page ${page} did not render:`, problem);
      }
    });
  }, [session, page, scale, visible]);

  const width = size.width * scale;
  const height = size.height * scale;

  return (
    <div
      data-pdf-page={page}
      className="relative mx-auto bg-white shadow-[var(--fl-shadow)]"
      style={{ width, height }}
    >
      <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 h-full w-full" />

      {/* Highlights sit under the text layer so selection still works over them. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        {highlights.flatMap((highlight, index) =>
          text
            ? rectsForRange(text, highlight.range[0], highlight.range[1]).map((rect, part) => (
                <div
                  key={`${index}-${part}`}
                  className="absolute rounded-[2px]"
                  style={{
                    left: rect.x * scale,
                    // PDF measures from the bottom of the page; the DOM does not.
                    top: height - (rect.y + rect.height) * scale,
                    width: rect.width * scale,
                    height: rect.height * scale,
                    background:
                      highlight.kind === "citation"
                        ? "var(--fl-hl-yellow)"
                        : highlight.current
                          ? "var(--fl-hl-pink)"
                          : "var(--fl-hl-blue)",
                  }}
                />
              ))
            : [],
        )}
      </div>

      {text ? (
        <TextLayer page={page} text={text} scale={scale} height={height} onSelect={onSelect} />
      ) : null}
    </div>
  );
}

/**
 * The invisible words over the page.
 *
 * Each run of text becomes a span positioned where the PDF drew it, with the
 * glyphs made transparent. The reader sees the canvas; the browser sees text.
 *
 * The width is matched with `transform: scaleX`, not by choosing a font size
 * that happens to fit. The page was set in a typeface the browser does not
 * have, so no available font will ever have the same advance widths — and if
 * the span is wider or narrower than the glyphs beneath it, the selection
 * highlight drifts away from the words being selected, a little more with
 * every line. Stretching a span of known width onto the run's known width is
 * exact regardless of which font actually renders.
 */
function TextLayer({
  page,
  text,
  scale,
  height,
  onSelect,
}: {
  page: number;
  text: PdfPageText;
  scale: number;
  height: number;
  onSelect?: (page: number, start: number, end: number) => void;
}) {
  const layerRef = useRef<HTMLDivElement>(null);

  /**
   * Turns a DOM selection back into a character range in the page's text.
   *
   * Every span carries the offset it starts at, so the sum of that and the
   * offset within the span is the offset in the page — which is the whole
   * reason the spans are built from `runs` rather than from pdf.js's own text
   * layer. A citation has to name characters in the same string the resolver
   * searches, and two independently-assembled strings will not agree.
   */
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer || !onSelect) return;

    const handle = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;

      const range = selection.getRangeAt(0);
      if (!layer.contains(range.commonAncestorContainer)) return;

      const start = offsetOf(layer, range.startContainer, range.startOffset);
      const end = offsetOf(layer, range.endContainer, range.endOffset);
      if (start == null || end == null || start === end) return;

      onSelect(page, Math.min(start, end), Math.max(start, end));
    };

    document.addEventListener("selectionchange", handle);
    return () => document.removeEventListener("selectionchange", handle);
  }, [page, onSelect]);

  return (
    <div
      ref={layerRef}
      className="absolute inset-0 select-text"
      style={{ color: "transparent", lineHeight: 1 }}
    >
      {text.runs.map((run, index) => {
        const content = text.text.slice(run.start, run.end);
        if (!content.trim()) return null;

        return (
          <span
            key={index}
            data-run-start={run.start}
            className="absolute origin-top-left whitespace-pre"
            style={{
              left: run.x * scale,
              top: height - (run.y + run.height) * scale,
              fontSize: Math.max(run.height * scale, 1),
              fontFamily: "serif",
              // Measured after layout by the effect below would be more exact
              // still; this is within a pixel and costs no reflow.
              transform: `scaleX(${run.width > 0 ? (run.width * scale) / Math.max(measure(content, run.height * scale), 0.01) : 1})`,
            }}
          >
            {content}
          </span>
        );
      })}
    </div>
  );
}

/**
 * A rough advance width for a string at a font size.
 *
 * Deliberately an estimate. Measuring each run properly means a canvas
 * `measureText` per run per zoom level, which on a dense page is thousands of
 * calls on every scroll — and the only thing the number affects is how closely
 * an invisible box hugs the glyphs under it. Half an em per character is
 * within a few per cent for prose, which is close enough that a selection
 * lands on the words the reader dragged across.
 */
function measure(content: string, fontSize: number): number {
  return content.length * fontSize * 0.5;
}

/** The page-text offset a DOM position corresponds to, or null if outside. */
function offsetOf(layer: HTMLElement, node: Node, offset: number): number | null {
  const element = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as HTMLElement);
  const span = element?.closest<HTMLElement>("[data-run-start]");
  if (!span || !layer.contains(span)) return null;

  const base = Number(span.dataset.runStart);
  return Number.isFinite(base) ? base + offset : null;
}
