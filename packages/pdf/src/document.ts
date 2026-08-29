import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  PDFPageProxy,
} from "pdfjs-dist/types/src/display/api";
import { readMetadata } from "./metadata";
import { buildOutline, type RawOutlineItem } from "./outline";
import { assemblePageText, type RawTextItem } from "./text";
import type { PdfDocumentInfo, PdfOutlineItem, PdfPageSize, PdfPageText } from "./types";

/**
 * The one file in this package that talks to pdf.js.
 *
 * Everything else here is pure functions over plain data, which is what makes
 * the interesting behaviour — citation anchoring, search, outline navigation —
 * testable without a rendering engine or a real PDF. This module is the seam:
 * it turns a document into that plain data and hands back a handle for the one
 * thing that genuinely needs the engine, which is drawing pixels.
 *
 * ## Why pdf.js and not the browser's own viewer
 *
 * Every browser can display a PDF in an `<iframe>` or `<embed>`, in three
 * lines. ForkLeaf cannot use it, for two reasons that both matter:
 *
 *   - The editor's Content Security Policy sets `object-src 'none'` and allows
 *     exactly one frame origin. Relaxing either to show a document would widen
 *     the policy that protects a page which renders markdown from repositories
 *     the user does not control.
 *   - The built-in viewer is a black box. It cannot be asked what text is on
 *     page 12, cannot report a selection, and cannot be told to highlight a
 *     range — so citations, search across the document, and quoting into a
 *     note are all impossible with it. Those are the entire point.
 *
 * ## Worker, and staying inside the policy
 *
 * pdf.js parses in a worker, which the policy already allows (`worker-src
 * 'self' blob:`). The worker is created here rather than at module scope so
 * importing this file on the server does not reach for `Worker`.
 *
 * `useWasm: false` is the one deliberate capability given up. pdf.js 6 uses
 * WebAssembly for JPEG 2000 images and colour management, and instantiating
 * wasm under CSP needs `'wasm-unsafe-eval'` in `script-src`. That would mean
 * widening the policy that guards the route which renders markdown from
 * repositories the user does not control — to improve the rendering of an
 * image format that appears in a small minority of scanned documents. The
 * trade is not close: the policy stays as it is, and a JPEG 2000 image inside
 * a PDF renders blank rather than the whole editor's defences being relaxed.
 * Text, fonts, vector graphics and every common image format are unaffected.
 */

/** A live document. Not serialisable, and not meant to outlive its viewer. */
export interface PdfSession {
  readonly info: PdfDocumentInfo;
  /** The document's table of contents, resolved to page numbers. */
  outline(): Promise<PdfOutlineItem[]>;
  /** One page's text, extracted once and remembered. */
  textOf(page: number): Promise<PdfPageText>;
  /**
   * Every page's text, in order.
   *
   * Reports progress because on a long document this is seconds, not
   * milliseconds, and a reader staring at a spinner with no idea whether it is
   * a moment or a minute will close the tab.
   */
  allText(options?: {
    signal?: AbortSignal;
    onProgress?: (done: number, total: number) => void;
  }): Promise<PdfPageText[]>;
  /** Draws a page into a canvas at `scale`, and resolves when it is on screen. */
  renderPage(page: number, canvas: HTMLCanvasElement, scale: number): Promise<void>;
  /** Releases the document and its worker. */
  destroy(): Promise<void>;
}

export interface OpenPdfOptions {
  /** A password, for a document that asked for one. */
  password?: string;
  /**
   * Where pdf.js can fetch the fourteen standard fonts and the CJK character
   * maps it does not embed.
   *
   * Without them, a document that relies on a non-embedded font renders as
   * boxes or as the wrong typeface, and a Japanese document extracts no text
   * at all. Passed in rather than hardcoded because only the app knows where
   * it serves its static files from.
   */
  assetsUrl?: string;
}

/** Raised when the file is not a PDF, or is one ForkLeaf cannot open. */
export class PdfOpenError extends Error {
  constructor(
    message: string,
    /** `password` means the caller should ask for one and try again. */
    readonly reason: "password" | "corrupt" | "unknown",
  ) {
    super(message);
    this.name = "PdfOpenError";
  }
}

/**
 * Opens a PDF from its bytes.
 *
 * The bytes are copied first. pdf.js transfers the buffer it is given to the
 * worker, which *detaches* it — the caller's `Uint8Array` becomes zero-length
 * the instant the document opens. That is a genuinely baffling bug to meet
 * from the outside ("the file I just read is empty"), and it happens exactly
 * when the same bytes are needed twice, such as opening a document and also
 * saving it to the repository.
 */
