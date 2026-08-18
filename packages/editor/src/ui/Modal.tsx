"use client";

import React, { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export interface ModalProps {
  title: string;
  /** Optional line under the title, for orientation rather than decoration. */
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Rendered on the right of the header, next to the close button. */
  actions?: React.ReactNode;
  /** Tailwind max-width class. Diagram work needs the room; prompts do not. */
  widthClassName?: string;
  /**
   * Fills the viewport instead of sitting in the middle of it.
   *
   * For work where the available area *is* the feature — drawing a diagram on
   * a canvas is the obvious case, and a centred dialog with a 640px canvas is
   * the reason it felt cramped.
   */
  fullScreen?: boolean;
}

/**
 * A focused overlay for work that does not belong inline in the document.
 *
 * The diagram studio used to render *inside* the note, which meant opening a
 * diagram shoved the surrounding paragraphs down the page and handed a
 * 600px-tall template gallery to someone who had just pressed Enter. Editing a
 * diagram is a mode, so it gets a modal.
 *
 * Portalled to `document.body` so no `overflow: hidden` ancestor in the editor
 * layout can clip it.
 */
export function Modal({
  title,
  subtitle,
  onClose,
  children,
  actions,
  widthClassName = "max-w-5xl",
  fullScreen = false,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Escape closes, and focus is trapped inside the panel and then restored —
  // without this, tabbing out of a modal lands the caret back in the document
  // underneath it, which is where the diagram you are editing lives.
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // An open suggestion list owns Escape first. This handler is bound in
        // the capture phase so it can trap Tab, which also meant it beat
        // CodeMirror to Escape: typing Mermaid, getting a completion popup and
        // pressing the key that dismisses one everywhere else closed the whole
        // diagram studio instead. Let the inner surface have it, and the next
        // Escape — with no popup left open — closes the dialog.
        if (panelRef.current?.querySelector(".cm-tooltip-autocomplete")) return;

        event.stopPropagation();
        onClose();
        return;
      }

      if (event.key !== "Tab") return;

      const panel = panelRef.current;
      if (!panel) return;

      const focusable = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    document.addEventListener("keydown", handleKeyDown, true);

    // The page behind must not scroll while a modal is open.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    panelRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      document.body.style.overflow = previousOverflow;
      previouslyFocused.current?.focus?.();
    };
  }, [handleKeyDown]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm ${
        fullScreen ? "p-0 sm:p-3" : "p-4"
      }`}
      onMouseDown={(event) => {
        // Only a click on the backdrop itself closes — a drag that starts
        // inside the panel and ends outside it must not.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`flex w-full flex-col overflow-hidden border border-[var(--fl-border)] bg-[var(--fl-bg)] shadow-[0_32px_80px_-24px_rgba(0,0,0,0.6)] outline-none ${
          fullScreen
            ? "h-full max-h-full rounded-none sm:rounded-2xl"
            : `max-h-[90vh] rounded-2xl ${widthClassName}`
        }`}
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-[var(--fl-border)] px-5 py-3.5">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[15px] font-semibold text-[var(--fl-text)]">{title}</h2>
            {subtitle && (
              <p className="truncate text-[12.5px] text-[var(--fl-muted)]">{subtitle}</p>
            )}
          </div>

          {actions}

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            title="Close (Esc)"
            className="shrink-0 rounded-lg p-1.5 text-[var(--fl-muted)] transition-colors hover:bg-[var(--fl-elevated)] hover:text-[var(--fl-text)]"
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
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
