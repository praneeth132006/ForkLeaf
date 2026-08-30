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
import { ColumnResizer } from "@/components/ColumnResizer";
import { useColumnWidth } from "@/hooks/useColumnWidth";

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
  /**
   * What the two citing actions are called.
   *
   * The panel beside a note puts the passage *into* the note; the standalone
   * tab has no note to reach and copies it to the clipboard instead. Same
   * action, two truthful descriptions of it — and a button that said "Quote
   * into note" in a window with no note would be lying about what it does.
   */
  citeLabels?: { quote: string; reference: string };
  /** Why citing is unavailable, when it is. Shown in place of the buttons. */
  noCiteReason?: string | null;
  /**
   * Closes the reader. Null in the standalone window, where there is nothing
   * to close back to — the browser's own tab control is the close button, and
   * offering a second one that does nothing is worse than offering none.
   */
  onClose: (() => void) | null;
  /**
   * Opens this document in a tab of its own.
   *
   * Absent for a document that has no address — one opened from the user's
   * disk, which a second tab could not load, since the bytes live only in this
   * window's memory.
   */
  onOpenInTab?: (() => void) | null;
  /**
   * Commits this document into the repository, so it can be linked to.
   *
   * Absent when there is nowhere to put it. `saveHint` explains why, in words,
   * rather than leaving a disabled button with nothing to say for itself.
   */
  onSave?: (() => void) | null;
  saveHint?: string | null;
  saving?: boolean;
  /**
   * How much room the reader has, and therefore where the contents list goes.
   *
   * `"panel"` is the reader sharing a window with a note: the contents slide
   * over the page and go away again, because a column of headings taken out of
   * an already-halved window leaves nothing to read.
   *
   * `"document"` is the reader *being* the window — the case this was built
   * for, since a PDF is not a note and there is no reason to keep an empty
   * editor beside one. There the contents are pinned open on the right, where
   * every reader has looked for them since Acrobat, and the seam between them
   * and the page can be dragged.
   */
  layout?: "panel" | "document";
}

/** Where the docked contents list may be dragged to, and where it starts. */
const INDEX_WIDTH = { key: "forkleaf:width:pdf-index", start: 288, min: 200, max: 520 };

const ZOOM_STEPS = [0.5, 0.67, 0.8, 1, 1.25, 1.5, 2, 3];

/**
 * The width to fit the document to.
 *
 * The most common page width, not the widest. A book with one fold-out map in
 * it has 417 pages of one size and a single page of another, and fitting to
 * the widest shrinks every ordinary page to make room for a page the reader
 * may never reach. The odd page simply overflows and can be scrolled to, which
 * is what a reader expects of a fold-out.
 */
function typicalPageWidth(sizes: readonly { width: number }[]): number {
  const counts = new Map<number, number>();
  for (const size of sizes) {
    // Rounded, because a document generated page by page can differ by a
    // fraction of a point between otherwise identical pages.
    const width = Math.round(size.width);
    counts.set(width, (counts.get(width) ?? 0) + 1);
  }

  let best = 0;
  let seen = 0;
  for (const [width, count] of counts) {
    if (count > seen) {
      seen = count;
      best = width;
    }
  }

  return best;
}

