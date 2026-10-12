"use client";

import { useState } from "react";
import { Dialog } from "@/components/Dialog";
import { tidyPassage } from "@/lib/book-quotes";
import {
  recognise as recogniseOnDevice,
  type OcrProgress,
  type Recognised,
  type RecognisedLine,
} from "@/lib/ocr";

/**
 * Quote from a book: photograph a page, tap the lines worth keeping, name the
 * book and the page, and the passage is kept in that book's note — where
 * spaced reading brings it back to be reread.
 *
 * On a phone, "Take a photo" opens the camera directly. The photo is read on
 * the device and is not kept; only the chosen words are.
 */

export interface BookQuoteDialogProps {
  onClose: () => void;
  books: ReadonlyArray<{ title: string; author: string | null }>;
  /** Saves the quote; resolves to the note it went into. */
  onSave: (quote: {
    book: string;
    author: string | null;
    page: string | null;
    text: string;
  }) => Promise<string>;
  /** For tests; reads on the device otherwise. */
  recognise?: (image: Blob, onProgress?: (progress: OcrProgress) => void) => Promise<Recognised>;
}

type Phase =
  | { kind: "photo" }
  | { kind: "reading"; percent: number | null }
  | { kind: "choose"; lines: RecognisedLine[] }
  | { kind: "error"; message: string };

