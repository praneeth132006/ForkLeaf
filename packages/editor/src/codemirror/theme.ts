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
    color: "var(--fl-text)",
    backgroundColor: "transparent",
    fontSize: "15px",
    height: "100%",
  },
  ".cm-content": {
    fontFamily: "var(--font-mono, ui-monospace, 'SF Mono', Menlo, monospace)",
    padding: "1rem 0 40vh",
    caretColor: "var(--fl-accent)",
    lineHeight: "1.7",
  },
  ".cm-scroller": {
    fontFamily: "inherit",
    overflow: "auto",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-gutters": {
    backgroundColor: "transparent",
    color: "var(--fl-muted)",
    border: "none",
    paddingRight: "0.5rem",
  },
  ".cm-activeLine": { backgroundColor: "var(--fl-elevated)" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--fl-text)" },
  // A selection you cannot see is not a selection. CodeMirror paints its own
  // rather than using the browser's, so it needs the same colour the rest of
  // the app uses — and it needs it on the unfocused case too, which is what
  // you are looking at every time you reach for a menu mid-selection.
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": {
    backgroundColor: "var(--fl-selection)",
  },
  "&:not(.cm-focused) .cm-selectionBackground": {
    backgroundColor: "var(--fl-selection)",
    opacity: "0.7",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--fl-accent)",
    borderLeftWidth: "2px",
  },
  ".cm-tooltip": {
    backgroundColor: "var(--fl-surface)",
    border: "1px solid var(--fl-border)",
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
    backgroundColor: "var(--fl-accent)",
    color: "var(--fl-accent-contrast)",
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
    borderBottom: "2px wavy var(--fl-danger)",
  },
  ".cm-diagnostic-error": { borderLeftColor: "var(--fl-danger)" },
});

/**
 * Syntax colours for markdown and embedded code.
 *
 * Deliberately no font sizes. This is the source view: `# Title` is two
 * characters and a word, and blowing it up to 1.5em made the raw markdown
 * ragged, pushed the line numbers out of alignment with the text they number,
 * and left people wondering why a heading looked different here than in the
 * fenced block below it. Headings are still obvious — they are the bold ones —
 * and the actual heading size belongs to the rendered output, which is what
 * the preview and the rich-text view are for.
 */
const highlight = HighlightStyle.define([
  { tag: tags.heading1, fontWeight: "700", color: "var(--fl-text)" },
  { tag: tags.heading2, fontWeight: "700", color: "var(--fl-text)" },
  { tag: tags.heading3, fontWeight: "650", color: "var(--fl-text)" },
  {
    tag: [tags.heading4, tags.heading5, tags.heading6],
    fontWeight: "650",
    color: "var(--fl-text)",
  },
  { tag: tags.strong, fontWeight: "700", color: "var(--fl-text)" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through", opacity: 0.7 },
  { tag: tags.link, color: "var(--fl-accent)", textDecoration: "underline" },
  { tag: tags.url, color: "var(--fl-accent)", opacity: 0.8 },
  { tag: tags.quote, color: "var(--fl-muted)", fontStyle: "italic" },
  { tag: tags.monospace, color: "var(--fl-accent)" },
  { tag: tags.list, color: "var(--fl-accent)" },
  // Markdown punctuation (the ## and ** themselves) is dimmed so the prose reads
  // cleanly while the syntax stays visible and editable.
  { tag: tags.processingInstruction, color: "var(--fl-muted)", opacity: 0.6 },
  { tag: tags.comment, color: "var(--fl-muted)", fontStyle: "italic" },
  { tag: tags.keyword, color: "var(--fl-accent)" },
  { tag: tags.string, color: "var(--fl-accent)" },
  { tag: tags.number, color: "var(--fl-danger)" },
  { tag: [tags.className, tags.typeName], color: "var(--fl-text)" },
  { tag: tags.variableName, color: "var(--fl-text)" },
]);

export function editorTheme(): Extension {
  return [base, syntaxHighlighting(highlight)];
}
