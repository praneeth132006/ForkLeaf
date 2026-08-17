"use client";

import React, { useEffect, useRef } from "react";

export interface DialogProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}

/**
 * A modal dialog with the accessibility behaviour people expect:
 * Escape closes it, focus is trapped inside while it is open, and focus returns
 * to whatever opened it on close.
 */
export function Dialog({ title, onClose, children, wide = false }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null;

    // Move focus into the dialog so a keyboard user is not left outside it.
    // An element marked `autofocus` wins: otherwise focus lands on the close
    // button and typing goes nowhere, which is worse than no focus at all.
    const panel = panelRef.current;
    const preferred =
      panel?.querySelector<HTMLElement>("[autofocus]") ??
      panel?.querySelector<HTMLElement>(
        'input, select, textarea, [href], button, [tabindex]:not([tabindex="-1"])',
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
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
        className={`flex max-h-[85vh] w-full flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl ${
          wide ? "max-w-3xl" : "max-w-md"
        }`}
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <h2 className="font-serif text-lg font-semibold text-[var(--color-ink)]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-[var(--color-mist)] hover:bg-[var(--color-chalk)] hover:text-[var(--color-ink)]"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}
