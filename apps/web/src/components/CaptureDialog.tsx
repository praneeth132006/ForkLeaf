"use client";

import { useCallback, useRef, useState } from "react";
import { formatSource, isCapturable, type CapturedSource } from "@forkleaf/markdown-engine";
import { capturePage, ApiGatewayError, type CaptureResult } from "@/lib/gateway";
import { Dialog } from "./Dialog";

/**
 * Capturing a page, with what is happening said out loud while it happens.
 *
 * This was a text box and a button, and pressing the button did nothing
 * visible for up to a minute — because the slow half of a capture is asking
 * the Wayback Machine to archive a page it has never seen, and that was being
 * waited for before anything at all was shown. An honest answer that arrives
 * forty seconds later is indistinguishable, from the outside, from a feature
 * that does not work.
 *
 * So the two halves are asked for separately and each is shown as it lands:
 * the title in about a second, the archived copy whenever it arrives. Both are
 * named on screen while they are still outstanding, because "what is it doing"
 * is the question a spinner refuses to answer.
 *
 * What actually goes into the note is shown before it goes in, exactly as it
 * will be written, and inserting stays a separate press. A citation is a claim
 * about where something came from; nobody should have to go and look in the
 * note to find out what claim was made on their behalf.
 */

export interface CaptureDialogProps {
  /** Appends the finished citation to the note. */
  onInsert: (markdown: string) => Promise<void> | void;
  onClose: () => void;
}

/** What each half of the capture is doing. */
type Step = "idle" | "working" | "done" | "failed";

