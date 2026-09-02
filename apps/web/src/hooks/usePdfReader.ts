"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  PdfOpenError,
  openPdf,
  resolveCitation,
  searchPdf,
  type PdfCitation,
  type PdfCitationMatch,
  type PdfDocumentInfo,
  type PdfOutlineItem,
  type PdfPageText,
  type PdfSearchHit,
  type PdfSession,
} from "@forkleaf/pdf";
import { fetchRepoPdf, type PdfSource } from "@/lib/pdf-source";
import type { Workspace } from "@forkleaf/types";

/**
 * Opening a PDF, and keeping it open.
 *
 * The state machine is small and the lifetime rules are not, which is why this
 * is a hook rather than three `useState`s in the component:
 *
 *   - A document owns a worker. Failing to destroy it leaks one per document
 *     opened, and a reading session is a dozen documents.
 *   - Opening is several awaits long, and the reader can be pointed at another
 *     document part way through any of them. Every step therefore checks that
 *     it is still the current request before writing anything, or a slow first
 *     document overwrites a fast second one — the classic race, and the one
 *     that shows the wrong paper.
 *   - Text extraction is the expensive part and is *not* on the critical path
 *     to showing page one. It runs behind the first render, because a reader
 *     who wants to look at page one should not wait for page nine hundred.
 */

export type PdfStatus = "idle" | "loading" | "ready" | "error" | "password";

export interface PdfReaderState {
  status: PdfStatus;
  source: PdfSource | null;
  session: PdfSession | null;
  info: PdfDocumentInfo | null;
  outline: PdfOutlineItem[];
  /** Page text, filled in behind the first render. Empty until extraction runs. */
  pages: PdfPageText[];
  /**
   * True when a document carries no text of its own — a scan.
   *
   * Only meaningful once the reading has finished: until then "no text yet"
   * and "no text at all" look identical, and telling somebody their paper is a
   * photograph while it is still being read would be wrong about half the
   * documents that ever open.
   */
  scanned: boolean;
  /** True when the words on screen came from a file rather than the document. */
  textSupplied: boolean;
  /**
   * Hands the reader the words of a document that has none.
   *
   * For a scan whose text has been recognised elsewhere and committed beside
   * it. Ignored when the document has its own text: a file beside a paper must
   * never quietly replace what the paper actually says.
   */
  supplyText: (pages: readonly { page: number; text: string }[]) => void;
  /** True while text extraction is still running. */
  indexing: boolean;
  error: string | null;
  /** Opens a document, replacing whatever is open. */
  open: (source: PdfSource, password?: string) => void;
  close: () => void;
  /** Finds a phrase. Empty until the text has been extracted. */
  search: (query: string) => PdfSearchHit[];
  /** Locates a citation in the document that is open. */
  locate: (citation: PdfCitation) => PdfCitationMatch | null;
}

/** Where the copied pdf.js fonts and character maps are served from. */
const ASSETS_URL = "/pdfjs";

