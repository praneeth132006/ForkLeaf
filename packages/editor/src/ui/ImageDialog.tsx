"use client";

import React, { useCallback, useRef, useState } from "react";
import { Modal } from "./Modal";
import { IMAGE_ACCEPT, isEditableImage } from "../images";

export interface ImageDialogProps {
  /** False when there is nowhere at all to put a file. */
  canUpload: boolean;
  /**
   * Set when a file can be added but not committed anywhere.
   *
   * A local-only notebook has no repository, so an image is embedded in the
   * note itself. That works, and it makes the file much larger — which is the
   * kind of thing someone should be told before they paste in twenty
   * screenshots, not after.
   */
  embedsInNote?: boolean;
  /** Stores the file and inserts it. Rejects with a message on failure. */
  onUpload: (file: File, alt: string) => Promise<void>;
  /** Inserts an image that already lives somewhere on the web. */
  onUrl: (url: string, alt: string) => void;
  onClose: () => void;
  /**
   * Explains where uploads go, when they go anywhere.
   *
   * Committing a file into someone's repository is not a neutral act, and the
   * dialog should say so before it happens rather than after.
   */
  destination?: string;
}

/**
 * Adding an image to a note.
 *
 * Replaces a `window.prompt("Image URL")`, which was the entire feature: no
 * way to use a file from your own machine, no way to see what you were about
 * to insert, and a browser dialog that some people never see because their
 * browser suppresses it. Both real answers — a file, or a URL — are here.
 */
export function ImageDialog({
  canUpload,
  embedsInNote = false,
  onUpload,
  onUrl,
  onClose,
  destination,
}: ImageDialogProps) {
  const [url, setUrl] = useState("");
  const [alt, setAlt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const takeFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;

      if (!isEditableImage(file)) {
        setError("That file is not an image ForkLeaf can store.");
        return;
      }

      setBusy(true);
      setError(null);
      try {
        await onUpload(file, alt);
        onClose();
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : "That image could not be added.");
      } finally {
        setBusy(false);
      }
    },
    [alt, onClose, onUpload],
  );

  const submitUrl = useCallback(() => {
    const trimmed = url.trim();
    if (!trimmed) return;

    // A javascript: or data: URL typed in here would be stored in the note and
    // then rendered by everything that opens it.
    if (!/^https?:\/\//i.test(trimmed)) {
      setError("Please use an http:// or https:// image URL.");
      return;
    }

    onUrl(trimmed, alt);
    onClose();
  }, [alt, onClose, onUrl, url]);

  return (
    <Modal
      title="Add an image"
      {...(destination ? { subtitle: destination } : {})}
      onClose={onClose}
      widthClassName="max-w-lg"
    >
      <div className="space-y-4 overflow-y-auto p-5">
        {canUpload ? (
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              void takeFile(event.dataTransfer.files[0]);
            }}
            className={`rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
              dragging
                ? "border-[var(--fl-accent)] bg-[var(--fl-accent-soft)]"
                : "border-[var(--fl-border)]"
            }`}
          >
            <p className="text-[14px] font-medium text-[var(--fl-text)]">
              Drop an image here, or choose a file
            </p>
            <p className="mt-1 text-[12.5px] text-[var(--fl-muted)]">
              PNG, JPEG, GIF, WebP, AVIF, BMP or ICO, up to 10 MB. You can also paste one straight
              into the note.
            </p>

            <input
              ref={fileInput}
              type="file"
              accept={IMAGE_ACCEPT}
              className="hidden"
              onChange={(event) => void takeFile(event.target.files?.[0])}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => fileInput.current?.click()}
              className="fl-btn fl-btn-primary mt-4 !py-2 !text-[13px] disabled:opacity-50"
            >
              {busy ? "Adding…" : "Choose a file"}
            </button>
          </div>
        ) : (
          <p className="rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] px-4 py-3 text-[13px] leading-relaxed text-[var(--fl-muted)]">
            There is nowhere to store a file for this note yet. Link to an image on the web below,
            or connect a repository and the file will be committed alongside your notes.
          </p>
        )}

        {canUpload && embedsInNote && (
          <p className="rounded-lg border border-[var(--fl-border)] bg-[var(--fl-surface)] px-3 py-2 text-[12.5px] leading-relaxed text-[var(--fl-muted)]">
            This notebook is only on this device, so the file is kept here rather than committed.
            The note links to it by the same relative path it would use in a repository, so
            connecting one later is all it takes for the images to travel with the notes.
          </p>
        )}

        <div>
          <label
            htmlFor="fl-image-alt"
            className="mb-1 block text-[12.5px] font-medium text-[var(--fl-text)]"
          >
            Description
          </label>
          <input
            id="fl-image-alt"
            value={alt}
            onChange={(event) => setAlt(event.target.value)}
            placeholder="What the image shows"
            className="fl-input w-full"
          />
          <p className="mt-1 text-[11.5px] text-[var(--fl-muted)]">
            Read aloud by screen readers, and shown if the image cannot load.
          </p>
        </div>

        <div>
          <label
            htmlFor="fl-image-url"
            className="mb-1 block text-[12.5px] font-medium text-[var(--fl-text)]"
          >
            Or link to an image on the web
          </label>
          <div className="flex gap-2">
            <input
              id="fl-image-url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  submitUrl();
                }
              }}
              placeholder="https://…"
              className="fl-input w-full"
            />
            <button
              type="button"
              onClick={submitUrl}
              disabled={!url.trim()}
              className="fl-btn fl-btn-ghost shrink-0 !py-2 !text-[13px] disabled:opacity-40"
            >
              Insert
            </button>
          </div>
        </div>

        {error && (
          <p role="alert" className="text-[12.5px] text-[var(--fl-danger)]">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