export function CaptureDialog({ onInsert, onClose }: CaptureDialogProps) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState<CaptureResult | null>(null);
  const [pageStep, setPageStep] = useState<Step>("idle");
  const [archive, setArchive] = useState<{ archiveUrl: string | null; archivedAt: string | null }>({
    archiveUrl: null,
    archivedAt: null,
  });
  const [archiveStep, setArchiveStep] = useState<Step>("idle");

  /**
   * The capture the answers belong to.
   *
   * Two requests are in flight at once and the slow one routinely outlives the
   * reader's patience: without this, a snapshot for the address they gave up
   * on lands in the citation for the one they typed next.
   */
  const attempt = useRef(0);

  const capture = useCallback(async () => {
    const trimmed = url.trim();

    if (!isCapturable(trimmed)) {
      setError("That is not a web address — it needs to start with http:// or https://.");
      return;
    }

    const mine = attempt.current + 1;
    attempt.current = mine;

    setError(null);
    setPage(null);
    setArchive({ archiveUrl: null, archivedAt: null });
    setPageStep("working");
    setArchiveStep("working");

    // Not awaited together: the whole point is that the fast half is shown
    // without waiting for the slow one.
    void capturePage(trimmed, "page")
      .then((found) => {
        if (attempt.current !== mine) return;
        setPage(found);
        setPageStep("done");
      })
      .catch((caught: unknown) => {
        if (attempt.current !== mine) return;
        setPageStep("failed");
        setError(explain(caught));
      });

    void capturePage(trimmed, "archive")
      .then((found) => {
        if (attempt.current !== mine) return;
        setArchive({ archiveUrl: found.archiveUrl, archivedAt: found.archivedAt });
        setArchiveStep(found.archiveUrl ? "done" : "failed");
      })
      .catch(() => {
        if (attempt.current !== mine) return;
        // Not an error the reader has to act on: the citation is still worth
        // having, and it will say for itself that nothing was archived.
        setArchiveStep("failed");
      });
  }, [url]);

  /** The exact text that will be written into the note. */
  const citation = page
    ? formatSource({
        url: page.url,
        title: page.title,
        capturedAt: page.capturedAt,
        ...archive,
      } as CapturedSource)
    : null;

  const insert = useCallback(async () => {
    if (!citation) return;
    await onInsert(citation);
    onClose();
  }, [citation, onInsert, onClose]);

  /**
   * Fills the box from the clipboard, which is where the address always is.
   *
   * Offered as a button rather than done on open: reading somebody's clipboard
   * unasked is not a thing an app should do, and in most browsers it prompts.
   */
  // Read once, when the dialog mounts. Not in an effect: that would be a state
  // write during mount for a value that never changes, and this component only
  // ever mounts in response to a click, so there is no server render to differ
  // from.
  const [canPaste] = useState(
    () => typeof navigator !== "undefined" && Boolean(navigator.clipboard?.readText),
  );

  const pasteFromClipboard = useCallback(async () => {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (text) setUrl(text);
    } catch {
      // Refused, or empty. The box is still there to type into.
    }
  }, []);

  const busy = pageStep === "working";

  return (
    <Dialog
      title="Capture a web page as a source"
      subtitle="Its address, when you read it, and a copy that outlives it"
      onClose={onClose}
    >
      <div className="space-y-3">
        {/* Said before anything is typed, because "what will this do to my
            note" is the question, and the answer is short. */}
        {pageStep === "idle" && (
          <div className="space-y-2 rounded-lg border border-[var(--fl-border)] bg-[var(--fl-elevated)] p-3 text-[12px] leading-snug text-[var(--fl-muted)]">
            <p>
              Paste the address of a page you are citing. ForkLeaf reads its title, records the
              moment you read it, and finds — or asks the Wayback Machine to make — an archived
              copy.
            </p>
            <p>
              You get a plain blockquote at the end of the note, committed with it like any other
              edit:
            </p>
            <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-[var(--fl-surface)] p-2 font-mono text-[11px] text-[var(--fl-text)]">
              {"> **Source** — [The article](https://example.com/article)\n" +
                "> Read 2026-08-27 10:04 UTC · [archived copy](https://web.archive.org/…)"}
            </pre>
          </div>
        )}

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

          {canPaste && url.trim() === "" && (
            <button
              type="button"
              onClick={() => void pasteFromClipboard()}
              className="fl-btn shrink-0"
            >
              Paste
            </button>
          )}

          <button
            type="button"
            onClick={() => void capture()}
            disabled={busy || url.trim() === ""}
            className="fl-btn fl-btn-primary shrink-0 disabled:opacity-40"
          >
            {busy ? "Reading…" : "Capture"}
          </button>
        </div>

        {error && (
          <p role="alert" className="text-[13px] text-[var(--fl-danger)]">
            {error}
          </p>
        )}

        {pageStep !== "idle" && (
          <div className="space-y-2 rounded-lg border border-[var(--fl-border)] bg-[var(--fl-elevated)] p-3">
            {/* Both halves are named while they are still outstanding. A
                spinner says "wait"; this says what for. */}
            <Line
              step={pageStep}
              working="Reading the page…"
              done={page?.title ?? ""}
              failed="The page itself could not be read."
            />

            {page?.titleFromUrl && pageStep === "done" && (
              <p className="text-[12px] text-[var(--fl-muted)]">
                Its address stands in for a title, since the page could not be read from here.
              </p>
            )}

            <Line
              step={archiveStep}
              working="Looking for an archived copy — this can take up to a minute…"
              done={
                archive.archivedAt
                  ? `Archived copy from ${new Date(archive.archivedAt).toLocaleDateString()}`
                  : "Archived copy found"
              }
              failed="No archived copy — the citation will say so."
            />

            {citation && (
              <>
                <p className="pt-1 text-[11.5px] uppercase tracking-wide text-[var(--fl-muted)]">
                  What goes into the note
                </p>
                <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-[var(--fl-surface)] p-2 font-mono text-[11px] text-[var(--fl-text)]">
                  {citation}
                </pre>

                <div className="flex items-center justify-between gap-3 pt-1">
                  <span className="text-[11.5px] text-[var(--fl-muted)]">
                    {archiveStep === "working"
                      ? "You can add it now — the archived copy is still being looked for."
                      : "Added at the end of this note."}
                  </span>
                  <button
                    type="button"
                    onClick={() => void insert()}
                    className="fl-btn fl-btn-primary shrink-0"
                  >
                    Add to this note
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}

/** One step of the capture, in whichever state it is in. */
function Line({
  step,
  working,
  done,
  failed,
}: {
  step: Step;
  working: string;
  done: string;
  failed: string;
}) {
  if (step === "idle") return null;

  const text = step === "working" ? working : step === "done" ? done : failed;

  return (
    <p className="flex items-start gap-2 text-[12.5px] leading-snug">
      <span aria-hidden="true" className="mt-[3px] shrink-0 text-[var(--fl-muted)]">
        {step === "working" ? "…" : step === "done" ? "✓" : "—"}
      </span>
      <span className={step === "done" ? "text-[var(--fl-text)]" : "text-[var(--fl-muted)]"}>
        {text}
      </span>
    </p>
  );
}

/** The sentence that helps, for the failures that have one. */
function explain(caught: unknown): string {
  if (caught instanceof ApiGatewayError) {
    if (caught.needsAuth)
      return "Sign in with GitHub to capture pages — the page is read by our server, not by your browser.";
    if (caught.code === "rate-limited")
      return "That is a lot of captures in a short time. Try again in a few minutes.";
    if (caught.status === 0) return "No connection to the server, so the page could not be read.";
    return caught.message;
  }

  return caught instanceof Error ? caught.message : "That page could not be captured.";
}
