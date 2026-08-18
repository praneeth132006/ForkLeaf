"use client";

import { useEffect, useRef, useState } from "react";
import type { SyncMode, SyncPreference } from "@forkleaf/types";

export interface SyncModeMenuProps {
  preference: SyncPreference;
  onChange: (mode: SyncMode, intervalMinutes?: number) => void | Promise<void>;
  /** Pushes everything queued right now, whatever the mode. */
  onSyncNow: () => void;
  pendingCount: number;
}

/** The intervals worth offering. Anything finer is what `auto` already is. */
const INTERVALS = [5, 15, 30, 60] as const;

const MODES: { value: SyncMode; label: string; blurb: string }[] = [
  {
    value: "auto",
    label: "Automatically",
    blurb: "A few seconds after you stop typing. Recommended.",
  },
  {
    value: "interval",
    label: "On a timer",
    blurb: "One commit per stretch of writing, however much you wrote.",
  },
  {
    value: "manual",
    label: "Only when I ask",
    blurb: "Nothing leaves this device until you press sync.",
  },
];

/**
 * How eagerly this workspace pushes to GitHub.
 *
 * Auto is the default and stays the default — the app's whole promise is that
 * you do not have to think about saving. The other two exist because the commit
 * log is a real artefact that other people read: writing in a colleague's
 * repository, thirty automatic commits titled "Update notes.md" is noise, and
 * having to open GitHub to squash them afterwards is worse.
 *
 * Whatever the mode, edits are written to this device immediately. The choice
 * is only about when they leave it, which is what the footnote says out loud —
 * people reasonably read "manual sync" as "unsaved work".
 */
export function SyncModeMenu({ preference, onChange, onSyncNow, pendingCount }: SyncModeMenuProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  // Click-away and Escape, matching the branch menu beside it.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const summary =
    preference.mode === "auto"
      ? "Sync: automatic"
      : preference.mode === "interval"
        ? `Sync: every ${preference.intervalMinutes}m`
        : "Sync: manual";

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        title="When changes are pushed to GitHub"
        className="flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[var(--fl-muted)] transition-colors hover:bg-[var(--fl-elevated)] hover:text-[var(--fl-text)]"
      >
        <SyncGlyph />
        <span className="hidden truncate sm:inline">{summary}</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute bottom-full left-0 z-40 mb-1.5 w-[19rem] overflow-hidden rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-1 shadow-[var(--fl-shadow-lg)]"
        >
          <p className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--fl-muted)]">
            Push to GitHub
          </p>

          <ul>
            {MODES.map((option) => (
              <li key={option.value}>
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={preference.mode === option.value}
                  onClick={() => {
                    void onChange(option.value);
                    if (option.value !== "interval") setOpen(false);
                  }}
                  className="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-[var(--fl-elevated)]"
                >
                  <span
                    aria-hidden="true"
                    className={`mt-[3px] h-3 w-3 shrink-0 rounded-full border ${
                      preference.mode === option.value
                        ? "border-[var(--fl-accent)] bg-[var(--fl-accent)] shadow-[inset_0_0_0_2px_var(--fl-surface)]"
                        : "border-[var(--fl-border-strong)]"
                    }`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="text-[12.5px] font-medium text-[var(--fl-text)]">
                        {option.label}
                      </span>
                      {option.value === "auto" && (
                        <span className="rounded bg-[var(--fl-accent-soft)] px-1 py-px text-[9.5px] font-semibold uppercase tracking-wide text-[var(--fl-accent)]">
                          Default
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-[11.5px] leading-relaxed text-[var(--fl-muted)]">
                      {option.blurb}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {preference.mode === "interval" && (
            <div className="flex flex-wrap items-center gap-1 border-t border-[var(--fl-border)] px-2.5 py-2">
              <span className="mr-1 text-[11.5px] text-[var(--fl-muted)]">Every</span>
              {INTERVALS.map((minutes) => (
                <button
                  key={minutes}
                  type="button"
                  onClick={() => void onChange("interval", minutes)}
                  aria-pressed={preference.intervalMinutes === minutes}
                  className={`rounded-md px-2 py-1 text-[11.5px] font-medium transition-colors ${
                    preference.intervalMinutes === minutes
                      ? "bg-[var(--fl-accent)] text-[var(--fl-accent-contrast)]"
                      : "text-[var(--fl-muted)] hover:bg-[var(--fl-elevated)] hover:text-[var(--fl-text)]"
                  }`}
                >
                  {minutes}m
                </button>
              ))}
            </div>
          )}

          <div className="border-t border-[var(--fl-border)] px-2.5 py-2">
            <p className="text-[11.5px] leading-relaxed text-[var(--fl-muted)]">
              Every mode saves to this device the moment you type. This only changes when those
              saves become commits.
            </p>

            {preference.mode !== "auto" && (
              <button
                type="button"
                onClick={() => {
                  onSyncNow();
                  setOpen(false);
                }}
                className="mt-2 w-full rounded-md bg-[var(--fl-accent)] px-2 py-1.5 text-[12px] font-semibold text-[var(--fl-accent-contrast)] transition-colors hover:bg-[var(--fl-accent-hover)] disabled:opacity-40"
                disabled={pendingCount === 0}
              >
                {pendingCount === 0
                  ? "Nothing to push"
                  : `Push ${pendingCount} change${pendingCount === 1 ? "" : "s"} now`}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SyncGlyph() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="h-3.5 w-3.5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M13.5 7a5.5 5.5 0 0 0-9.9-3.1M2.5 9a5.5 5.5 0 0 0 9.9 3.1" />
      <path d="M13.5 3.5V7H10M2.5 12.5V9H6" />
    </svg>
  );
}
