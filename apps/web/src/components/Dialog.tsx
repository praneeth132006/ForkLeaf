"use client";

import React, { useEffect, useRef } from "react";

export interface DialogProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
  /** Optional line under the title, for orientation. */
  subtitle?: string;
}

/**
 * A modal dialog with the accessibility behaviour people expect:
 * Escape closes it, focus is trapped inside while it is open, and focus returns
 * to whatever opened it on close.
 */
export function Dialog({ title, subtitle, onClose, children, wide = false }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null;

    // Move focus into the dialog so a keyboard user is not left outside it,
    // and specifically onto the field they came here to type in.
    //
    // This used to look for `[autofocus]`, which never matched: React applies
    // `autoFocus` by calling `.focus()` itself and does not leave the attribute
    // in the DOM, so the query returned null on every dialog. Focus then fell
    // through to the first focusable element in the whole panel — the close
    // button in the header, which precedes the content — and the effect below
    // ran after React's own autofocus, so it took focus back off the input.
    //
    // The cost was not just a missing cursor. With the close button focused,
    // Enter dismissed the dialog, so "type a name and press Enter" threw the
    // name away and every folder had to be created with the mouse.
    //
    // So: search the content region only, never the header, and prefer a field
    // over a button. `data-autofocus` is the explicit override, because unlike
    // `autoFocus` it is a real attribute that survives into the DOM.
    const panel = panelRef.current;
    const content = panel?.querySelector<HTMLElement>("[data-dialog-content]") ?? panel;
    const preferred =
      content?.querySelector<HTMLElement>("[data-autofocus]") ??
      content?.querySelector<HTMLElement>(
        'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])',
      ) ??
      content?.querySelector<HTMLElement>(
        '[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
    (preferred ?? panel)?.focus();

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") return;

      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;

      // Wrap around rather than letting focus escape to the page behind.
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      previouslyFocused.current?.focus();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`flex max-h-[85vh] w-full flex-col overflow-hidden rounded-2xl border border-[var(--fl-border)] bg-[var(--fl-surface)] shadow-[var(--fl-shadow-lg)] ${
          wide ? "max-w-3xl" : "max-w-md"
        }`}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--fl-border)] px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-[var(--fl-text)]">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[12.5px] text-[var(--fl-muted)]">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            title="Close (Esc)"
            className="-mr-1 shrink-0 rounded-lg p-1.5 text-[var(--fl-muted)] transition-colors hover:bg-[var(--fl-elevated)] hover:text-[var(--fl-text)]"
          >
            <svg
              viewBox="0 0 16 16"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
            >
              <path d="m4 4 8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>

        <div data-dialog-content className="min-h-0 flex-1 overflow-y-auto p-5">
          {children}
        </div>
      </div>
    </div>
  );
}
