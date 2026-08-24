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
      return { blob: await toDocx(note.content, options.title), filename };

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
  frame.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(frame);

  const doc = frame.contentDocument;
  if (!doc) {
    frame.remove();
    throw new Error("Could not open a print frame");
  }

  doc.open();
  doc.write(html);
  doc.close();

  await new Promise<void>((resolve) => {
    // Wait for fonts and inline SVGs to settle, or the first page prints blank.
    if (doc.readyState === "complete") resolve();
    else frame.onload = () => resolve();
  });

  // And for the images to decode. They are `data:` URLs so nothing is
  // fetched, but decoding is still asynchronous — printing before it finishes
  // produces a PDF with gaps where the pictures should be, which is the exact
  // failure this export is meant to have stopped having.
  await Promise.all(
    Array.from(doc.images).map((image) =>
      image.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            image.addEventListener("load", () => resolve(), { once: true });
            image.addEventListener("error", () => resolve(), { once: true });
          }),
    ),
  );
  await new Promise((r) => setTimeout(r, 150));

  frame.contentWindow?.focus();
  frame.contentWindow?.print();

  // The print dialog is modal but not awaitable; remove the frame afterwards.
  setTimeout(() => frame.remove(), 60_000);
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
  resolveImage?: ImageResolver,
): Promise<ExportResult> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();

  for (const note of notes) {
    const title = (note.frontmatter.title as string) ?? note.path;
    const result = await exportNote(note, { ...options, format, title }, resolveImage);
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
