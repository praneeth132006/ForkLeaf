"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { displayTitle, parseCitation, type PdfCitation } from "@forkleaf/pdf";
import { usePdfReader } from "@/hooks/usePdfReader";
import { PdfReader } from "@/components/PdfReader";
import { repoSource, workspaceFromParams } from "@/lib/pdf-source";
import { quoteMarkdown } from "@/lib/pdf-quote";
import { useTheme } from "@/hooks/useTheme";

/**
 * One document, one window.
 *
 * A PDF in a side panel is a compromise: it is beside the note, which is the
 * point, and it is half the width of a laptop, which for a typeset A4 page is
 * not enough to read comfortably. So there are two ways to open one, and this
 * is the other — the whole window, nothing else competing for it.
 *
 * This window has no notebook behind it. It never opens IndexedDB, never syncs
 * and cannot write a note, because everything it needs is in its own URL and
 * the session cookie the proxy reads. That keeps it genuinely cheap to open
 * and means a second window is not a second database connection racing the
 * first — the mistake the diagram pop-out was careful to avoid too.
 */
export function ReaderWindow() {
  const params = useSearchParams();
  const [theme] = useTheme();

  const target = useMemo(
    () => workspaceFromParams(new URLSearchParams(params.toString())),
    [params],
  );

  const reader = usePdfReader(target?.workspace ?? null);

  /**
   * The passage the link asked for, from the fragment.
   *
   * `useSearchParams` cannot see a fragment — the browser never sends one to
   * the server, so Next does not have it either. It has to be read off
   * `location` on the client, which is also why this runs in an effect rather
   * than during render.
   */
  const citation = useMemo(() => {
    if (typeof window === "undefined") return null;
    return parseCitation(window.location.hash);
  }, []);

  useEffect(() => {
    if (!target) return;
    reader.open(repoSource(target.workspace, target.path));
    // Opening again on every render would reload the document forever; the
    // address is the only thing that should cause a reopen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.workspace.id, target?.path]);

  // The window is about one thing, so it may as well say which one.
  useEffect(() => {
    if (target) document.title = `${target.path.split("/").pop()} — ForkLeaf`;
  }, [target]);

  /**
   * Copies a cited passage as markdown, ready to paste into a note.
   *
   * This window has no notebook, so it cannot write the citation itself — but
   * a reader tab that could not get a quotation back to the note being written
   * would be a viewer, not part of a notes app. The clipboard is the bridge,
   * and what goes on it is the same markdown the panel would have inserted:
   * a blockquote and a link addressed by repository path, so it resolves in
   * whichever note it is pasted into.
   */
  const [copied, setCopied] = useState(false);

  const copyCitation = useCallback(
    (citation: PdfCitation, withQuote: boolean) => {
      if (!target) return;

      const markdown = quoteMarkdown({
        target: target.path,
        title: reader.info
          ? displayTitle(reader.info.metadata, target.path.split("/").pop() ?? "")
          : (target.path.split("/").pop() ?? "PDF"),
        citation,
        includeQuote: withQuote,
      });

      void navigator.clipboard.writeText(markdown).then(() => setCopied(true));
    },
    [target, reader.info],
  );

  // Clears the "Copied" state a moment later, so a second copy reads as one.
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  if (!target) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-2 bg-[var(--fl-bg)] px-6 text-center">
        <h1 className="text-lg font-medium text-[var(--fl-text)]">No document to open</h1>
        <p className="max-w-md text-sm text-[var(--fl-muted)]">
          This window opens a PDF from a connected repository, and the link it was given does not
          name one. Open the document from your notebook instead.
        </p>
        <a
          href="/editor"
          className="mt-2 rounded-lg border border-[var(--fl-border)] px-3 py-1.5 text-sm text-[var(--fl-text)] hover:bg-[var(--fl-elevated)]"
        >
          Back to the editor
        </a>
      </div>
    );
  }

  return (
    <div className="h-screen bg-[var(--fl-bg)]" data-theme={theme}>
      <PdfReader
        // This window is the document, so the contents belong beside the page
        // rather than behind a button.
        layout="document"
        reader={reader}
        initialCitation={citation}
        onCite={copyCitation}
        citeLabels={{
          quote: copied ? "Copied" : "Copy quotation",
          reference: copied ? "Copied" : "Copy reference",
        }}
        // Nothing to close back to: this window *is* the document. Closing it
        // is what the browser's own tab control is for.
        onClose={null}
      />
    </div>
  );
}
