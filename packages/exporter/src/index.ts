import type { ExportFormat, ExportOptions, Note } from "@forkleaf/types";
import { serializeDocument, documentStats } from "@forkleaf/markdown-engine";
import { renderDiagram, toStandaloneSvg, LIGHT_THEME, DARK_THEME } from "@forkleaf/diagrams";
import { toHtml, type ImageResolver } from "./html";
import { toDocx } from "./docx";

export { toHtml, type ImageResolver } from "./html";
export { toDocx } from "./docx";

/**
 * Client-side export.
 *
 * Every format is produced in the browser: no upload, no server to pay for, no
 * queue, and the note never leaves the machine. PDF goes through the browser's
 * own print pipeline, which is the only way to get real PDF text (and selectable,
 * searchable output) without shipping a rendering engine.
 */

export interface ExportResult {
  blob: Blob;
  filename: string;
}

const MIME: Record<ExportFormat, string> = {
  md: "text/markdown;charset=utf-8",
  html: "text/html;charset=utf-8",
  txt: "text/plain;charset=utf-8",
  json: "application/json;charset=utf-8",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf",
};

export const EXPORT_FORMATS: {
  format: ExportFormat;
  label: string;
  description: string;
  extension: string;
}[] = [
  {
    format: "md",
    label: "Markdown",
    description: "The original source, with frontmatter",
    extension: "md",
  },
  {
    format: "pdf",
    label: "PDF",
    description: "Typeset for printing and sharing",
    extension: "pdf",
  },
  {
    format: "html",
    label: "HTML",
    description: "One self-contained file, diagrams included",
    extension: "html",
  },
  {
    format: "docx",
    label: "Word",
    description: "Editable .docx with real headings and lists",
    extension: "docx",
  },
  { format: "txt", label: "Plain text", description: "Formatting stripped away", extension: "txt" },
  {
    format: "json",
    label: "JSON",
    description: "Content, properties and statistics",
    extension: "json",
  },
];

export const DEFAULT_EXPORT_OPTIONS: Omit<ExportOptions, "title" | "format"> = {
  includeFrontmatter: true,
  renderDiagrams: true,
  theme: "light",
};

/**
 * Produces the export as a Blob. PDF is handled separately by `printToPdf`.
 *
 * `resolveImage` turns the note's relative image paths into `data:` URLs, so
 * an exported file carries its pictures instead of pointing at a location the
 * reader does not have. Only the app knows where the bytes live, so it is
 * passed in; without it the paths are left exactly as written.
 */
export async function exportNote(
  note: Note,
  options: ExportOptions,
  resolveImage?: ImageResolver,
): Promise<ExportResult> {
  const filename = `${safeFilename(options.title)}.${extensionFor(options.format)}`;

  switch (options.format) {
    case "md": {
      const text = options.includeFrontmatter
        ? serializeDocument(note.content, note.frontmatter)
        : note.content;
      return { blob: blob(text, "md"), filename };
    }

    case "html": {
      const html = await toHtml(note.content, note.frontmatter, options, resolveImage);
      return { blob: blob(html, "html"), filename };
    }

    case "txt":
      return { blob: blob(toPlainText(note.content), "txt"), filename };

    case "json": {
      const payload = {
        title: options.title,
        path: note.path,
        frontmatter: note.frontmatter,
        content: note.content,
        stats: documentStats(note.content),
        exportedAt: new Date().toISOString(),
      };
      return { blob: blob(JSON.stringify(payload, null, 2), "json"), filename };
    }

    case "docx":
      return { blob: await toDocx(note.content, options.title, resolveImage), filename };

    case "pdf": {
      // The caller should use printToPdf, which opens the print dialog. We
      // still return the HTML so a caller with its own pipeline can use it.
      const html = await toHtml(note.content, note.frontmatter, options, resolveImage);
      return { blob: blob(html, "html"), filename: filename.replace(/\.pdf$/, ".html") };
    }
  }
}

/**
 * Opens the browser's print dialog with the note laid out for paper.
 *
 * A hidden same-origin iframe is used rather than a popup: popups are commonly
 * blocked, and an iframe keeps the app's own UI out of the printed output.
 */
