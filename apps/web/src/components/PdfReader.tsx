"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createCitation,
  displayTitle,
  serializeCitation,
  flattenOutline,
  outlineEntryForPage,
  type PdfCitation,
  type PdfSearchHit,
} from "@forkleaf/pdf";
import type { PdfReaderState } from "@/hooks/usePdfReader";
import { PdfPage, type PdfHighlight } from "@/components/PdfPage";

/**
 * The reader.
 *
 * A PDF in ForkLeaf is not an attachment and not a preview — it is a *source*,
 * sitting beside the note being written from it. Everything about this
 * component follows from that. The most prominent action on a selection is
 * "Cite into note", not "copy"; the search results say which page and show the
 * sentence; and a document opened from a citation arrives with that passage
 * already highlighted, because the reason it was opened was to look at that
 * passage.
 *
 * What it is not: an editor. ForkLeaf will not annotate, sign, fill in or
 * re-save a PDF. The repository holds the file exactly as it was committed,
 * and everything ForkLeaf adds lives in markdown next to it — which is the
 * only form in which those additions are still readable in ten years, by
 * something other than ForkLeaf.
 */

export interface PdfReaderProps {
  reader: PdfReaderState;
  /** Opens the reader on a particular passage, from a link in a note. */
  initialCitation?: PdfCitation | null;
  /**
   * Puts a cited passage into the note being written.
   *
   * Absent when there is no note open, in which case the reader offers to copy
   * the markdown to the clipboard instead — the same text, one paste away,
   * rather than a disabled button with no explanation.
   */
  onCite?: (citation: PdfCitation, quote: boolean) => void;
  onClose: () => void;
}

const ZOOM_STEPS = [0.5, 0.67, 0.8, 1, 1.25, 1.5, 2, 3];

