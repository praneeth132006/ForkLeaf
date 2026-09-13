"use client";

import { useState } from "react";

/**
 * What an encrypted note shows instead of its text.
 *
 * Shown in the editor's place, so there is no moment where the sealed
 * envelope appears as if it were the note, and nothing that could be typed
 * into it. Unlocking lasts until the tab closes or the note is locked again;
 * the passphrase is not remembered anywhere.
 */

export interface UnlockPanelProps {
  noteTitle: string;
  /** Resolves when the note is open; rejects with a message to show. */
  onUnlock: (passphrase: string) => Promise<void>;
}

export function UnlockPanel({ noteTitle, onUnlock }: UnlockPanelProps) {
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const submit = async () => {
    if (!passphrase || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      await onUnlock(passphrase);
    } catch (error: unknown) {
      setProblem(error instanceof Error ? error.message : "The note could not be opened.");
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-6">
      <form
        className="w-full max-w-sm text-center"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="mx-auto h-9 w-9 text-[var(--fl-muted)]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
          <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
        </svg>
        <h2 className="mt-3 text-[16px] font-semibold text-[var(--fl-text)]">
          This note is encrypted
        </h2>
        <p className="mt-1 text-[13px] text-[var(--fl-muted)]">
          Enter the passphrase for <span className="text-[var(--fl-text)]">{noteTitle}</span> to
          read and edit it. It stays open until you close this tab.
        </p>

        <input
          type="password"
          value={passphrase}
          onChange={(event) => setPassphrase(event.target.value)}
          aria-label="Passphrase"
          autoComplete="current-password"
          autoFocus
          className="mt-4 w-full rounded-lg border border-[var(--fl-border)] bg-[var(--fl-surface)] px-3 py-2 text-[14px] text-[var(--fl-text)] outline-none focus:border-[var(--fl-accent)]"
        />
        {problem && (
          <p role="alert" className="mt-2 text-[12.5px] text-[var(--fl-danger)]">
            {problem}
          </p>
        )}
        <button
          type="submit"
          disabled={!passphrase || busy}
          className="fl-btn fl-btn-primary mt-3 w-full justify-center disabled:opacity-50"
        >
          {busy ? "Unlocking…" : "Unlock"}
        </button>
      </form>
    </div>
  );
}