export async function openPdf(
  bytes: ArrayBuffer | Uint8Array,
  options: OpenPdfOptions = {},
): Promise<PdfSession> {
  const pdfjs = await import("pdfjs-dist");
  ensureWorker(pdfjs);

  const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const copy = new Uint8Array(source.length);
  copy.set(source);

  const assets = options.assetsUrl ? withSlash(options.assetsUrl) : undefined;

  let loading: PDFDocumentLoadingTask;
  let document: PDFDocumentProxy;
  try {
    loading = pdfjs.getDocument({
      data: copy,
      password: options.password,
      // See the note above: wasm would need a wider CSP than this app has.
      useWasm: false,
      ...(assets
        ? {
            standardFontDataUrl: `${assets}standard_fonts/`,
            cMapUrl: `${assets}cmaps/`,
            cMapPacked: true,
          }
        : {}),
    });
    document = await loading.promise;
  } catch (error) {
    throw asOpenError(error);
  }

  return createSession(loading, document, options.password != null);
}

function withSlash(url: string): string {
  return url.endsWith("/") ? url : `${url}/`;
}

/**
 * Points pdf.js at its worker, once per page load.
 *
 * `workerPort` with a bundler-resolved URL rather than `workerSrc` with a CDN
 * path: the policy is `worker-src 'self'`, and a notes app that quietly loads
 * a megabyte of parser from someone else's server is not one whose privacy
 * claims mean anything.
 */
let workerStarted = false;

function ensureWorker(pdfjs: { GlobalWorkerOptions: { workerPort: Worker | null } }): void {
  if (workerStarted || typeof Worker === "undefined") return;

  pdfjs.GlobalWorkerOptions.workerPort = new Worker(
    new URL("pdfjs-dist/build/pdf.worker.mjs", import.meta.url),
    { type: "module" },
  );
  workerStarted = true;
}

/** Turns pdf.js's exceptions into something a user interface can act on. */
function asOpenError(error: unknown): PdfOpenError {
  const name = (error as { name?: string } | null)?.name ?? "";
  const message = (error as { message?: string } | null)?.message ?? "";

  if (name === "PasswordException") {
    return new PdfOpenError("This PDF is protected by a password.", "password");
  }
  if (name === "InvalidPDFException" || /invalid pdf/i.test(message)) {
    return new PdfOpenError("That file is not a PDF, or is damaged.", "corrupt");
  }
  return new PdfOpenError(message || "That PDF could not be opened.", "unknown");
}

