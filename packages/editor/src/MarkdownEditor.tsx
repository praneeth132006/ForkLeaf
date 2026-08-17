"use client";

import React, { useCallback, useMemo, useState } from "react";
import type { EditorViewMode } from "@mdnotion/types";
import { WysiwygEditor } from "./WysiwygEditor";
import { SourceEditor } from "./SourceEditor";
import { Preview } from "./Preview";

export interface MarkdownEditorProps {
  value: string;
  onChange: (markdown: string) => void;
  mode: EditorViewMode;
  onModeChange?: (mode: EditorViewMode) => void;
  /** Omit to follow the app's current theme. */
  theme?: "light" | "dark";
  placeholder?: string;
  className?: string;
  /** Hides the built-in mode switcher when the app renders its own. */
  hideModeSwitcher?: boolean;
}

const MODES: { value: EditorViewMode; label: string; hint: string }[] = [
  { value: "wysiwyg", label: "Rich text", hint: "Format as you type" },
  { value: "split", label: "Split", hint: "Markdown source beside a live preview" },
  { value: "source", label: "Source", hint: "Raw markdown only" },
];

/**
 * The note editor, in whichever mode the user prefers for this document.
 *
 * The three modes are views over the same markdown string, so switching never
 * transforms or reformats the file — which matters when the file is a real
 * commit in the user's own repository.
 */
export function MarkdownEditor({
  value,
  onChange,
  mode,
  onModeChange,
  theme,
  placeholder,
  className,
  hideModeSwitcher = false,
}: MarkdownEditorProps) {
  // Split view: the divider position, as a percentage of the container width.
  const [splitRatio, setSplitRatio] = useState(50);
  const [dragging, setDragging] = useState(false);

  const handleDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const container = event.currentTarget.parentElement;
    if (!container) return;

    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);

    const onMove = (moveEvent: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const ratio = ((moveEvent.clientX - rect.left) / rect.width) * 100;
      // Clamped so neither pane can be dragged shut.
      setSplitRatio(Math.min(80, Math.max(20, ratio)));
    };

    const onUp = () => {
      setDragging(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, []);

  const switcher = useMemo(() => {
    if (hideModeSwitcher || !onModeChange) return null;

    return (
      <div
        role="tablist"
        aria-label="Editor mode"
        className="flex shrink-0 rounded-md border border-[var(--color-border)] p-0.5"
      >
        {MODES.map((option) => (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={mode === option.value}
            title={option.hint}
            onClick={() => onModeChange(option.value)}
            className={`rounded px-2.5 py-1 text-xs font-medium transition ${
              mode === option.value
                ? "bg-[var(--color-trail-teal)] text-[var(--color-paper)]"
                : "text-[var(--color-mist)] hover:text-[var(--color-ink)]"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    );
  }, [mode, onModeChange, hideModeSwitcher]);

  return (
    <div className={`flex min-h-0 flex-col ${className ?? ""}`}>
      {switcher && <div className="mb-3 flex justify-end">{switcher}</div>}

      {mode === "wysiwyg" && (
        <div className="relative min-h-0 flex-1 overflow-y-auto">
          <WysiwygEditor
            value={value}
            onChange={onChange}
            {...(placeholder ? { placeholder } : {})}
            className="relative mx-auto w-full max-w-3xl px-1 pb-32"
          />
        </div>
      )}

      {mode === "source" && (
        <div className="mx-auto min-h-0 w-full max-w-3xl flex-1 overflow-hidden">
          <SourceEditor
            value={value}
            onChange={onChange}
            {...(placeholder ? { placeholder } : {})}
            showLineNumbers
          />
        </div>
      )}

      {mode === "split" && (
        <div className="relative flex min-h-0 flex-1 overflow-hidden">
          <div className="min-w-0 overflow-hidden" style={{ width: `${splitRatio}%` }}>
            <SourceEditor
              value={value}
              onChange={onChange}
              {...(placeholder ? { placeholder } : {})}
              showLineNumbers
              className="h-full w-full"
            />
          </div>

          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize panes"
            tabIndex={0}
            onPointerDown={handleDrag}
            onKeyDown={(event) => {
              // Keyboard resizing, so the divider is not mouse-only.
              if (event.key === "ArrowLeft") setSplitRatio((r) => Math.max(20, r - 5));
              if (event.key === "ArrowRight") setSplitRatio((r) => Math.min(80, r + 5));
            }}
            className={`w-1 shrink-0 cursor-col-resize bg-[var(--color-border)] transition-colors hover:bg-[var(--color-trail-teal)] focus:bg-[var(--color-trail-teal)] focus:outline-none ${
              dragging ? "bg-[var(--color-trail-teal)]" : ""
            }`}
          />

          <div className="min-w-0 flex-1 overflow-y-auto bg-[var(--color-paper)] px-6 py-4">
            <Preview markdown={value} {...(theme ? { theme } : {})} className="mx-auto max-w-2xl" />
          </div>
        </div>
      )}
    </div>
  );
}
