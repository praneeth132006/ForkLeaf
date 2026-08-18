"use client";

import React, { useEffect, useRef, useMemo, useImperativeHandle } from "react";
import { EditorState, type Extension, Compartment, Prec } from "@codemirror/state";
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
  acceptCompletion,
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
import { markdownSlashCommands } from "./codemirror/slash-markdown";

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
  /** Lets a toolbar insert text at the caret instead of at the end of the file. */
  handleRef?: React.Ref<SourceEditorHandle>;
  /** Reports where the caret is, for a status bar. Both numbers are 1-based. */
  onCursorChange?: (position: CursorPosition) => void;
}

/** Caret location, in the terms a status bar uses. */
export interface CursorPosition {
  line: number;
  column: number;
}

export interface SourceEditorHandle {
  /**
   * Inserts `text` over the current selection.
   *
   * `cursorOffset` places the caret that many characters into the inserted
   * text — so a toolbar can drop in a fenced code block and leave you inside
   * it rather than after it.
   */
  insertAtCursor: (text: string, cursorOffset?: number) => void;
  focus: () => void;
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
  handleRef,
  onCursorChange,
}: SourceEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  // Keep the latest onChange in a ref: rebuilding the editor whenever the
  // parent re-renders would drop focus mid-keystroke.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onCursorChangeRef = useRef(onCursorChange);
  onCursorChangeRef.current = onCursorChange;

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
        autocompletion({
          activateOnTyping: true,
          icons: false,
          // Markdown gets the same `/` block menu as the rich-text editor, so
          // the keystroke means the same thing in every view. The diagram
          // studio passes `language="plain"` and supplies its own source.
          ...(language === "markdown" ? { override: [markdownSlashCommands] } : {}),
        }),
        EditorState.allowMultipleSelections.of(true),
        EditorView.lineWrapping,
        ...(showLineNumbers ? [lineNumbers(), highlightActiveLineGutter(), foldGutter()] : []),
        ...(language === "markdown"
          ? [markdown({ base: markdownLanguage, codeLanguages: languages, addKeymap: true })]
          : []),
        // Accepting a completion has to outrank everything else: `defaultKeymap`
        // binds Enter to "insert a newline", which silently won the race and
        // made the slash menu impossible to accept with the key every other
        // editor uses. Tab accepts too, since half of people reach for that.
        Prec.highest(
          keymap.of([
            { key: "Enter", run: acceptCompletion },
            { key: "Tab", run: acceptCompletion },
          ]),
        ),
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

          // Editing moves the caret too, so a doc change has to report as well
          // — otherwise the status bar goes stale the moment you type.
          if (update.selectionSet || update.docChanged) {
            const head = update.state.selection.main.head;
            const line = update.state.doc.lineAt(head);
            onCursorChangeRef.current?.({ line: line.number, column: head - line.from + 1 });
          }
        }),
        dynamicCompartment.of(extensions ?? []),
      ],
    });

    const view = new EditorView({ state, parent: host });
    viewRef.current = view;
    if (autoFocus) view.focus();

    // The update listener only fires on a change; without this the status bar
    // would sit empty until the reader first touched the document.
    const head = view.state.selection.main.head;
    const line = view.state.doc.lineAt(head);
    onCursorChangeRef.current?.({ line: line.number, column: head - line.from + 1 });

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

  useImperativeHandle(
    handleRef,
    (): SourceEditorHandle => ({
      insertAtCursor: (text, cursorOffset) => {
        const view = viewRef.current;
        if (!view) return;

        const { from, to } = view.state.selection.main;
        view.dispatch({
          changes: { from, to, insert: text },
          selection: { anchor: from + (cursorOffset ?? text.length) },
          scrollIntoView: true,
        });
        view.focus();
      },
      focus: () => viewRef.current?.focus(),
    }),
    [],
  );

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
