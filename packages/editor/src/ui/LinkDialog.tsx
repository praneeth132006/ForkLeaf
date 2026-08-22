"use client";

import React, { useState } from "react";
import { Modal } from "./Modal";

export interface LinkDialogProps {
  /** Text already selected in the document, used as the link's label. */
  initialText: string;
  initialUrl?: string;
  onSubmit: (url: string, text: string) => void;
  onRemove?: () => void;
  onClose: () => void;
}

/** Adding or editing a link, with the label and the destination both visible. */
export function LinkDialog({
  initialText,
  initialUrl = "",
  onSubmit,
  onRemove,
  onClose,
}: LinkDialogProps) {
  const [url, setUrl] = useState(initialUrl);
  const [text, setText] = useState(initialText);
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const trimmed = url.trim();
    if (!trimmed) return;

    // Anything outside these schemes is a script-execution vector once the
    // note is rendered somewhere else.
    if (!/^(https?:\/\/|mailto:|#|\.{0,2}\/)/i.test(trimmed)) {
      setError("Use an http:// or https:// address, a mailto: link, or a path within the repo.");
      return;
    }

    onSubmit(trimmed, text.trim());
    onClose();
  };

  return (
    <Modal title="Link" onClose={onClose} widthClassName="max-w-md">
      <div className="space-y-4 p-5">
        <div>
          <label
            htmlFor="fl-link-text"
            className="mb-1 block text-[12.5px] font-medium text-[var(--fl-text)]"
          >
            Text
          </label>
          <input
            id="fl-link-text"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="What the link says"
            className="fl-input w-full"
          />
        </div>

        <div>
          <label
            htmlFor="fl-link-url"
            className="mb-1 block text-[12.5px] font-medium text-[var(--fl-text)]"
          >
            Address
          </label>
          <input
            id="fl-link-url"
            autoFocus
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submit();
              }
            }}
            placeholder="https://…"
            className="fl-input w-full"
          />
        </div>

        {error && (
          <p role="alert" className="text-[12.5px] text-[var(--fl-danger)]">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          {onRemove && (
            <button
              type="button"
              onClick={() => {
                onRemove();
                onClose();
              }}
              className="fl-btn fl-btn-ghost !py-2 !text-[13px]"
            >
              Remove link
            </button>
          )}
          <button
            type="button"
            onClick={submit}
            disabled={!url.trim()}
            className="fl-btn fl-btn-primary !py-2 !text-[13px] disabled:opacity-40"
          >
            Apply
          </button>
        </div>
      </div>
    </Modal>
  );
}
