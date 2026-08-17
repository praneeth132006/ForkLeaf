"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import type { EditorViewMode } from "@forkleaf/types";
import { WysiwygEditor } from "./WysiwygEditor";
import { SourceEditor, type SourceEditorHandle } from "./SourceEditor";
import { Preview } from "./Preview";
import { EditorToolbar } from "./EditorToolbar";
import { insertActionsFor, runRichAction, runSourceAction } from "./insert-actions";

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
  /** Hides the insert toolbar, for embedded or read-mostly surfaces. */
  hideToolbar?: boolean;
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
 *
 * The insert toolbar sits above all three and dispatches to whichever surface
 * is live, so "insert a diagram" is the same button whether you are in rich
 * text or staring at raw markdown.
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
  hideToolbar = false,
}: MarkdownEditorProps) {
  // Split view: the divider position, as a percentage of the container width.
  const [splitRatio, setSplitRatio] = useState(50);
  const [dragging, setDragging] = useState(false);

  // The live surfaces, so the toolbar can act on whichever one is mounted.
  const [tiptap, setTiptap] = useState<Editor | null>(null);
  const sourceHandle = useRef<SourceEditorHandle | null>(null);
  // Re-render when the rich editor's marks change, so the B/I/S buttons show
  // the state of the text under the caret rather than a stale one.
  const [, forceRender] = useState(0);

  const handleTiptapReady = useCallback((editor: Editor | null) => {
    setTiptap(editor);
    if (!editor) return;

    const bump = () => forceRender((n) => n + 1);
    editor.on("selectionUpdate", bump);
    editor.on("transaction", bump);
  }, []);

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

  const runAction = useCallback(
    (id: string) => {
      if (mode === "wysiwyg") {
        if (tiptap) runRichAction(tiptap, id);
      } else {
        runSourceAction(sourceHandle.current, id);
      }
    },
    [mode, tiptap],
  );

  const isRich = mode === "wysiwyg";
  // Rich text and raw Markdown can hold different things, so the toolbar shows
  // only what the surface underneath it can actually apply.
  const actions = useMemo(() => insertActionsFor(isRich ? "rich" : "source"), [isRich]);

  return (
    <div className={`flex min-h-0 flex-col ${className ?? ""}`}>
      {!hideModeSwitcher && onModeChange && (
        <div className="mb-3 flex justify-end">
          <div
            role="tablist"
            aria-label="Editor mode"
            className="flex shrink-0 rounded-lg border border-[var(--fl-border)] p-0.5"
          >
            {MODES.map((option) => (
              <button
                key={option.value}
                type="button"
                role="tab"
                aria-selected={mode === option.value}
                title={option.hint}
                onClick={() => onModeChange(option.value)}
                className={`rounded-[6px] px-3 py-1 text-[13px] font-medium transition-colors ${
                  mode === option.value
                    ? "bg-[var(--fl-accent)] text-[var(--fl-accent-contrast)]"
                    : "text-[var(--fl-muted)] hover:text-[var(--fl-text)]"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {!hideToolbar && (
        <EditorToolbar
          actions={actions}
          onRun={runAction}
          disabled={isRich && !tiptap}
          {...(isRich && tiptap
            ? {
                format: {
                  isActive: (mark: string) => tiptap.isActive(mark),
                  toggle: (mark: string) => {
                    const chain = tiptap.chain().focus();
                    switch (mark) {
                      case "bold":
                        chain.toggleBold().run();
                        break;
                      case "italic":
                        chain.toggleItalic().run();
                        break;
                      case "strike":
                        chain.toggleStrike().run();
                        break;
                      case "code":
                        chain.toggleCode().run();
                        break;
                    }
                  },
                },
              }
            : {})}
        />
      )}

      {mode === "wysiwyg" && (
        <div className="relative min-h-0 flex-1 overflow-y-auto">
          <WysiwygEditor
            value={value}
            onChange={onChange}
            onReady={handleTiptapReady}
            {...(placeholder ? { placeholder } : {})}
            className="relative mx-auto w-full max-w-3xl px-1 py-8 pb-32"
          />
        </div>
      )}

      {mode === "source" && (
        <div className="mx-auto min-h-0 w-full max-w-3xl flex-1 overflow-hidden">
          <SourceEditor
            value={value}
            onChange={onChange}
            handleRef={sourceHandle}
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
              handleRef={sourceHandle}
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
            className={`w-px shrink-0 cursor-col-resize bg-[var(--fl-border)] transition-colors hover:bg-[var(--fl-accent)] focus:bg-[var(--fl-accent)] focus:outline-none ${
              dragging ? "bg-[var(--fl-accent)]" : ""
            }`}
          />

          <div className="min-w-0 flex-1 overflow-y-auto bg-[var(--fl-surface)] px-8 py-8">
            <Preview markdown={value} {...(theme ? { theme } : {})} className="mx-auto max-w-2xl" />
          </div>
        </div>
      )}
    </div>
  );
}