export function PdfReader({
  reader,
  initialCitation,
  onCite,
  citeLabels = { quote: "Quote into note", reference: "Reference only" },
  noCiteReason = "Open a note to cite into it",
  onClose,
  onOpenInTab,
  onSave,
  saveHint,
  saving = false,
  layout = "panel",
}: PdfReaderProps) {
  const { status, info, source, session, outline, pages, indexing, error } = reader;

  const frameRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  /**
   * Whether the reader is too narrow to give a panel a column of its own.
   *
   * Measured from the reader itself rather than the window, because the same
   * component is both a full-width tab and a panel beside a note — and it is
   * the space it actually has that decides the layout, not the size of the
   * screen it is on. Docking a 16rem contents list inside a 26rem panel left
   * about a hundred and sixty pixels for the page, which is not a width
   * anybody can read a book at.
   */
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    const measure = () => setCompact(frame.clientWidth < 720);
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);
  const [scale, setScale] = useState(1);
  const [fitWidth, setFitWidth] = useState(true);
  const [current, setCurrent] = useState(1);
  const [visible, setVisible] = useState<ReadonlySet<number>>(new Set([1]));
  const [panel, setPanel] = useState<"outline" | "search" | null>(
    // Reading a document full width, the contents are part of the furniture
    // and start open. Beside a note they start out of the way.
    layout === "document" ? "outline" : null,
  );
  const [indexWidth, setIndexWidth, resetIndexWidth] = useColumnWidth(
    INDEX_WIDTH.key,
    INDEX_WIDTH.start,
    INDEX_WIDTH.min,
    INDEX_WIDTH.max,
  );
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

    const width = typicalPageWidth(info.sizes);

    const fit = () => {
      // The gutter keeps the page off the scrollbar and off the panel edge,
      // and is smaller when there is less room to give away.
      const gutter = container.clientWidth < 520 ? 16 : 48;
      const available = container.clientWidth - gutter;
      if (width > 0 && available > 0) setScale(available / width);
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
        // Escape backs out of the innermost thing first: a selection, then a
        // panel, then the reader itself. In the standalone window there is no
        // reader to close, so Escape simply stops there rather than doing
        // something surprising to the tab.
        if (selection) {
          setSelection(null);
          return;
        }
        if (panel) {
          setPanel(null);
          return;
        }
        onClose?.();
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
  }, [current, goToPage, onClose, panel, selection]);

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

  /** Whether the contents sit beside the page rather than sliding over it. */
  const docked = layout === "document" && !compact;

  // One definition, rendered in whichever of the two places the contents are
  // living. Two copies would be two components, both mounted, racing to be the
  // one whose "go to page 12" the scroll container hears.
  const panelBody =
    panel === "outline" ? (
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
    );

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <section
      ref={frameRef}
      aria-label={`Reading ${title}`}
      className="flex h-full min-h-0 flex-col bg-[var(--fl-elevated)]"
    >
      {/* Wraps rather than scrolls or clips. The reader is a full window in
          one place and a panel beside a note in another, so the header has no
          fixed width to design against — and the previous single row put
          "Close" past the right edge the moment the panel was narrower than
          about 700 pixels. */}
      <header className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-[var(--fl-border)] bg-[var(--fl-surface)] px-3 py-2">
        <div className="min-w-0 flex-1 basis-48">
          <p className="truncate text-sm font-medium text-[var(--fl-text)]" title={title}>
            {title}
          </p>
          <p className="truncate text-xs text-[var(--fl-muted)]">
            {info ? `${info.pageCount} page${info.pageCount === 1 ? "" : "s"}` : "Opening…"}
            {section ? ` · ${section.title}` : ""}
            {indexing ? " · reading text…" : ""}
          </p>
        </div>

        <div className="flex items-center gap-x-1 gap-y-1">
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

              {onOpenInTab ? (
                <ToolButton label="Open this document in its own tab" onClick={onOpenInTab}>
                  Open in tab
                </ToolButton>
              ) : null}

              {onSave ? (
                <ToolButton
                  label="Keep this PDF in your notebook, so notes can link to it"
                  onClick={onSave}
                >
                  {saving ? "Saving…" : "Save to notebook"}
                </ToolButton>
              ) : null}
            </>
          ) : null}

          {onClose ? (
            <ToolButton label="Close the reader" onClick={onClose}>
              Close
            </ToolButton>
          ) : null}
        </div>
      </header>

      {saveHint ? (
        <p className="shrink-0 border-b border-[var(--fl-border)] bg-[var(--fl-surface)] px-3 py-1.5 text-xs text-[var(--fl-muted)]">
          {saveHint}
        </p>
      ) : null}

      {/* `relative` so a panel can overlay the pages when there is no room to
          sit beside them. */}
      <div className="relative flex min-h-0 flex-1">
        {panel && !docked ? (
          <aside
            className={
              compact
                ? "absolute inset-y-0 left-0 z-20 w-[min(17rem,80%)] overflow-y-auto border-r border-[var(--fl-border)] bg-[var(--fl-surface)] p-2 shadow-[var(--fl-shadow-lg)]"
                : "w-64 shrink-0 overflow-y-auto border-r border-[var(--fl-border)] bg-[var(--fl-surface)] p-2"
            }
          >
            {panelBody}
          </aside>
        ) : null}

        {/* Dismisses an overlaying panel by tapping the page beside it, which
            is what every drawer on a small screen does. */}
        {panel && compact ? (
          <button
            type="button"
            aria-label="Close panel"
            onClick={() => setPanel(null)}
            className="absolute inset-0 z-10 bg-black/30"
          />
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
              labels={citeLabels}
              reason={noCiteReason}
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

        {/* The contents, pinned to the right of the page.
            Only when the reader is the window and there is room for it —
            docking a 16rem list inside a 26rem panel leaves about a hundred
            and sixty pixels for the page, which is not a width anybody reads
            a book at, so in that case the same list slides over instead. */}
        {docked && panel ? (
          <>
            <ColumnResizer
              label="Contents"
              width={indexWidth}
              min={INDEX_WIDTH.min}
              max={INDEX_WIDTH.max}
              side="right"
              onChange={setIndexWidth}
              onReset={resetIndexWidth}
            />
            <aside
              aria-label="Contents and search"
              className="flex w-[var(--fl-col)] shrink-0 flex-col overflow-hidden border-l border-[var(--fl-border)] bg-[var(--fl-surface)]"
              style={{ "--fl-col": `${indexWidth}px` } as React.CSSProperties}
            >
              {/* Two tabs rather than two buttons in the toolbar. Docked, the
                  column is always showing one of them, so the question is
                  which — not whether. */}
              <div className="flex shrink-0 items-center gap-1 border-b border-[var(--fl-border)] px-2 py-1.5">
                <ToolButton
                  label="The document's own table of contents"
                  pressed={panel === "outline"}
                  onClick={() => setPanel("outline")}
                >
                  Contents
                </ToolButton>
                <ToolButton
                  label="Find in document"
                  pressed={panel === "search"}
                  onClick={() => setPanel("search")}
                >
                  Find
                </ToolButton>
                <span className="flex-1" />
                <ToolButton label="Hide the contents" onClick={() => setPanel(null)}>
                  Hide
                </ToolButton>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-2">{panelBody}</div>
            </aside>
          </>
        ) : null}
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
  labels,
  reason,
  copied,
  onCite,
  onCopy,
  onDismiss,
}: {
  canCite: boolean;
  labels: { quote: string; reference: string };
  reason: string | null;
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
            <BarButton onClick={() => onCite(true)}>{labels.quote}</BarButton>
            <BarButton onClick={() => onCite(false)}>{labels.reference}</BarButton>
          </>
        ) : reason ? (
          <span className="px-2 text-xs text-[var(--fl-muted)]">{reason}</span>
        ) : null}
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

  // Plenty of PDFs carry no table of contents at all — scans especially. The
  // list is pinned open when the reader is the window, so it has to say that
  // rather than be a blank column the reader is left to interpret.
  if (rows.length === 0) {
    return (
      <p className="px-2 py-1 text-xs text-[var(--fl-muted)]">
        This document has no contents list of its own. Find searches its text instead.
      </p>
    );
  }

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
