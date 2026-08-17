"use client";

import React, { useEffect, useRef, useMemo } from "react";
import { EditorState, type Extension, Compartment } from "@codemirror/state";
import {
  EditorView,
  keymap,
  highlightActiveLine,
  drawSelection,
  dropCursor,
  rectangularSelection,
  highlightActiveLineGutter,
  lineNumbers,
} from "@codemirror/view";
import { history, defaultKeymap, historyKeymap, indentWithTab } from "@codemirror/commands";
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from "@codemirror/autocomplete";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { indentOnInput, bracketMatching, foldGutter, foldKeymap } from "@codemirror/language";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { lintKeymap } from "@codemirror/lint";
import { editorTheme } from "./codemirror/theme";

export interface SourceEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  showLineNumbers?: boolean;
  /** Extra CodeMirror extensions — used to add mermaid autocomplete and linting. */
  extensions?: Extension[];
  /** Language mode. Markdown by default; the diagram studio passes plain text. */
  language?: "markdown" | "plain";
  className?: string;
  autoFocus?: boolean;
  ariaLabel?: string;
}

/**
 * A CodeMirror 6 markdown editor.
 *
 * Built directly on CodeMirror rather than a React wrapper so that value
 * updates can be applied as targeted transactions. A wrapper that replaces the
 * whole document on every prop change destroys the cursor position and the undo
 * history, which is unusable in an editor that autosaves.
 */
export function SourceEditor({
  value,
  onChange,
  placeholder,
  showLineNumbers = false,
  extensions,
  language = "markdown",
  className,
  autoFocus = false,
  ariaLabel = "Markdown source",
}: SourceEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  // Keep the latest onChange in a ref: rebuilding the editor whenever the
  // parent re-renders would drop focus mid-keystroke.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Extensions supplied by the caller can change (the mermaid linter closes
  // over the current error), so they live in a compartment we can reconfigure.
  const dynamicCompartment = useMemo(() => new Compartment(), []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const state = EditorState.create({
      doc: value,
      extensions: [
        history(),
        drawSelection(),
        dropCursor(),
        rectangularSelection(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        autocompletion({ activateOnTyping: true, icons: false }),
        EditorState.allowMultipleSelections.of(true),
        EditorView.lineWrapping,
        ...(showLineNumbers ? [lineNumbers(), highlightActiveLineGutter(), foldGutter()] : []),
        ...(language === "markdown"
          ? [markdown({ base: markdownLanguage, codeLanguages: languages, addKeymap: true })]
          : []),
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...historyKeymap,
          ...foldKeymap,
          ...completionKeymap,
          ...searchKeymap,
          ...lintKeymap,
          // Tab indents rather than moving focus. Shift-Tab still escapes, and
          // the completion keymap above claims Tab first when a popup is open.
          indentWithTab,
        ]),
        editorTheme(),
        EditorView.contentAttributes.of({ "aria-label": ariaLabel }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString());
        }),
        dynamicCompartment.of(extensions ?? []),
      ],
    });

    const view = new EditorView({ state, parent: host });
    viewRef.current = view;
    if (autoFocus) view.focus();

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Deliberately built once: `value` and `extensions` are synced by the
    // effects below instead of triggering a full rebuild.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showLineNumbers, language, ariaLabel]);

  // Push external value changes in without clobbering the cursor.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const current = view.state.doc.toString();
    if (current === value) return;

    view.dispatch({
      changes: { from: 0, to: current.length, insert: value },
      // Clamp rather than drop the selection so switching modes or loading a
      // note keeps the caret somewhere sensible.
      selection: { anchor: Math.min(view.state.selection.main.anchor, value.length) },
    });
  }, [value]);

  // Swap caller extensions in place.
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: dynamicCompartment.reconfigure(extensions ?? []),
    });
  }, [extensions, dynamicCompartment]);

  return (
    <div
      ref={hostRef}
      className={className ?? "h-full w-full overflow-hidden"}
      data-placeholder={placeholder}
    />
  );
}