async function createSession(
  loading: PDFDocumentLoadingTask,
  document: PDFDocumentProxy,
  encrypted: boolean,
): Promise<PdfSession> {
  const texts = new Map<number, Promise<PdfPageText>>();
  const pages = new Map<number, Promise<PDFPageProxy>>();
  /** The render task in flight per canvas, so a redraw can cancel the last. */
  const rendering = new WeakMap<HTMLCanvasElement, { cancel(): void }>();
  /**
   * Which draw currently owns each canvas.
   *
   * A counter, and not merely the task above, because a draw is not atomic:
   * it has to `await getPage` before it has a task to record. Two draws
   * starting inside that window — which is every zoom, and every effect React
   * runs twice in development — both get past the cancellation, both create a
   * task, and pdf.js refuses the second with "cannot use the same canvas
   * during multiple render operations". The symptom is a page that paints and
   * then reports failure, so the viewer leaves it hidden: a blank page, no
   * error, nothing in the console.
   *
   * Claiming a number synchronously, before the await, gives every draw a way
   * to find out on the other side that it has been superseded.
   */
  const owner = new WeakMap<HTMLCanvasElement, number>();

  let outlineCache: Promise<PdfOutlineItem[]> | null = null;

  const pageAt = (number: number): Promise<PDFPageProxy> => {
    let existing = pages.get(number);
    if (!existing) {
      existing = document.getPage(number);
      pages.set(number, existing);
    }
    return existing;
  };

  const info: PdfDocumentInfo = {
    pageCount: document.numPages,
    metadata: readMetadata(
      ((await document.getMetadata().catch(() => null))?.info ?? null) as never,
    ),
    sizes: await readPageSizes(document, pageAt),
    encrypted,
  };

  const textOf = (number: number): Promise<PdfPageText> => {
    let existing = texts.get(number);
    if (!existing) {
      existing = pageAt(number)
        .then((page) => page.getTextContent())
        .then((content) => assemblePageText(number, content.items as RawTextItem[]));
      texts.set(number, existing);
    }
    return existing;
  };

  return {
    info,
    textOf,

    outline() {
      outlineCache ??= document.getOutline().then((items: RawOutlineItem[] | null) =>
        buildOutline((items ?? []) as RawOutlineItem[], async (destination) => {
          const resolved =
            typeof destination === "string"
              ? await document.getDestination(destination)
              : (destination as unknown[] | null);
          if (!resolved || resolved.length === 0) return null;

          const index = await document.getPageIndex(resolved[0] as never);
          return index + 1;
        }),
      );
      return outlineCache;
    },

    async allText({ signal, onProgress } = {}) {
      const total = document.numPages;
      const collected: PdfPageText[] = [];

      for (let number = 1; number <= total; number += 1) {
        // Checked between pages rather than not at all: extracting a 900-page
        // document should stop when the reader closes it, not finish first.
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
        collected.push(await textOf(number));
        onProgress?.(number, total);
      }

      return collected;
    },

    async renderPage(number, canvas, scale) {
      // A page can be asked to redraw while the last draw is still going —
      // zooming twice quickly is the ordinary case. Two render tasks writing
      // to one canvas is a pdf.js error and a half-drawn page; cancelling the
      // first is what the library expects.
      const claim = (owner.get(canvas) ?? 0) + 1;
      owner.set(canvas, claim);
      rendering.get(canvas)?.cancel();

      const page = await pageAt(number);
      // Superseded while the page was being fetched. Everything from here to
      // `page.render` below is synchronous, so passing this check really does
      // mean this draw is the only one about to touch the canvas.
      if (owner.get(canvas) !== claim) return;

      rendering.get(canvas)?.cancel();

      const viewport = page.getViewport({ scale });

      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));

      // `canvas` alone, never alongside `canvasContext`. pdf.js 6 treats the
      // two as alternatives — the context form is the backwards-compatible one
      // and requires `canvas` to be null — and given both it starts a render
      // whose promise never settles. The page paints and then hangs, so a
      // viewer that waits for the promise before revealing the canvas shows a
      // blank page for ever, with nothing thrown and nothing logged.
      const task = page.render({ canvas, viewport });
      rendering.set(canvas, task);

      try {
        await task.promise;
      } catch (error) {
        // A cancelled render is the expected outcome of zooming, not a fault.
        if ((error as { name?: string })?.name !== "RenderingCancelledException") throw error;
      } finally {
        if (rendering.get(canvas) === task) rendering.delete(canvas);
      }
    },

    async destroy() {
      texts.clear();
      pages.clear();
      // The loading task owns the worker, not the document proxy — destroying
      // the proxy alone leaves the worker running for the life of the tab, and
      // a reader who opens twenty documents in a session ends up with twenty
      // of them.
      await loading.destroy();
    },
  };
}

/**
 * Every page's dimensions, which the viewer needs before it draws anything.
 *
 * The scroll has to be the right length from the first frame — a scrollbar
 * that grows as pages arrive makes a long document impossible to navigate,
 * because the place you were dragging towards keeps moving.
 *
 * Fetched in batches rather than one at a time. `getPage` is a round trip to
 * the worker, and nine hundred of them in series is a visible pause before the
 * document appears; nine hundred at once floods the worker's message queue and
 * is slower again. Thirty-two in flight is neither.
 */
async function readPageSizes(
  document: PDFDocumentProxy,
  pageAt: (number: number) => Promise<PDFPageProxy>,
): Promise<PdfPageSize[]> {
  const BATCH = 32;
  const sizes: PdfPageSize[] = [];

  for (let first = 1; first <= document.numPages; first += BATCH) {
    const last = Math.min(first + BATCH - 1, document.numPages);
    const numbers = [];
    for (let number = first; number <= last; number += 1) numbers.push(number);

    const batch = await Promise.all(
      numbers.map(async (number) => {
        const page = await pageAt(number);
        const viewport = page.getViewport({ scale: 1 });
        return { width: viewport.width, height: viewport.height, rotation: page.rotate ?? 0 };
      }),
    );

    sizes.push(...batch);
  }

  return sizes;
}
