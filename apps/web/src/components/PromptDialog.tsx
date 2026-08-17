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
          <p className="mb-3 text-sm leading-relaxed text-[var(--fl-muted)]">{request.body}</p>
        )}

        {!request.destructive && (
          <label className="mb-4 block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[var(--fl-muted)]">
              {request.label}
            </span>
            <input
              value={value}
              onChange={(event) => setValue(event.target.value)}
              autoFocus
              // Select the existing text so renaming replaces rather than appends.
              onFocus={(event) => event.currentTarget.select()}
              className="w-full rounded-md border border-[var(--fl-border)] bg-[var(--fl-surface)] px-3 py-2 text-sm text-[var(--fl-text)] outline-none focus:border-[var(--fl-accent)]"
            />
          </label>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm text-[var(--fl-muted)] hover:bg-[var(--fl-elevated)] hover:text-[var(--fl-text)]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || (!request.destructive && !value.trim())}
            className={`rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-40 ${
              request.destructive
                ? "bg-[var(--fl-danger)] text-white hover:opacity-90"
                : "bg-[var(--fl-accent)] text-[var(--fl-accent-contrast)] hover:opacity-90"
            }`}
          >
            {busy ? "Working…" : (request.confirmLabel ?? "Save")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