export async function printToPdf(
  note: Note,
  options: ExportOptions,
  resolveImage?: ImageResolver,
): Promise<void> {
  if (typeof document === "undefined") throw new Error("printToPdf requires a browser");

  const html = await toHtml(
    note.content,
    note.frontmatter,
    { ...options, format: "html" },
    resolveImage,
  );

  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.setAttribute("tabindex", "-1");
  /**
   * A page-sized frame, parked off screen.
   *
   * It used to be one pixel by one pixel, which is where the ruined layout in
   * every exported PDF came from: a document laid out in a 1px viewport has
   * nothing to wrap against, so tables collapsed, diagrams shrank to a sliver
   * and anything sized against the viewport came out wrong — and then that was
   * what got printed. Giving the frame the dimensions of a sheet of paper
   * costs nothing and lets the document lay itself out the way it will be
   * printed. It stays invisible, and out of the tab order.
   */
  frame.style.cssText = [
    "position:fixed",
    "left:-10000px",
    "top:0",
    "width:210mm",
    "height:297mm",
    "border:0",
    "opacity:0",
    "pointer-events:none",
    "z-index:-1",
  ].join(";");
  document.body.appendChild(frame);

  const doc = frame.contentDocument;
  if (!doc) {
    frame.remove();
    throw new Error("Could not open a print frame");
  }

  doc.open();
  doc.write(html);
  doc.close();

  try {
    await frameReady(doc, frame);
    await imagesReady(doc);
    await fontsReady(doc);
    // One more frame, so the last layout pass has run before the snapshot the
    // print dialog takes.
    await new Promise((resolve) => setTimeout(resolve, 150));

    frame.contentWindow?.focus();
    frame.contentWindow?.print();
  } finally {
    // The print dialog is modal but not awaitable; the frame has to outlive
    // this call or the dialog prints a document that no longer exists.
    setTimeout(() => frame.remove(), 60_000);
  }
}

/** Resolves once the written document has finished parsing. */
function frameReady(doc: Document, frame: HTMLIFrameElement): Promise<void> {
  if (doc.readyState === "complete") return Promise.resolve();

  return new Promise<void>((resolve) => {
    // `frame.onload` does not fire reliably for a document written with
    // `doc.write`, so both signals are watched and whichever arrives first
    // wins. The timeout is the third: printing a slightly early document beats
    // never opening the dialog at all.
    const fallback = setTimeout(resolve, 2000);
    const done = () => {
      clearTimeout(fallback);
      resolve();
    };

    frame.onload = done;
    doc.addEventListener("readystatechange", () => {
      if (doc.readyState === "complete") done();
    });
  });
}

/**
 * Resolves once every image has actually decoded.
 *
 * The pictures are `data:` URLs by the time they get here, so nothing is
 * fetched — but decoding is asynchronous, and a print that starts first
 * produces a PDF with holes in it. `decode()` is the exact signal; `load` is
 * the fallback for browsers that lack it.
 */
function imagesReady(doc: Document): Promise<unknown> {
  return Promise.all(
    Array.from(doc.images).map((image) => {
      if (typeof image.decode === "function") {
        // A broken image rejects, which must not fail the export: one missing
        // picture is a gap, a thrown error is no PDF at all.
        return image.decode().catch(() => undefined);
      }
      if (image.complete) return Promise.resolve();

      return new Promise<void>((resolve) => {
        const fallback = setTimeout(resolve, 3000);
        const done = () => {
          clearTimeout(fallback);
          resolve();
        };
        image.addEventListener("load", done, { once: true });
        image.addEventListener("error", done, { once: true });
      });
    }),
  );
}

/** Resolves once webfonts have loaded, so nothing reflows mid-print. */
function fontsReady(doc: Document): Promise<unknown> {
  const fonts = (doc as Document & { fonts?: { ready?: Promise<unknown> } }).fonts;
  if (!fonts?.ready) return Promise.resolve();

  // Capped: a font that never resolves must not hold the dialog shut.
  return Promise.race([fonts.ready, new Promise((resolve) => setTimeout(resolve, 2000))]);
}

