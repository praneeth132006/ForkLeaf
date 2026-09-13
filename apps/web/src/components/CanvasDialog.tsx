"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CanvasBoard, type CanvasNoteChoice } from "@forkleaf/editor";
import { Dialog } from "@/components/Dialog";
import { canvasTitle, parseCanvas, serializeCanvas, type Canvas } from "@/lib/canvas";

export type { CanvasNoteChoice };

/**
 * A `.canvas` file, opened on its own.
 *
 * A canvas made from the `/` menu lives in the note, where it was inserted.
 * This is for board files — made before that, or in Obsidian — opened from the
 * sidebar or ⌘K. The board is the same one; this loads the file, saves it a
 * moment after every change, and writes anything unsaved on the way out.
 */

export interface CanvasDialogProps {
  path: string;
  onClose: () => void;
  /** The file's text, or null when it does not exist yet. */
  load: () => Promise<string | null>;
  save: (text: string) => Promise<void>;
  /** Notes that can be placed on the board. */
  notes: readonly CanvasNoteChoice[];
  onOpenNote: (path: string) => void;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; canvas: Canvas; dropped: number }
  | { kind: "problem"; message: string };
type SaveState = "idle" | "saving" | "saved" | "error";

export function CanvasDialog({ path, onClose, load, save, notes, onOpenNote }: CanvasDialogProps) {
  const [loadState, setLoadState] = useState<LoadState>({ kind: "loading" });
  const [saveState, setSaveState] = useState<SaveState>("idle");
  /** The board as last changed, or null when nothing has changed. */
  const latest = useRef<Canvas | null>(null);
  const timer = useRef<number | null>(null);
  const saver = useRef(save);
  useEffect(() => {
    saver.current = save;
  });
  const loader = useRef(load);

  useEffect(() => {
    let live = true;
    loader.current().then(
      (text) => {
        if (!live) return;
        const parsed = parseCanvas(text ?? "");
        if (parsed.problem) setLoadState({ kind: "problem", message: parsed.problem });
        else setLoadState({ kind: "ready", canvas: parsed.canvas, dropped: parsed.dropped });
      },
      (error: unknown) => {
        if (!live) return;
        setLoadState({
          kind: "problem",
          message: error instanceof Error ? error.message : "This canvas could not be read.",
        });
      },
    );
    return () => {
      live = false;
    };
  }, []);

  const flush = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    const canvas = latest.current;
    if (!canvas) return Promise.resolve();
    latest.current = null;
    setSaveState("saving");
    return saver.current(serializeCanvas(canvas)).then(
      () => setSaveState("saved"),
      () => {
        // Kept, so the next change or closing tries again.
        latest.current ??= canvas;
        setSaveState("error");
      },
    );
  }, []);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const onChange = useCallback(
    (canvas: Canvas) => {
      latest.current = canvas;
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void flush(), 600);
    },
    [flush],
  );

  // Stable, so the dialog is not handed a new close handler on every render.
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  const close = useCallback(() => {
    // Anything changed since the last save is written on the way out.
    void flush().catch(() => undefined);
    closeRef.current();
  }, [flush]);

  return (
    <Dialog
      title={canvasTitle(path)}
      subtitle={`${path} · JSON Canvas — opens in Obsidian too`}
      onClose={close}
      wide
      steady
    >
      <div className="flex min-h-0 flex-1 flex-col gap-2 text-[13px]">
        {loadState.kind === "loading" && (
          <p role="status" className="text-[var(--fl-muted)]">
            Opening the canvas…
          </p>
        )}

        {loadState.kind === "problem" && (
          <div role="alert" className="leading-relaxed">
            <p className="text-[var(--fl-danger)]">{loadState.message}</p>
            <p className="mt-1 text-[var(--fl-muted)]">
              Nothing has been changed. Open the file in Source view to see what it holds.
            </p>
          </div>
        )}

        {loadState.kind === "ready" && (
          <>
            {loadState.dropped > 0 && (
              <p className="text-[12px] text-[var(--fl-muted)]">
                {loadState.dropped} item{loadState.dropped === 1 ? "" : "s"} in this file could not
                be read and will not be kept once the board is changed.
              </p>
            )}
            <CanvasBoard
              initial={loadState.canvas}
              onChange={onChange}
              notes={notes}
              onOpenNote={(notePath) => {
                close();
                onOpenNote(notePath);
              }}
              status={
                <span className="mr-1 text-[11.5px] text-[var(--fl-muted)]" role="status">
                  {saveState === "saving"
                    ? "Saving…"
                    : saveState === "saved"
                      ? "Saved"
                      : saveState === "error"
                        ? "Could not save — changes are kept here"
                        : ""}
                </span>
              }
            />
          </>
        )}
      </div>
    </Dialog>
  );
}
