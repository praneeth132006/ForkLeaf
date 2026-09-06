"use client";

import { useEffect, useRef, useState } from "react";
import { openPdf, type PdfSession } from "@forkleaf/pdf";
import type { Workspace } from "@forkleaf/types";
import { PDFJS_ASSETS } from "@/lib/pdf-index";
import { fetchRepoPdf } from "@/lib/pdf-source";

/**
 * One page of a document, twice: as it was, and as it is.
 *
 * Comparing two versions already said *which* pages changed, which is the hard
 * half and the useful half — it is the sentence no other reading app can print,
 * because no other reading app has the old file. But "page 12 changed" still
 * leaves somebody opening two windows to find out *how*, and a person deciding
 * whether a citation survived a re-issue needs to see the paragraph, not its
 * page number.
 *
 * So: the two pages, beside each other, drawn from the two files.
 *
 * ## Two documents, two workers, and closing them
 *
 * Each version is a separate pdf.js document with a worker behind it. They are
 * opened when a page is asked for and destroyed when the comparison closes or
 * moves to a different pair — leaking one worker per page somebody looks at is
 * how a reader that started responsive ends up not being.
 *
 * The old version is fetched at a commit, which the file proxy accepts in place
 * of a branch: GitHub's contents API takes either, and a comparison is always
 * against a commit rather than a branch that has since moved.
 */

export interface DocumentPageCompareProps {
  workspace: Workspace;
  /** Repository-relative path to the document. */
  path: string;
  /** The commit holding the older version. */
  sha: string;
  /** The page to show, in the numbering of the version being read. */
  page: number;
  /** How the older version is described, usually a relative time. */
  beforeLabel: string;
  /** Only in the newer version, so there is nothing to put on the left. */
  addedPage?: boolean;
}

type Loaded = { before: PdfSession | null; after: PdfSession };

export function DocumentPageCompare({
  workspace,
  path,
  sha,
  page,
  beforeLabel,
  addedPage = false,
}: DocumentPageCompareProps) {
  const [sessions, setSessions] = useState<Loaded | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  /**
   * Opens both versions, and closes them again.
   *
   * Nothing resets the state on the way in, because nothing has to: the caller
   * gives this a key made of the page and the commit, so asking for a
   * different pair mounts a fresh one and unmounts this — which runs the
   * cleanup below and closes the two documents this one opened.
   */
  useEffect(() => {
    let live = true;
    // Held outside the promise so the cleanup can close whatever was opened,
    // including when the effect is torn down mid-fetch.
    let opened: PdfSession[] = [];

    const olderWorkspace: Workspace = { ...workspace, repo: { ...workspace.repo, branch: sha } };

    void (async () => {
      try {
        const [beforeBytes, afterBytes] = await Promise.all([
          addedPage ? Promise.resolve(null) : fetchRepoPdf(olderWorkspace, path),
          fetchRepoPdf(workspace, path),
        ]);

        const before = beforeBytes ? await openPdf(beforeBytes, { assetsUrl: PDFJS_ASSETS }) : null;
        const after = await openPdf(afterBytes, { assetsUrl: PDFJS_ASSETS });

        opened = before ? [before, after] : [after];

        // Torn down while the documents were opening: close them rather than
        // handing them to a component that is no longer on screen.
        if (!live) {
          await Promise.all(opened.map((session) => session.destroy().catch(() => {})));
          opened = [];
          return;
        }

        setSessions({ before, after });
      } catch (error: unknown) {
        if (!live) return;
        setProblem(
          error instanceof Error
            ? error.message
            : "Those two versions of this page could not both be drawn.",
        );
      }
    })();

    return () => {
      live = false;
      void Promise.all(opened.map((session) => session.destroy().catch(() => {})));
    };
  }, [workspace, path, sha, page, addedPage]);

  if (problem) {
    return (
      <p role="alert" className="mt-3 text-[12.5px] text-[var(--fl-danger)]">
        {problem}
      </p>
    );
  }

  if (!sessions) {
    return (
      <p aria-busy="true" className="mt-3 text-[12.5px] text-[var(--fl-muted)]">
        Drawing page {page} from both versions…
      </p>
    );
  }

  return (
    <div className="mt-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Side
          label={beforeLabel}
          session={sessions.before}
          page={page}
          missing="This page is not in that version — it was added later."
        />
        <Side label="Now" session={sessions.after} page={page} missing="" />
      </div>
    </div>
  );
}

function Side({
  label,
  session,
  page,
  missing,
}: {
  label: string;
  session: PdfSession | null;
  page: number;
  missing: string;
}) {
  return (
    <figure className="m-0 min-w-0">
      <figcaption className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--fl-muted)]">
        {label}
      </figcaption>

      {session ? (
        <PageCanvas session={session} page={page} />
      ) : (
        <p className="flex h-40 items-center justify-center rounded-lg border border-dashed border-[var(--fl-border)] px-4 text-center text-[12px] text-[var(--fl-muted)]">
          {missing}
        </p>
      )}
    </figure>
  );
}

/**
 * The pixels of one page, fitted to whatever width it is given.
 *
 * Drawn at the device's pixel density, for the same reason the reader does it:
 * a canvas drawn at CSS pixels and scaled up by the browser is visibly soft,
 * and two soft pages beside each other is a comparison of blurs.
 */
function PageCanvas({ session, page }: { session: PdfSession; page: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const holderRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const holder = holderRef.current;
    if (!canvas || !holder) return;

    let live = true;

    const draw = () => {
      // A page past the end of this version is not an error — a document can
      // lose pages — and there is nothing to draw for it.
      const size = session.info.sizes[page - 1];
      const width = holder.clientWidth;
      if (!size || width <= 0) return;

      const density = Math.min(window.devicePixelRatio || 1, 2);
      const scale = width / size.width;

      canvas.style.aspectRatio = `${size.width} / ${size.height}`;

      void session.renderPage(page, canvas, scale * density).catch(() => {
        // One page that will not draw is one page. The other side of the
        // comparison is still worth looking at, and the frame around an
        // undrawn canvas reads as a page that has not arrived.
      });
    };

    draw();

    // Refitted on resize, because this sits in a dialog that is one column on
    // a phone and two on a desktop — the same page at two very different
    // widths, and a canvas drawn for the wrong one is the blur again.
    const observer = new ResizeObserver(() => {
      if (live) draw();
    });
    observer.observe(holder);

    return () => {
      live = false;
      observer.disconnect();
    };
  }, [session, page]);

  const exists = session.info.sizes[page - 1] !== undefined;

  return (
    <div ref={holderRef} className="min-w-0">
      {exists ? (
        <canvas
          ref={canvasRef}
          aria-label={`Page ${page}`}
          className="block w-full rounded-lg border border-[var(--fl-border)] bg-white shadow-[var(--fl-shadow)]"
        />
      ) : (
        <p className="flex h-40 items-center justify-center rounded-lg border border-dashed border-[var(--fl-border)] px-4 text-center text-[12px] text-[var(--fl-muted)]">
          This version has no page {page}.
        </p>
      )}
    </div>
  );
}
