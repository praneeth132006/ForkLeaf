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
import {
  history,
  defaultKeymap,
  historyKeymap,
  indentWithTab,
  undo as cmUndo,
  redo as cmRedo,
  undoDepth,
  redoDepth,
} from "@codemirror/commands";
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
import { imagesFrom } from "./images";
import { markdownSlashSource } from "./codemirror/slash-markdown";
import type { ActionContext } from "./insert-actions";

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
  /**
   * Handles images pasted or dropped into the raw markdown.
   *
   * Raw markdown is still markdown: dropping a screenshot into it should write
   * an `![](…)` for you rather than doing nothing, which is what happened
   * before and read as the editor being broken.
   */
  onImageFiles?: (files: File[], insert: (markdown: string) => void) => void;
  /**
   * What the app can do for the `/` menu that markdown cannot.
   *
   * Without this, `/image` in the source view typed a literal
   * `![](https://)` while the same entry in rich text opened a picker — the
   * kind of difference that makes one of the two views feel broken.
   */
  slashActions?: ActionContext;
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
  /**
   * Wraps the selection in `before`/`after`, or unwraps it if it already is.
   *
   * This is what makes a formatting button mean the same thing in raw markdown
   * as it does in rich text. Inserting a bare `****` and leaving the caret in
   * the middle — which is what the toolbar used to do — ignores the text you
   * had selected, so pressing Bold with a word highlighted did not embolden
   * that word.
   */
  wrapSelection: (before: string, after?: string) => void;
  /**
   * Adds `prefix` to every selected line, or strips it if every line has it.
   *
   * Headings, quotes and list items are all line prefixes in markdown, and all
   * of them should toggle rather than stack: pressing "Heading 2" twice must
   * not leave `## ## `.
   */
  toggleLinePrefix: (prefix: string, pattern?: RegExp) => void;
  /** Indents or outdents the selected lines by two spaces, as lists nest. */
  indent: (direction: 1 | -1) => void;
  undo: () => void;
  redo: () => void;
  /** Whether there is anything to undo or redo, for the toolbar's buttons. */
  canUndo: () => boolean;
  canRedo: () => boolean;
  /** The text currently selected, empty when the selection is a caret. */
  selection: () => string;
  /** The whole line the caret is on, so a toolbar can show the block style. */
  currentLine: () => string;
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
  onImageFiles,
  slashActions,
}: SourceEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  // Keep the latest onChange in a ref: rebuilding the editor whenever the
  // parent re-renders would drop focus mid-keystroke.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onCursorChangeRef = useRef(onCursorChange);
  onCursorChangeRef.current = onCursorChange;
  const onImageFilesRef = useRef(onImageFiles);
  onImageFilesRef.current = onImageFiles;
  const slashActionsRef = useRef(slashActions);
  slashActionsRef.current = slashActions;

  /**
   * Every document this editor has reported upwards.
   *
   * The parent owns the text and hands it straight back, so our own edit
   * returns as a `value` prop a render later. Typing again before it lands
   * made that prop stale, and replacing the whole document with it dropped the
   * newer keystrokes and moved the caret — which reads as the editor
   * scrambling text while you type.
   */
  const emitted = useRef<string[]>([]);

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
          // Read through the ref so the source stays the same function for the
          // editor's whole life while still seeing the current handlers.
          ...(language === "markdown"
            ? {
                override: [markdownSlashSource(() => slashActionsRef.current ?? {})],
              }
            : {}),
        }),
        EditorState.allowMultipleSelections.of(true),
        EditorView.lineWrapping,
        ...(showLineNumbers ? [lineNumbers(), highlightActiveLineGutter(), foldGutter()] : []),
        ...(language === "markdown"
          ? [markdown({ base: markdownLanguage, codeLanguages: languages, addKeymap: true })]
          : []),
        // Accepting a completion has to outrank `defaultKeymap`, which binds
        // both of these to something else and silently won the race.
        //
        // Enter is claimed only in markdown, where the completion source is the
        // `/` block menu: every entry there was deliberately summoned, so Enter
        // meaning "accept" is what anyone would expect. The mermaid source
        // editor suggests on any word character, and taking Enter there meant a
        // newline typed after `flowchart TD` swallowed the line and pasted a
        // template over it — you could not write a diagram by hand at all.
        // Tab accepts in both, and is unambiguous in neither case.
        Prec.highest(
          keymap.of([
            ...(language === "markdown" ? [{ key: "Enter", run: acceptCompletion }] : []),
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
        EditorView.domEventHandlers({
          paste: (event, view) => {
            const files = imagesFrom(event.clipboardData);
            if (files.length === 0 || !onImageFilesRef.current) return false;

            event.preventDefault();
            onImageFilesRef.current(files, (markdown) => insertInto(view, markdown));
            return true;
          },
          drop: (event, view) => {
            const files = imagesFrom(event.dataTransfer);
            if (files.length === 0 || !onImageFilesRef.current) return false;

            event.preventDefault();
            // Drop where the pointer is, not where the caret was left.
            const at = view.posAtCoords({ x: event.clientX, y: event.clientY });
            if (at !== null) {
              view.dispatch({ selection: { anchor: at } });
            }
            onImageFilesRef.current(files, (markdown) => insertInto(view, markdown));
            return true;
          },
        }),
        EditorView.contentAttributes.of({ "aria-label": ariaLabel }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const text = update.state.doc.toString();
            emitted.current.push(text);
            // Only the recent past matters; the list would otherwise grow for
            // as long as the note stays open.
            if (emitted.current.length > 60) emitted.current.shift();
            onChangeRef.current(text);
          }

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

    // Our own edit echoing back late. The document is already at least as new
    // as this, so writing the prop over it would undo what was just typed.
    if (emitted.current.includes(value)) return;

    view.dispatch({
      changes: { from: 0, to: current.length, insert: value },
      // Clamp rather than drop the selection so switching modes or loading a
      // note keeps the caret somewhere sensible.
      selection: { anchor: Math.min(view.state.selection.main.anchor, value.length) },
    });
    // The history above describes a document that no longer exists.
    emitted.current = [];
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

      wrapSelection: (before, after = before) => {
        const view = viewRef.current;
        if (!view) return;

        const { from, to } = view.state.selection.main;
        const selected = view.state.sliceDoc(from, to);

        // Already wrapped, either inside the selection or just outside it.
        const inside =
          selected.length >= before.length + after.length &&
          selected.startsWith(before) &&
          selected.endsWith(after);

        const around =
          view.state.sliceDoc(Math.max(0, from - before.length), from) === before &&
          view.state.sliceDoc(to, Math.min(view.state.doc.length, to + after.length)) === after;

        if (inside) {
          const stripped = selected.slice(before.length, selected.length - after.length);
          view.dispatch({
            changes: { from, to, insert: stripped },
            selection: { anchor: from, head: from + stripped.length },
          });
        } else if (around) {
          view.dispatch({
            changes: [
              { from: from - before.length, to: from, insert: "" },
              { from: to, to: to + after.length, insert: "" },
            ],
            selection: { anchor: from - before.length, head: to - before.length },
          });
        } else {
          view.dispatch({
            changes: { from, to, insert: `${before}${selected}${after}` },
            // With nothing selected the caret goes between the markers, ready
            // to type; with a selection it stays around the now-wrapped text.
            selection: selected
              ? { anchor: from + before.length, head: from + before.length + selected.length }
              : { anchor: from + before.length },
          });
        }

        view.focus();
      },

      toggleLinePrefix: (prefix, pattern) => {
        const view = viewRef.current;
        if (!view) return;

        const { from, to } = view.state.selection.main;
        const first = view.state.doc.lineAt(from);
        const last = view.state.doc.lineAt(to);

        const lines = [];
        for (let n = first.number; n <= last.number; n += 1) {
          lines.push(view.state.doc.line(n));
        }

        // `pattern` describes the whole family — every heading level, say — so
        // that "Heading 2" on an existing `# ` replaces it instead of nesting.
        const match = pattern ?? new RegExp(`^${escapeRegExp(prefix)}`);
        const allHave = lines.every((line) => line.text.startsWith(prefix));

        view.dispatch({
          changes: lines.map((line) => {
            const existing = match.exec(line.text);
            const stripped = existing ? line.text.slice(existing[0].length) : line.text;
            return {
              from: line.from,
              to: line.to,
              insert: allHave ? stripped : `${prefix}${stripped}`,
            };
          }),
        });

        view.focus();
      },

      indent: (direction) => {
        const view = viewRef.current;
        if (!view) return;

        const { from, to } = view.state.selection.main;
        const first = view.state.doc.lineAt(from);
        const last = view.state.doc.lineAt(to);

        const changes = [];
        for (let n = first.number; n <= last.number; n += 1) {
          const line = view.state.doc.line(n);
          if (direction === 1) {
            changes.push({ from: line.from, insert: "  " });
          } else {
            const lead = /^ {1,2}/.exec(line.text);
            if (lead) changes.push({ from: line.from, to: line.from + lead[0].length, insert: "" });
          }
        }

        if (changes.length > 0) view.dispatch({ changes });
        view.focus();
      },

      undo: () => {
        const view = viewRef.current;
        if (!view) return;
        cmUndo(view);
        view.focus();
      },

      redo: () => {
        const view = viewRef.current;
        if (!view) return;
        cmRedo(view);
        view.focus();
      },

      canUndo: () => {
        const view = viewRef.current;
        return view ? undoDepth(view.state) > 0 : false;
      },

      canRedo: () => {
        const view = viewRef.current;
        return view ? redoDepth(view.state) > 0 : false;
      },

      selection: () => {
        const view = viewRef.current;
        if (!view) return "";
        const { from, to } = view.state.selection.main;
        return view.state.sliceDoc(from, to);
      },

      currentLine: () => {
        const view = viewRef.current;
        if (!view) return "";
        return view.state.doc.lineAt(view.state.selection.main.head).text;
      },
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

/** Escapes a literal string for use inside a regular expression. */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Replaces the selection with `text`, leaving the caret after it. */
function insertInto(view: EditorView, text: string): void {
  const { from, to } = view.state.selection.main;
  view.dispatch({
    changes: { from, to, insert: text },
    selection: { anchor: from + text.length },
    scrollIntoView: true,
  });
  view.focus();
}
