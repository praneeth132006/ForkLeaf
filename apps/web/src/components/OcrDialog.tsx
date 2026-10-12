"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog } from "@/components/Dialog";
import {
  recognise as recogniseOnDevice,
  structureText,
  type OcrProgress,
  type Recognised,
} from "@/lib/ocr";

/**
 * Text from a picture: a screenshot of a slide, a photo of a whiteboard, a
 * scan — pasted, dropped or chosen — read on this device and added to the
 * note as text you can edit, search and link.
 *
 * The text is shown for correcting before it is added, because a recogniser
 * misreads, and a note full of quiet mistakes is worse than no note.
 */

export interface OcrDialogProps {
  onClose: () => void;
  /** Adds the text, and the picture when asked, to the end of the note. */
  onAdd: (text: string, picture: File | null) => Promise<void>;
  /** For tests; reads on the device otherwise. */
  recognise?: (image: Blob, onProgress?: (progress: OcrProgress) => void) => Promise<Recognised>;
}

type State =
  | { kind: "empty" }
  | { kind: "reading"; progress: OcrProgress | null }
  | { kind: "read"; confidence: number }
  | { kind: "error"; message: string };

export function OcrDialog({ onClose, onAdd, recognise = recogniseOnDevice }: OcrDialogProps) {
  const [picture, setPicture] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [state, setState] = useState<State>({ kind: "empty" });
  const [text, setText] = useState("");
  const [keepPicture, setKeepPicture] = useState(true);
  const [adding, setAdding] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const run = useRef(0);

  const read = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) {
        setState({ kind: "error", message: "That is not a picture. Choose a PNG, JPEG or WebP." });
        return;
      }
      const id = ++run.current;
      setPicture(file);
      // The previous preview's address is released by the effect below.
      setPreview(URL.createObjectURL(file));
      setText("");
      setProblem(null);
      setState({ kind: "reading", progress: null });
      try {
        const result = await recognise(file, (progress) => {
          if (run.current === id) setState({ kind: "reading", progress });
        });
        if (run.current !== id) return;
        const structured = structureText(result.text);
        setText(structured);
        setState({ kind: "read", confidence: Math.round(result.confidence) });
      } catch (error) {
        if (run.current !== id) return;
        setState({
          kind: "error",
          message: error instanceof Error ? error.message : "The picture could not be read.",
        });
      }
    },
    [recognise],
  );

  // Paste anywhere while the dialog is open.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const file = Array.from(event.clipboardData?.files ?? []).find((each) =>
        each.type.startsWith("image/"),
      );
      if (file) {
        event.preventDefault();
        void read(file);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [read]);

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  const add = async () => {
    setAdding(true);
    setProblem(null);
    try {
      await onAdd(text.trim(), keepPicture ? picture : null);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "That could not be added.");
    } finally {
      setAdding(false);
    }
  };

  const percent =
    state.kind === "reading" && state.progress ? Math.round(state.progress.progress * 100) : null;

  return (
    <Dialog
      title="Text from a picture"
      subtitle="Read on this device — the picture is not sent anywhere"
      onClose={onClose}
      wide
    >
      <div className="grid gap-3 text-[13px]">
        <label
          className="flex min-h-[7rem] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--fl-border-strong)] bg-[var(--fl-elevated)] p-4 text-center text-[var(--fl-muted)]"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const file = event.dataTransfer.files[0];
            if (file) void read(file);
          }}
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- a local blob preview
            <img
              src={preview}
              alt="The picture being read"
              className="max-h-48 rounded-lg object-contain"
            />
          ) : (
            <span>
              <span className="font-medium text-[var(--fl-text)]">
                Paste, drop or choose a picture
              </span>
              <br />A screenshot, a slide, a whiteboard, a scanned page
            </span>
          )}
          <input
            type="file"
            accept="image/*"
            aria-label="Choose a picture"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void read(file);
            }}
          />
        </label>

        {state.kind === "reading" && (
          <div role="status" className="grid gap-1.5 text-[var(--fl-muted)]">
            <span>
              {state.progress?.stage === "reading"
                ? "Reading the words…"
                : "Getting the text reader ready (once per visit)…"}
              {percent !== null ? ` ${percent}%` : ""}
            </span>
            <span
              className="h-1 overflow-hidden rounded-full bg-[var(--fl-elevated)]"
              aria-hidden="true"
            >
              <span
                className="block h-full bg-[var(--fl-accent)] transition-[width]"
                style={{ width: `${percent ?? 5}%` }}
              />
            </span>
          </div>
        )}

        {state.kind === "error" && (
          <p role="alert" className="text-[var(--fl-danger)]">
            {state.message}
          </p>
        )}

        {state.kind === "read" && (
          <>
            {text ? (
              <>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-[var(--fl-muted)]">
                    Check the text, then add it. Lists and paragraphs are kept.
                  </span>
                  {state.confidence < 70 && (
                    <span className="text-[12px] text-[var(--fl-warn)]">
                      Some words may be misread ({state.confidence}% sure)
                    </span>
                  )}
                </div>
                <textarea
                  id="ocr-text"
                  aria-label="Text read from the picture"
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  rows={10}
                  className="fl-input w-full resize-y font-mono text-[12.5px] leading-relaxed"
                />
                <label className="flex items-center gap-2 text-[var(--fl-muted)]">
                  <input
                    type="checkbox"
                    checked={keepPicture}
                    onChange={(event) => setKeepPicture(event.target.checked)}
                    className="accent-[var(--fl-accent)]"
                  />
                  Put the picture in the note too
                </label>
              </>
            ) : (
              <p className="text-[var(--fl-muted)]">
                No words found in that picture. A sharper or larger picture usually helps.
              </p>
            )}
          </>
        )}

        {problem && (
          <p role="alert" className="text-[var(--fl-danger)]">
            {problem}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void add()}
            disabled={state.kind !== "read" || !text.trim() || adding}
            className="fl-btn fl-btn-primary"
          >
            {adding ? "Adding…" : "Add to the note"}
          </button>
          {state.kind === "read" && text.trim() && (
            <button
              type="button"
              onClick={() => void navigator.clipboard?.writeText(text).catch(() => {})}
              className="fl-btn fl-btn-ghost"
            >
              Copy the text
            </button>
          )}
        </div>
      </div>
    </Dialog>
  );
}
