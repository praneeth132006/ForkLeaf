"use client";

import { useCallback, useState } from "react";
import { formatSource, isCapturable, type CapturedSource } from "@forkleaf/markdown-engine";
import { capturePage, type CaptureResult } from "@/lib/gateway";
import { Dialog } from "./Dialog";

/**
 * Capturing a page, with the result shown before it is written down.
 *
 * This was a bare text prompt: paste a URL, press enter, and a citation
 * appeared at the end of the note with no indication of what had been found —
 * whether the title was read or guessed from the address, whether an archived
 * copy exists, or how old that copy is. All three change what the citation is
 * worth, and all three were invisible until you went looking in the note.
 *
 * So the capture happens first and is shown, and inserting it is a separate
 * decision. The honest failure — a page with no snapshot — is stated plainly
 * here rather than discovered later.
 */

export interface CaptureDialogProps {
  /** Appends the finished citation to the note. */
  onInsert: (markdown: string) => Promise<void> | void;
  onClose: () => void;
}

export function CaptureDialog({ onInsert, onClose }: CaptureDialogProps) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<CaptureResult | null>(null);

  const capture = useCallback(async () => {
    const trimmed = url.trim();

    if (!isCapturable(trimmed)) {
      setError("That is not a web address — it needs to start with http:// or https://.");
      return;
    }

    setBusy(true);
    setError(null);
    setFound(null);

    try {
      setFound(await capturePage(trimmed));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That page could not be captured.");
    } finally {
      setBusy(false);
    }
  }, [url]);

  const insert = useCallback(async () => {
    if (!found) return;
    await onInsert(formatSource(found as CapturedSource));
    onClose();
  }, [found, onInsert, onClose]);

  return (
    <Dialog
      title="Capture a web page"
      subtitle="Its address, when you read it, and a copy that outlives it"
      onClose={onClose}
    >
      <div className="space-y-3">
        <div className="flex gap-2">
          <input
            autoFocus
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void capture();
              }
            }}
            placeholder="https://example.com/the-article"
            aria-label="Address to capture"
            className="min-w-0 flex-1 rounded-lg border border-[var(--fl-border)] bg-[var(--fl-surface)] px-3 py-2 text-[13px] text-[var(--fl-text)] outline-none focus:border-[var(--fl-accent)]"
          />
          <button
            type="button"
            onClick={() => void capture()}
            disabled={busy || url.trim() === ""}
            className="fl-btn shrink-0 disabled:opacity-40"
          >
            {busy ? "Reading…" : "Capture"}
          </button>
        </div>

        {error && <p className="text-[13px] text-[var(--fl-danger)]">{error}</p>}

        {found && (
          <div className="space-y-2 rounded-lg border border-[var(--fl-border)] bg-[var(--fl-elevated)] p-3">
            <p className="text-[13px] font-medium text-[var(--fl-text)]">{found.title}</p>
            <p className="truncate font-mono text-[11.5px] text-[var(--fl-muted)]">{found.url}</p>

            {/* All three of these change what the citation is worth, and all
                three used to be invisible until you looked in the note. */}
            {found.titleFromUrl && (
              <p className="text-[12px] text-[var(--fl-muted)]">
                The page itself could not be read, so its address stands in for a title.
              </p>
            )}

            <p className="text-[12px] text-[var(--fl-muted)]">
              {found.archiveUrl ? (
                <>
                  An archived copy exists
                  {found.archivedAt
                    ? ` from ${new Date(found.archivedAt).toLocaleDateString()}`
                    : ""}
                  . It will still be readable if this page disappears.
                </>
              ) : (
                <>
                  The Wayback Machine has no snapshot of this page. The citation will say so — this
                  link may not outlive the page.
                </>
              )}
            </p>

            <div className="flex justify-end pt-1">
              <button type="button" onClick={() => void insert()} className="fl-btn fl-btn-primary">
                Add to this note
              </button>
            </div>
          </div>
        )}

        {!found && !busy && (
          <p className="text-[11.5px] leading-snug text-[var(--fl-muted)]">
            The address, the time you read it, and a link to an archived copy are written into the
            note as an ordinary blockquote, and committed with it like any other edit.
          </p>
        )}
      </div>
    </Dialog>
  );
}