export function BookQuoteDialog({
  onClose,
  books,
  onSave,
  recognise = recogniseOnDevice,
}: BookQuoteDialogProps) {
  const [phase, setPhase] = useState<Phase>({ kind: "photo" });
  const [chosen, setChosen] = useState<ReadonlySet<number>>(new Set());
  const [passage, setPassage] = useState("");
  const [edited, setEdited] = useState(false);
  const [book, setBook] = useState("");
  const [author, setAuthor] = useState("");
  const [page, setPage] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const read = async (file: File) => {
    setPhase({ kind: "reading", percent: null });
    setChosen(new Set());
    setPassage("");
    setEdited(false);
    setSaved(null);
    try {
      const result = await recognise(file, (progress) =>
        setPhase({
          kind: "reading",
          percent: progress.stage === "reading" ? Math.round(progress.progress * 100) : null,
        }),
      );
      const lines = result.lines.filter((line) => line.text.trim());
      setPhase(
        lines.length > 0
          ? { kind: "choose", lines }
          : {
              kind: "error",
              message: "No words found on that page. Try again closer, with more light.",
            },
      );
    } catch (error) {
      setPhase({
        kind: "error",
        message: error instanceof Error ? error.message : "The photo could not be read.",
      });
    }
  };

  const toggle = (index: number, extend: boolean) => {
    // A functional update, so two clicks in quick succession — a click and
    // then a shift-click — each see the other's choice.
    setChosen((current) => {
      const next = new Set(current);
      if (extend && current.size > 0) {
        // Shift-click: everything from the nearest chosen line to this one.
        const anchor = [...current].reduce((best, each) =>
          Math.abs(each - index) < Math.abs(best - index) ? each : best,
        );
        for (let i = Math.min(anchor, index); i <= Math.max(anchor, index); i += 1) next.add(i);
      } else if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  /** The chosen lines as one passage, until the reader edits it by hand. */
  const joined =
    phase.kind === "choose"
      ? tidyPassage(
          [...chosen]
            .sort((a, b) => a - b)
            .map((i) => phase.lines[i]?.text ?? "")
            .join("\n"),
        )
      : "";
  const quoteText = edited ? passage : joined;

  const save = async () => {
    const title = book.trim();
    const text = tidyPassage(quoteText);
    if (!text) return setProblem("Choose the lines to keep — tap them above.");
    if (!title) return setProblem("Which book is it from?");
    setProblem(null);
    setSaving(true);
    try {
      const path = await onSave({
        book: title,
        author: author.trim() || null,
        page: page.trim() || null,
        text,
      });
      setSaved(path);
      setChosen(new Set());
      setPassage("");
      setEdited(false);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "The quote could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const pickPhoto = (capture: boolean) => (
    <label className={`fl-btn ${capture ? "fl-btn-primary" : "fl-btn-ghost"} cursor-pointer`}>
      {capture ? "Take a photo of the page" : "Choose a photo"}
      <input
        type="file"
        accept="image/*"
        {...(capture ? { capture: "environment" as const } : {})}
        aria-label={capture ? "Take a photo of the page" : "Choose a photo"}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void read(file);
        }}
      />
    </label>
  );

  return (
    <Dialog
      title="Quote from a book"
      subtitle="Photograph a page, tap the lines worth keeping"
      onClose={onClose}
      wide
    >
      <div className="grid gap-3 text-[13px]">
        {(phase.kind === "photo" || phase.kind === "error") && (
          <>
            <p className="text-[var(--fl-muted)]">
              The page is read on this device and the photo is not kept — only the lines you choose,
              in a note for the book, where they come back in spaced reading.
            </p>
            <div className="flex flex-wrap gap-2">
              {pickPhoto(true)}
              {pickPhoto(false)}
            </div>
            {phase.kind === "error" && (
              <p role="alert" className="text-[var(--fl-danger)]">
                {phase.message}
              </p>
            )}
          </>
        )}

        {phase.kind === "reading" && (
          <p role="status" className="text-[var(--fl-muted)]">
            Reading the page…{phase.percent !== null ? ` ${phase.percent}%` : ""}
          </p>
        )}

        {phase.kind === "choose" && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-[var(--fl-muted)]">
              <span>Tap the lines to keep. Shift-click to take a run of them.</span>
              <button
                type="button"
                className="ml-auto underline underline-offset-2"
                onClick={() => setChosen(new Set(phase.lines.map((_line, i) => i)))}
              >
                All
              </button>
              <button
                type="button"
                className="underline underline-offset-2"
                onClick={() => setChosen(new Set())}
              >
                None
              </button>
            </div>
            <ol
              className="max-h-64 overflow-auto rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-1.5"
              data-testid="book-lines"
            >
              {phase.lines.map((line, index) => (
                <li key={index}>
                  <button
                    type="button"
                    aria-pressed={chosen.has(index)}
                    onClick={(event) => toggle(index, event.shiftKey)}
                    className={`block w-full rounded-md px-2 py-1.5 text-left font-serif text-[14.5px] leading-snug ${
                      chosen.has(index)
                        ? "bg-[var(--fl-accent-soft)] text-[var(--fl-text)]"
                        : "text-[var(--fl-muted)] hover:bg-[var(--fl-elevated)]"
                    }`}
                  >
                    {line.text}
                  </button>
                </li>
              ))}
            </ol>

            <label className="grid gap-1">
              <span className="text-[12px] font-medium text-[var(--fl-muted)]">
                The quote — correct anything misread
              </span>
              <textarea
                aria-label="The quote"
                value={quoteText}
                onChange={(event) => {
                  setPassage(event.target.value);
                  setEdited(true);
                }}
                rows={3}
                className="fl-input w-full resize-y font-serif text-[14px] leading-relaxed"
              />
            </label>

            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_6rem]">
              <label className="grid gap-1">
                <span className="text-[12px] font-medium text-[var(--fl-muted)]">Book</span>
                <input
                  list="book-titles"
                  value={book}
                  onChange={(event) => {
                    setBook(event.target.value);
                    const known = books.find(
                      (each) =>
                        each.title.toLowerCase() === event.target.value.trim().toLowerCase(),
                    );
                    if (known) setAuthor(known.author ?? "");
                  }}
                  placeholder="Title"
                  aria-label="Book"
                  className="fl-input"
                />
                <datalist id="book-titles">
                  {books.map((each) => (
                    <option key={each.title} value={each.title} />
                  ))}
                </datalist>
              </label>
              <label className="grid gap-1">
                <span className="text-[12px] font-medium text-[var(--fl-muted)]">Author</span>
                <input
                  value={author}
                  onChange={(event) => setAuthor(event.target.value)}
                  placeholder="Optional"
                  aria-label="Author"
                  className="fl-input"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-[12px] font-medium text-[var(--fl-muted)]">Page</span>
                <input
                  value={page}
                  onChange={(event) => setPage(event.target.value)}
                  inputMode="numeric"
                  aria-label="Page"
                  className="fl-input"
                />
              </label>
            </div>

            {problem && (
              <p role="alert" className="text-[var(--fl-danger)]">
                {problem}
              </p>
            )}
            {saved && (
              <p role="status" className="text-[var(--fl-muted)]">
                Kept in {saved}. It will come back in spaced reading. Tap more lines to keep another
                passage from this page.
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving}
                className="fl-btn fl-btn-primary"
              >
                {saving ? "Saving…" : "Keep this quote"}
              </button>
              {pickPhoto(true)}
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