export function PdfReader({ reader, initialCitation, onCite, onClose }: PdfReaderProps) {
  const { status, info, source, session, outline, pages, indexing, error } = reader;

  const scrollRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [fitWidth, setFitWidth] = useState(true);
  const [current, setCurrent] = useState(1);
  const [visible, setVisible] = useState<ReadonlySet<number>>(new Set([1]));
  const [panel, setPanel] = useState<"outline" | "search" | null>(null);
  const [query, setQuery] = useState("");
  /**
   * Which search result the reader is on, and which query it belongs to.
   *
   * Stored together rather than resetting the index from an effect when the
   * query changes. An effect would render once showing result 4 of the *old*
   * search against the new results — which for a query with three matches is a
   * moment of "4 of 3" — and then render again having fixed it.
   */
  const [hit, setHit] = useState({ query: "", index: 0 });
  const [selection, setSelection] = useState<{ page: number; start: number; end: number } | null>(
    null,
  );
  const [copied, setCopied] = useState(false);

  const title = useMemo(
    () => (info ? displayTitle(info.metadata, source?.name ?? "") : (source?.name ?? "PDF")),
    [info, source],
  );

  const pageText = useCallback(
    (page: number) => pages.find((candidate) => candidate.page === page) ?? null,
    [pages],
  );

  // ─── Fit to width ─────────────────────────────────────────────────────────

  /**
   * Recomputed on resize rather than set once.
   *
   * A reader who opens the file tree, or turns their tablet, expects the page
   * to still fit. Kept as a mode rather than a one-off calculation so that
   * zooming by hand switches it off and stays off — a viewer that silently
   * undoes the zoom you just chose the next time the window moves is worse
   * than one that never fitted at all.
   */
  useEffect(() => {
    const container = scrollRef.current;
    if (!container || !fitWidth || !info || info.sizes.length === 0) return;

    const fit = () => {
      const widest = Math.max(...info.sizes.map((size) => size.width));
      // The gutter keeps the page off the scrollbar and off the panel edge.
      const available = container.clientWidth - 48;
      if (widest > 0 && available > 0) setScale(available / widest);
    };

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(container);
    return () => observer.disconnect();
  }, [fitWidth, info]);

  // ─── Which pages are worth drawing ────────────────────────────────────────

  /**
   * Tracks the pages near the viewport, and which one the reader is on.
   *
   * `rootMargin` is a full viewport in each direction, so the next page is
   * already drawn by the time it is scrolled to. Without it, every page turn
   * is a flash of blank paper followed by the page appearing — which reads as
   * the app being slow even when the render itself takes 30 milliseconds.
   */
  useEffect(() => {
    const container = scrollRef.current;
    if (!container || status !== "ready") return;

    const observer = new IntersectionObserver(
      (entries) => {
        setVisible((previous) => {
          const next = new Set(previous);
          for (const entry of entries) {
            const page = Number((entry.target as HTMLElement).dataset.pdfPage);
            if (entry.isIntersecting) next.add(page);
            else next.delete(page);
          }
          return next;
        });

        // The page the reader is *on* is the topmost one actually on screen,
        // which is not the same as the topmost one being drawn.
        const onScreen = entries
          .filter((entry) => entry.intersectionRatio > 0.1)
          .map((entry) => Number((entry.target as HTMLElement).dataset.pdfPage));
        if (onScreen.length > 0) setCurrent(Math.min(...onScreen));
      },
      { root: container, rootMargin: "100% 0px", threshold: [0, 0.1] },
    );

    for (const element of container.querySelectorAll("[data-pdf-page]")) {
      observer.observe(element);
    }
    return () => observer.disconnect();
  }, [status, info]);

  const goToPage = useCallback((page: number) => {
    const container = scrollRef.current;
    const target = container?.querySelector<HTMLElement>(`[data-pdf-page="${page}"]`);
    if (!container || !target) return;

    container.scrollTo({ top: target.offsetTop - 16, behavior: "smooth" });
    setCurrent(page);
  }, []);

  // ─── Search ───────────────────────────────────────────────────────────────

  const hits = useMemo<PdfSearchHit[]>(
    () => (query.trim().length < 2 ? [] : reader.search(query)),
    [query, reader],
  );

  const hitIndex = hit.query === query ? hit.index : 0;

  const goToHit = useCallback(
    (index: number) => {
      const found = hits[index];
      if (!found) return;
      setHit({ query, index });
      goToPage(found.page);
    },
    [hits, query, goToPage],
  );

  // ─── The passage a link asked for ─────────────────────────────────────────

  /**
   * Resolves the citation the reader was opened with, once the text is in.
   *
   * Not on open: the text extraction that a citation needs finishes after the
   * document does, and blocking the first page on it would make every cited
   * link feel slow to open. So the page hint is honoured immediately and the
   * exact passage is found and highlighted a moment later, which is invisible
   * for a short document and honest for a long one.
   */
  const located = useMemo(() => {
    if (!initialCitation || pages.length === 0) return null;

    const match = reader.locate(initialCitation);
    return match?.page && match.range
      ? { page: match.page, range: match.range, quality: match.quality }
      : null;
  }, [initialCitation, pages, reader]);

  /**
   * Scrolls to the citation, when the document is ready to be scrolled.
   *
   * Separate from working out *where* the passage is, which is derived above.
   * This half really is a side effect on something outside React — the scroll
   * position of a container.
   *
   * It happens at most twice per citation: once to the page the link names, as
   * soon as the document opens, and once more to wherever the passage actually
   * turned out to be after the text was read. The key is what stops a third —
   * without it, every change to the search results scrolls the reader back to
   * where it came in, which makes searching a cited document impossible.
   */
  const jumped = useRef("");

  useEffect(() => {
    if (!initialCitation || status !== "ready") return;

    const key = `${serializeCitation(initialCitation)}|${located ? "found" : "hint"}`;
    if (jumped.current === key) return;
    jumped.current = key;

    goToPage(located ? located.page : initialCitation.page);
  }, [initialCitation, status, located, goToPage]);

  // ─── Citing ───────────────────────────────────────────────────────────────

  const onSelect = useCallback((page: number, start: number, end: number) => {
    setSelection({ page, start, end });
    setCopied(false);
  }, []);

  const citationFor = useCallback((): PdfCitation | null => {
    if (!selection) return null;
    const text = pageText(selection.page);
    return text ? createCitation(text, selection.start, selection.end) : null;
  }, [selection, pageText]);

  const cite = useCallback(
    (withQuote: boolean) => {
      const citation = citationFor();
      if (!citation) return;

      onCite?.(citation, withQuote);
      setSelection(null);
      window.getSelection()?.removeAllRanges();
    },
    [citationFor, onCite],
  );

  // ─── Keyboard ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (selection) {
          setSelection(null);
          return;
        }
        onClose();
        return;
      }

      // Not while somebody is typing in the search box.
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return;

      if ((event.metaKey || event.ctrlKey) && event.key === "f") {
        event.preventDefault();
        setPanel("search");
        return;
      }
      if (event.key === "PageDown" || event.key === "ArrowRight") goToPage(current + 1);
      if (event.key === "PageUp" || event.key === "ArrowLeft") goToPage(Math.max(1, current - 1));
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, goToPage, onClose, selection]);

  const zoomBy = useCallback((direction: -1 | 1) => {
    setFitWidth(false);
    setScale((previous) => {
      const index = ZOOM_STEPS.findIndex((step) => step > previous + 0.001);
      const at = direction === 1 ? index : (index === -1 ? ZOOM_STEPS.length : index) - 1;
      return ZOOM_STEPS[Math.min(Math.max(at, 0), ZOOM_STEPS.length - 1)] ?? previous;
    });
  }, []);

  const section = useMemo(
    () => (outline.length > 0 ? outlineEntryForPage(outline, current) : null),
    [outline, current],
  );

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <section
      aria-label={`Reading ${title}`}
      className="flex h-full min-h-0 flex-col bg-[var(--fl-elevated)]"
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-[var(--fl-border)] bg-[var(--fl-surface)] px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-[var(--fl-text)]" title={title}>
            {title}
          </p>
          <p className="truncate text-xs text-[var(--fl-muted)]">
            {info ? `${info.pageCount} page${info.pageCount === 1 ? "" : "s"}` : "Opening…"}
            {section ? ` · ${section.title}` : ""}
            {indexing ? " · reading text…" : ""}
          </p>
        </div>

        {status === "ready" && info ? (
          <>
            <PageJump current={current} total={info.pageCount} onGo={goToPage} />

            <div className="flex items-center gap-px">
              <ToolButton label="Zoom out" onClick={() => zoomBy(-1)}>
                −
              </ToolButton>
              <ToolButton
                label={fitWidth ? "Zoom to 100%" : "Fit to width"}
                onClick={() => {
                  if (fitWidth) {
                    setFitWidth(false);
                    setScale(1);
                  } else {
                    setFitWidth(true);
                  }
                }}
              >
                {fitWidth ? "Fit" : `${Math.round(scale * 100)}%`}
              </ToolButton>
              <ToolButton label="Zoom in" onClick={() => zoomBy(1)}>
                +
              </ToolButton>
            </div>

            <ToolButton
              label="Find in document"
              pressed={panel === "search"}
              onClick={() => setPanel(panel === "search" ? null : "search")}
            >
              Find
            </ToolButton>
            {outline.length > 0 ? (
              <ToolButton
                label="Contents"
                pressed={panel === "outline"}
                onClick={() => setPanel(panel === "outline" ? null : "outline")}
              >
                Contents
              </ToolButton>
            ) : null}
          </>
        ) : null}

        <ToolButton label="Close the reader" onClick={onClose}>
          Close
        </ToolButton>
      </header>

      <div className="flex min-h-0 flex-1">
        {panel ? (
          <aside className="w-64 shrink-0 overflow-y-auto border-r border-[var(--fl-border)] bg-[var(--fl-surface)] p-2">
            {panel === "outline" ? (
              <Outline outline={outline} current={current} onGo={goToPage} />
            ) : (
              <Search
                query={query}
                onQuery={setQuery}
                hits={hits}
                index={hitIndex}
                onGo={goToHit}
                ready={pages.length > 0}
                indexing={indexing}
              />
            )}
          </aside>
        ) : null}

        <div ref={scrollRef} className="relative min-w-0 flex-1 overflow-auto p-4">
          {status === "loading" ? <Notice>Opening the document…</Notice> : null}
          {status === "password" ? (
            <Notice tone="warn">
              {error ?? "This PDF is protected by a password."}
              <br />
              ForkLeaf cannot open password-protected documents.
            </Notice>
          ) : null}
          {status === "error" ? <Notice tone="danger">{error}</Notice> : null}

          {status === "ready" && info && session ? (
            <div className="flex flex-col items-center gap-4">
              {info.sizes.map((size, index) => {
                const page = index + 1;
                return (
                  <PdfPage
                    key={page}
                    session={session}
                    page={page}
                    size={size}
                    scale={scale}
                    text={pageText(page)}
                    visible={visible.has(page)}
                    highlights={highlightsFor(page, located, hits, hitIndex)}
                    onSelect={onSelect}
                  />
                );
              })}
            </div>
          ) : null}

          {selection ? (
            <CiteBar
              canCite={Boolean(onCite)}
              copied={copied}
              onCite={cite}
              onCopy={async () => {
                const text = pageText(selection.page)?.text.slice(selection.start, selection.end);
                if (!text) return;
                await navigator.clipboard.writeText(text.replace(/\s+/g, " ").trim());
                setCopied(true);
              }}
              onDismiss={() => setSelection(null)}
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}

/** The highlights a page should show, from the citation and the search. */
function highlightsFor(
  page: number,
  located: { page: number; range: [number, number] } | null,
  hits: readonly PdfSearchHit[],
  hitIndex: number,
): PdfHighlight[] {
  const highlights: PdfHighlight[] = [];

  if (located?.page === page) {
    highlights.push({ range: located.range, kind: "citation" });
  }

  hits.forEach((hit, index) => {
    if (hit.page === page) {
      highlights.push({ range: hit.range, kind: "search", current: index === hitIndex });
    }
  });

  return highlights;
}

/**
 * The action bar over a selection.
 *
 * Pinned to the bottom of the reader rather than floating beside the
 * selection. A floating bar has to be positioned from the selection's
 * rectangle, which on a multi-line selection near a page edge means it
 * covers either the start or the end of what was just selected — and the one
 * thing this bar must not hide is the passage the reader is deciding whether
 * to cite.
 */
function CiteBar({
  canCite,
  copied,
  onCite,
  onCopy,
  onDismiss,
}: {
  canCite: boolean;
  copied: boolean;
  onCite: (withQuote: boolean) => void;
  onCopy: () => void | Promise<void>;
  onDismiss: () => void;
}) {
  return (
    <div className="pointer-events-none sticky bottom-2 z-10 flex justify-center">
      <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-[var(--fl-border-strong)] bg-[var(--fl-surface)] px-1.5 py-1 shadow-[var(--fl-shadow-lg)]">
        {canCite ? (
          <>
            <BarButton onClick={() => onCite(true)}>Quote into note</BarButton>
            <BarButton onClick={() => onCite(false)}>Reference only</BarButton>
          </>
        ) : (
          <span className="px-2 text-xs text-[var(--fl-muted)]">Open a note to cite into it</span>
        )}
        <BarButton onClick={() => void onCopy()}>{copied ? "Copied" : "Copy"}</BarButton>
        <BarButton onClick={onDismiss} aria-label="Dismiss">
          ×
        </BarButton>
      </div>
    </div>
  );
}

function Outline({
  outline,
  current,
  onGo,
}: {
  outline: Parameters<typeof flattenOutline>[0];
  current: number;
  onGo: (page: number) => void;
}) {
  const rows = useMemo(() => flattenOutline(outline), [outline]);
  const here = useMemo(() => outlineEntryForPage(outline, current)?.key, [outline, current]);

  return (
    <nav aria-label="Contents" className="flex flex-col">
      {rows.map((row) => (
        <button
          key={row.key}
          type="button"
          disabled={row.page == null}
          onClick={() => row.page != null && onGo(row.page)}
          className={`flex items-baseline gap-2 rounded px-2 py-1 text-left text-xs hover:bg-[var(--fl-elevated)] disabled:cursor-default disabled:opacity-50 ${
            row.key === here ? "bg-[var(--fl-accent-soft)] text-[var(--fl-text)]" : ""
          }`}
          style={{ paddingLeft: 8 + row.depth * 12 }}
        >
          <span className="min-w-0 flex-1 truncate">{row.title}</span>
          {row.page != null ? (
            <span className="shrink-0 tabular-nums text-[var(--fl-muted)]">{row.page}</span>
          ) : null}
        </button>
      ))}
    </nav>
  );
}

function Search({
  query,
  onQuery,
  hits,
  index,
  onGo,
  ready,
  indexing,
}: {
  query: string;
  onQuery: (value: string) => void;
  hits: readonly PdfSearchHit[];
  index: number;
  onGo: (index: number) => void;
  ready: boolean;
  indexing: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <input
        type="search"
        value={query}
        data-autofocus
        onChange={(event) => onQuery(event.target.value)}
        placeholder="Find in document"
        aria-label="Find in document"
        className="w-full rounded border border-[var(--fl-border)] bg-[var(--fl-bg)] px-2 py-1 text-sm text-[var(--fl-text)]"
      />

      <p className="px-1 text-xs text-[var(--fl-muted)]">
        {indexing
          ? "Reading the document's text…"
          : !ready
            ? "This document has no text to search — it is probably a scan."
            : query.trim().length < 2
              ? "Type at least two characters."
              : `${hits.length} match${hits.length === 1 ? "" : "es"}`}
      </p>

      {hits.map((hit, at) => (
        <button
          key={`${hit.page}-${hit.range[0]}`}
          type="button"
          onClick={() => onGo(at)}
          className={`rounded px-2 py-1 text-left text-xs hover:bg-[var(--fl-elevated)] ${
            at === index ? "bg-[var(--fl-accent-soft)]" : ""
          }`}
        >
          <span className="block text-[var(--fl-muted)]">Page {hit.page}</span>
          <span className="block text-[var(--fl-text)]">
            {hit.snippet.slice(0, hit.snippetRange[0])}
            <mark className="bg-[var(--fl-hl-yellow)] text-[var(--fl-text)]">
              {hit.snippet.slice(...hit.snippetRange)}
            </mark>
            {hit.snippet.slice(hit.snippetRange[1])}
          </span>
        </button>
      ))}
    </div>
  );
}

function PageJump({
  current,
  total,
  onGo,
}: {
  current: number;
  total: number;
  onGo: (page: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <form
      className="flex items-center gap-1 text-xs text-[var(--fl-muted)]"
      onSubmit={(event) => {
        event.preventDefault();
        const page = Number(draft);
        if (Number.isInteger(page) && page >= 1 && page <= total) onGo(page);
        setDraft(null);
      }}
    >
      <input
        aria-label="Page number"
        // Uncontrolled while being typed in, so that clearing the box to type
        // a new number does not snap it back to the page being scrolled past.
        value={draft ?? String(current)}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => setDraft(null)}
        inputMode="numeric"
        className="w-12 rounded border border-[var(--fl-border)] bg-[var(--fl-bg)] px-1 py-0.5 text-center tabular-nums text-[var(--fl-text)]"
      />
      <span>of {total}</span>
    </form>
  );
}

function ToolButton({
  label,
  children,
  onClick,
  pressed,
}: {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={`rounded px-2 py-1 text-xs text-[var(--fl-text)] hover:bg-[var(--fl-elevated)] ${
        pressed ? "bg-[var(--fl-accent-soft)]" : ""
      }`}
    >
      {children}
    </button>
  );
}

function BarButton({ children, onClick, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      onClick={onClick}
      {...rest}
      className="rounded-full px-3 py-1 text-xs text-[var(--fl-text)] hover:bg-[var(--fl-elevated)]"
    >
      {children}
    </button>
  );
}

function Notice({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: "muted" | "warn" | "danger";
}) {
  const colour =
    tone === "danger" ? "var(--fl-danger)" : tone === "warn" ? "var(--fl-warn)" : "var(--fl-muted)";

  return (
    <p
      role={tone === "muted" ? undefined : "alert"}
      className="p-8 text-sm"
      style={{ color: colour }}
    >
      {children}
    </p>
  );
}
