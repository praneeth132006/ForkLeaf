import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import type { Extension } from "@codemirror/state";

/**
 * CodeMirror theming for the source editor.
 *
 * Colours come from CSS custom properties so the editor follows the app's
 * light/dark theme without CodeMirror needing to be reconfigured — changing the
 * `data-theme` attribute on the document is enough.
 */

const base = EditorView.theme({
  "&": {
    color: "var(--color-ink)",
    backgroundColor: "transparent",
    fontSize: "15px",
    height: "100%",
  },
  ".cm-content": {
    fontFamily: "var(--font-mono, ui-monospace, 'SF Mono', Menlo, monospace)",
    padding: "1rem 0 40vh",
    caretColor: "var(--color-signal-amber)",
    lineHeight: "1.7",
  },
  ".cm-scroller": {
    fontFamily: "inherit",
    overflow: "auto",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-gutters": {
    backgroundColor: "transparent",
    color: "var(--color-mist)",
    border: "none",
    paddingRight: "0.5rem",
  },
  ".cm-activeLine": { backgroundColor: "var(--color-chalk)" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--color-ink)" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": {
    backgroundColor: "color-mix(in srgb, var(--color-trail-teal) 25%, transparent)",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--color-signal-amber)",
    borderLeftWidth: "2px",
  },
  ".cm-tooltip": {
    backgroundColor: "var(--color-surface)",
    border: "1px solid var(--color-border)",
    borderRadius: "8px",
    boxShadow: "0 8px 24px rgb(0 0 0 / 0.12)",
    overflow: "hidden",
  },
  ".cm-tooltip.cm-tooltip-autocomplete > ul": {
    fontFamily: "var(--font-sans, ui-sans-serif, system-ui, sans-serif)",
    maxHeight: "18rem",
  },
  ".cm-tooltip.cm-tooltip-autocomplete > ul > li": {
    padding: "0.4rem 0.7rem",
    display: "flex",
    alignItems: "baseline",
    gap: "0.5rem",
  },
  ".cm-tooltip-autocomplete ul li[aria-selected]": {
    backgroundColor: "var(--color-trail-teal)",
    color: "var(--color-paper)",
  },
  ".cm-completionLabel": { fontWeight: "500" },
  ".cm-completionDetail": {
    fontStyle: "normal",
    opacity: 0.7,
    fontSize: "0.85em",
    marginLeft: "auto",
    fontFamily: "var(--font-mono, ui-monospace, monospace)",
  },
  // Diagnostics: a soft underline rather than a red block, since a syntax error
  // is the normal state while a diagram is being typed.
  ".cm-lintRange-error": {
    backgroundImage: "none",
    borderBottom: "2px wavy var(--color-ember)",
  },
  ".cm-diagnostic-error": { borderLeftColor: "var(--color-ember)" },
});

/** Syntax colours for markdown and embedded code. */
const highlight = HighlightStyle.define([
  { tag: tags.heading1, fontSize: "1.5em", fontWeight: "700", color: "var(--color-ink)" },
  { tag: tags.heading2, fontSize: "1.3em", fontWeight: "700", color: "var(--color-ink)" },
  { tag: tags.heading3, fontSize: "1.15em", fontWeight: "650", color: "var(--color-ink)" },
  {
    tag: [tags.heading4, tags.heading5, tags.heading6],
    fontWeight: "650",
    color: "var(--color-ink)",
  },
  { tag: tags.strong, fontWeight: "700", color: "var(--color-ink)" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through", opacity: 0.7 },
  { tag: tags.link, color: "var(--color-trail-teal)", textDecoration: "underline" },
  { tag: tags.url, color: "var(--color-trail-teal)", opacity: 0.8 },
  { tag: tags.quote, color: "var(--color-mist)", fontStyle: "italic" },
  { tag: tags.monospace, color: "var(--color-trail-teal)" },
  { tag: tags.list, color: "var(--color-signal-amber)" },
  // Markdown punctuation (the ## and ** themselves) is dimmed so the prose reads
  // cleanly while the syntax stays visible and editable.
  { tag: tags.processingInstruction, color: "var(--color-mist)", opacity: 0.6 },
  { tag: tags.comment, color: "var(--color-mist)", fontStyle: "italic" },
  { tag: tags.keyword, color: "var(--color-signal-amber)" },
  { tag: tags.string, color: "var(--color-trail-teal)" },
  { tag: tags.number, color: "var(--color-ember)" },
  { tag: [tags.className, tags.typeName], color: "var(--color-signal-amber)" },
  { tag: tags.variableName, color: "var(--color-ink)" },
]);

export function editorTheme(): Extension {
  return [base, syntaxHighlighting(highlight)];
}
