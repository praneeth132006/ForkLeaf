"use client";

import { useEffect, useState } from "react";
import { quoteFromSelection } from "@/lib/passages";

/**
 * "Discuss" beside a selection in the note.
 *
 * Select a sentence, press the button that appears under its end, and the
 * Chat tab opens with that sentence quoted, ready for a question about it —
 * the thread that follows stays attached to those words.
 *
 * Watches the document's selection rather than any one editor's, so it works
 * the same in rich text, the source view and the preview. It keeps the
 * selection alive by taking no focus: the button acts on mouse-down.
 */

interface Selected {
  quote: string;
  top: number;
  left: number;
}

/** What is selected inside `root`, and where its end is on screen. */
function readSelection(root: HTMLElement | null): Selected | null {
  if (!root) return null;
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;

  const quote = quoteFromSelection(selection.toString());
  if (!quote) return null;

  const rects = range.getClientRects();
  const last = rects[rects.length - 1] ?? range.getBoundingClientRect();
  return { quote, top: last.bottom + 6, left: last.right };
}

export function DiscussSelection({
  root,
  onDiscuss,
}: {
  /** The element the note is shown in. */
  root: HTMLElement | null;
  onDiscuss: (quote: string) => void;
}) {
  const [selected, setSelected] = useState<Selected | null>(null);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setSelected(readSelection(root)));
    };
    document.addEventListener("selectionchange", update);
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("selectionchange", update);
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [root]);

  if (!selected) return null;

  // Kept inside the window: a selection ending at the right edge would
  // otherwise put the button half off the page.
  const left = Math.max(8, Math.min(selected.left - 88, window.innerWidth - 104));
  const top = Math.min(selected.top, window.innerHeight - 40);

  return (
    <button
      type="button"
      // Mouse-down, not click: a click would move focus, and moving focus
      // ends the selection before the click lands.
      onMouseDown={(event) => {
        event.preventDefault();
        onDiscuss(selected.quote);
        setSelected(null);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onDiscuss(selected.quote);
          setSelected(null);
        }
      }}
      title="Talk about this passage with your collaborators"
      className="fixed z-30 flex items-center gap-1.5 rounded-full border border-[var(--fl-border)] bg-[var(--fl-surface)] px-2.5 py-1 text-[12px] font-medium text-[var(--fl-text)] shadow-[var(--fl-shadow-lg)] hover:bg-[var(--fl-elevated)]"
      style={{ top, left }}
    >
      <svg
        viewBox="0 0 16 16"
        className="h-3.5 w-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M2.5 4.25A1.75 1.75 0 0 1 4.25 2.5h7.5a1.75 1.75 0 0 1 1.75 1.75v5a1.75 1.75 0 0 1-1.75 1.75H7l-3 2.5V11h.25a1.75 1.75 0 0 1-1.75-1.75z" />
      </svg>
      Discuss
    </button>
  );
}