/** Exports a single diagram as SVG or PNG. */
export async function exportDiagram(
  code: string,
  format: "svg" | "png",
  options: { theme?: "light" | "dark"; scale?: number; filename?: string } = {},
): Promise<ExportResult> {
  const palette = options.theme === "dark" ? DARK_THEME : LIGHT_THEME;
  const { svg, error } = await renderDiagram(code, palette);

  if (!svg) throw new Error(error?.message ?? "This diagram could not be rendered");

  const filename = `${safeFilename(options.filename ?? "diagram")}.${format}`;

  if (format === "svg") {
    return {
      blob: new Blob([toStandaloneSvg(svg)], { type: "image/svg+xml;charset=utf-8" }),
      filename,
    };
  }

  return { blob: await svgToPng(svg, options.scale ?? 2), filename };
}

/**
 * Rasterises SVG to PNG through a canvas.
 *
 * The SVG is loaded as a data URL rather than a blob URL because a blob URL
 * taints the canvas in some browsers, which makes toBlob throw.
 */
async function svgToPng(svg: string, scale: number): Promise<Blob> {
  if (typeof document === "undefined") throw new Error("PNG export requires a browser");

  const { width, height } = svgDimensions(svg);
  const encoded = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(toStandaloneSvg(svg))}`;

  const image = new Image();
  image.crossOrigin = "anonymous";

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Could not rasterise the diagram"));
    image.src = encoded;
  });

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(width * scale);
  canvas.height = Math.ceil(height * scale);

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable");

  // Without this the PNG has a transparent background, which looks broken when
  // pasted into most documents and chat apps.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error("PNG encoding failed"))),
      "image/png",
    );
  });
}

/** Reads intrinsic size from the SVG, falling back to a sane default. */
function svgDimensions(svg: string): { width: number; height: number } {
  const viewBox = /viewBox="([\d.\s-]+)"/.exec(svg);
  if (viewBox) {
    const parts = viewBox[1]!.trim().split(/\s+/).map(Number);
    if (parts.length === 4 && parts[2]! > 0 && parts[3]! > 0) {
      return { width: parts[2]!, height: parts[3]! };
    }
  }

  const width = /width="(\d+(?:\.\d+)?)/.exec(svg);
  const height = /height="(\d+(?:\.\d+)?)/.exec(svg);
  return {
    width: width ? Number(width[1]) : 800,
    height: height ? Number(height[1]) : 600,
  };
}

/** Bundles many notes into a single .zip, preserving their folder structure. */
export async function exportWorkspace(
  notes: Note[],
  format: Extract<ExportFormat, "md" | "html" | "txt">,
  options: Omit<ExportOptions, "format" | "title">,
  /**
   * How to find images, *for a given note*.
   *
   * A factory rather than one resolver, because a note refers to its images
   * relative to itself: `../assets/chart.png` means a different file depending
   * on which note it is written in. Handing the whole archive a single note's
   * resolver was quietly wrong for every other note in it.
   */
  resolveImageFor?: (note: Note) => ImageResolver | undefined,
): Promise<ExportResult> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();

  for (const note of notes) {
    const title = (note.frontmatter.title as string) ?? note.path;
    const result = await exportNote(note, { ...options, format, title }, resolveImageFor?.(note));
    // Keep the repo's folder layout so the archive mirrors what the user sees.
    const path = note.path.replace(/\.mdx?$/i, `.${extensionFor(format)}`);
    zip.file(path, result.blob);
  }

  return {
    blob: await zip.generateAsync({ type: "blob", compression: "DEFLATE" }),
    filename: "notes.zip",
  };
}

/** Triggers a download in the browser. */
export function downloadResult(result: ExportResult): void {
  if (typeof document === "undefined") return;

  const url = URL.createObjectURL(result.blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = result.filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  // Revoking immediately can cancel the download in Safari.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function blob(text: string, format: ExportFormat): Blob {
  return new Blob([text], { type: MIME[format] });
}

function extensionFor(format: ExportFormat): string {
  return EXPORT_FORMATS.find((f) => f.format === format)?.extension ?? format;
}

/** Strips markdown syntax, leaving readable prose. */
export function toPlainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```\w*\n?|```/g, ""))
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/^>\s?/gm, "")
    .replace(/^[-*+]\s+\[[ xX]\]\s+/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\s*\|.*\|\s*$/gm, (row) =>
      row
        .split("|")
        .map((c) => c.trim())
        .filter(Boolean)
        .join("\t"),
    )
    .replace(/^-{3,}$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function safeFilename(title: string): string {
  return (
    title
      .replace(/[^\p{L}\p{N} ._-]+/gu, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 80) || "note"
  );
}
