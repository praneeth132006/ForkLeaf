"use client";

import React, { useState } from "react";
import { Dialog } from "./Dialog";

export interface PromptRequest {
  title: string;
  label: string;
  initialValue?: string;
  confirmLabel?: string;
  /** Renders a destructive confirmation instead of a text input. */
  destructive?: boolean;
  body?: string;
  onConfirm: (value: string) => void | Promise<void>;
}

export interface PromptDialogProps {
  request: PromptRequest;
  onClose: () => void;
}

/**
 * Replaces `window.prompt` / `window.confirm`.
 *
 * The native dialogs cannot be styled, ignore the app's dark theme, are
 * suppressed entirely in some embedded contexts, and block the main thread —
 * which would stall the autosave loop mid-keystroke.
 */
export function PromptDialog({ request, onClose }: PromptDialogProps) {
  const [value, setValue] = useState(request.initialValue ?? "");
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!request.destructive && !value.trim()) return;

    setBusy(true);
    try {
      await request.onConfirm(value.trim());
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title={request.title} onClose={onClose}>
      <form onSubmit={submit}>
        {request.body && (
          <p className="mb-3 text-sm leading-relaxed text-[var(--color-mist)]">{request.body}</p>
        )}

        {!request.destructive && (
          <label className="mb-4 block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[var(--color-mist)]">
              {request.label}
            </span>
            <input
              value={value}
              onChange={(event) => setValue(event.target.value)}
              autoFocus
              // Select the existing text so renaming replaces rather than appends.
              onFocus={(event) => event.currentTarget.select()}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-trail-teal)]"
            />
          </label>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm text-[var(--color-mist)] hover:bg-[var(--color-chalk)] hover:text-[var(--color-ink)]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || (!request.destructive && !value.trim())}
            className={`rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-40 ${
              request.destructive
                ? "bg-[var(--color-ember)] text-white hover:opacity-90"
                : "bg-[var(--color-signal-amber)] text-[var(--color-basalt)] hover:opacity-90"
            }`}
          >
            {busy ? "Working…" : (request.confirmLabel ?? "Save")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