export function usePdfReader(workspace: Workspace | null): PdfReaderState {
  const [status, setStatus] = useState<PdfStatus>("idle");
  const [source, setSource] = useState<PdfSource | null>(null);
  const [session, setSession] = useState<PdfSession | null>(null);
  const [info, setInfo] = useState<PdfDocumentInfo | null>(null);
  const [outline, setOutline] = useState<PdfOutlineItem[]>([]);
  const [extracted, setExtracted] = useState<PdfPageText[]>([]);
  const [supplied, setSupplied] = useState<PdfPageText[]>([]);
  const [indexing, setIndexing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Which open request is current.
   *
   * A counter rather than comparing sources: opening the same document twice
   * — which is what retrying with a password is — must still invalidate the
   * first attempt, and two equal sources cannot tell those apart.
   */
  const request = useRef(0);
  const live = useRef<PdfSession | null>(null);
  const extraction = useRef<AbortController | null>(null);

  /** Tears down whatever is open. Safe to call when nothing is. */
  const teardown = useCallback(() => {
    extraction.current?.abort();
    extraction.current = null;

    const open = live.current;
    live.current = null;
    // Not awaited: nothing downstream depends on the worker having stopped,
    // and making every caller async to wait for a teardown would spread
    // through the whole component.
    void open?.destroy().catch(() => {});
  }, []);

  const workspaceRef = useRef(workspace);
  useEffect(() => {
    workspaceRef.current = workspace;
  });

  const open = useCallback(
    (next: PdfSource, password?: string) => {
      const ticket = (request.current += 1);
      teardown();

      setSource(next);
      setStatus("loading");
      setError(null);
      setInfo(null);
      setOutline([]);
      setExtracted([]);
      setSupplied([]);

      void (async () => {
        try {
          const bytes =
            next.kind === "local"
              ? next.bytes
              : await fetchRepoPdf(requireWorkspace(workspaceRef.current), next.path);

          if (ticket !== request.current) return;

          const opened = await openPdf(bytes, { password, assetsUrl: ASSETS_URL });

          // The document finished opening after the reader moved on. Nothing
          // will ever show it, so it has to be destroyed here or its worker
          // outlives the tab's usefulness.
          if (ticket !== request.current) {
            void opened.destroy().catch(() => {});
            return;
          }

          live.current = opened;
          setSession(opened);
          setInfo(opened.info);
          setStatus("ready");

          void opened
            .outline()
            .then((items) => {
              if (ticket === request.current) setOutline(items);
            })
            .catch(() => {
              // A document with a broken outline is still a readable document.
            });

          extractText(opened, ticket);
        } catch (problem) {
          if (ticket !== request.current) return;

          if (problem instanceof PdfOpenError && problem.reason === "password") {
            setStatus("password");
            setError(problem.message);
            return;
          }

          setStatus("error");
          setError(problem instanceof Error ? problem.message : "That PDF could not be opened.");
        }
      })();

      /** Reads every page's text behind the first render. */
      function extractText(opened: PdfSession, ticket: number) {
        const controller = new AbortController();
        extraction.current = controller;
        setIndexing(true);

        void opened
          .allText({ signal: controller.signal })
          .then((read) => {
            if (ticket === request.current) setExtracted(read);
          })
          .catch(() => {
            // Aborted, or a document whose text cannot be read — a pure scan
            // with no text layer, most often. The pages still render; search
            // and citation simply have nothing to work with, which the reader
            // says in words rather than by appearing broken.
          })
          .finally(() => {
            if (ticket === request.current) setIndexing(false);
          });
      }
    },
    [teardown],
  );

  const close = useCallback(() => {
    request.current += 1;
    teardown();

    setSession(null);
    setSource(null);
    setInfo(null);
    setOutline([]);
    setExtracted([]);
    setSupplied([]);
    setIndexing(false);
    setError(null);
    setStatus("idle");
  }, [teardown]);

  // The worker outlives React unless something stops it.
  useEffect(() => teardown, [teardown]);

  /**
   * What the reader has to work with: the document's own words, or the ones
   * supplied for it.
   *
   * The document always wins. A supplied file is for a document that has
   * nothing to say for itself, and letting it override a paper that does would
   * make searching and citation quietly answer from the wrong text.
   */
  const pages = extracted.length > 0 ? extracted : supplied;

  const supplyText = useCallback((given: readonly { page: number; text: string }[]) => {
    setSupplied(
      given
        .filter((page) => page.text.trim() !== "")
        .map((page) => ({ page: page.page, text: page.text, runs: [] })),
    );
  }, []);

  const search = useCallback(
    (query: string) => (pages.length === 0 ? [] : searchPdf(pages, query)),
    [pages],
  );

  const locate = useCallback(
    (citation: PdfCitation) => (pages.length === 0 ? null : resolveCitation(pages, citation)),
    [pages],
  );

  return {
    status,
    source,
    session,
    info,
    outline,
    pages,
    // A document that has been read and had nothing to give is a photograph
    // of a page. Before the reading finishes, nobody can say that.
    scanned: status === "ready" && !indexing && extracted.length === 0,
    textSupplied: extracted.length === 0 && supplied.length > 0,
    supplyText,
    indexing,
    error,
    open,
    close,
    search,
    locate,
  };
}

function requireWorkspace(workspace: Workspace | null): Workspace {
  if (!workspace) {
    throw new Error("Connect a repository before opening a PDF stored in one.");
  }
  return workspace;
}
