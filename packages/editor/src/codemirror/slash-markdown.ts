import type { CompletionContext, CompletionResult, Completion } from "@codemirror/autocomplete";
import type { EditorView } from "@codemirror/view";
import { filterInsertActions, type InsertDefinition } from "../insert-actions";

/**
 * Slash commands for the raw-Markdown editor.
 *
 * `/` opened a block menu in the rich-text editor but did nothing in Split or
 * Source view, so the same keystroke silently meant two different things
 * depending on which tab you were on.
 *
 * The list is not defined here — it comes from `insert-actions`, the same
 * source the toolbar and the rich-text slash menu read. That is deliberate:
 * this file previously carried its own parallel copy of the snippets, which is
 * exactly the arrangement where one list quietly grows an item the other never
 * gets.
 *
 * Implemented as a CodeMirror completion source rather than a bespoke popup so
 * it inherits arrow-key navigation, Enter to accept, Escape to dismiss, and the
 * existing tooltip theming for free.
 */

/**
 * Applies a definition in place of the typed `/query`.
 *
 * An explicit `apply` rather than letting CodeMirror splice the label in,
 * because the inserted text and the searchable label are different things —
 * you type "/diagram" and get a fenced mermaid block.
 */
function applyDefinition(definition: InsertDefinition) {
  return (view: EditorView, _completion: Completion, from: number, to: number) => {
    const { text, cursor } = definition.markdown;

    view.dispatch({
      changes: { from, to, insert: text },
      selection: { anchor: from + (cursor ?? text.length) },
      scrollIntoView: true,
    });
  };
}

/**
 * Completion source that fires on a `/` at the start of a line or after
 * whitespace — never mid-word, so URLs and file paths are left alone.
 */
export function markdownSlashCommands(context: CompletionContext): CompletionResult | null {
  const match = context.matchBefore(/\/[a-zA-Z0-9]*/);
  if (!match) return null;

  // An explicit invocation (Ctrl-Space) should still open on a bare slash;
  // typing should not, or every path separator would pop the menu.
  if (match.from === match.to && !context.explicit) return null;

  const line = context.state.doc.lineAt(match.from);
  const charBefore =
    match.from > line.from ? context.state.sliceDoc(match.from - 1, match.from) : "";
  if (charBefore && !/\s/.test(charBefore)) return null;

  // Filtered here rather than by CodeMirror, which only scores against the
  // visible label — that would stop "/erd" or "/flowchart" from finding
  // "Diagram", the single most useful entry in the list.
  const matches = filterInsertActions(match.text.slice(1), "source");
  if (matches.length === 0) return null;

  return {
    from: match.from,
    // Keeps the menu open while more of the query is typed instead of
    // re-querying the source on every keystroke.
    validFor: /^\/[a-zA-Z0-9]*$/,
    filter: false,
    options: matches.map((definition) => ({
      label: `/${definition.label}`,
      detail: detailFor(definition),
      info: definition.hint,
      type: "keyword",
      apply: applyDefinition(definition),
    })),
  };
}

/**
 * The short right-hand hint in the completion row: the literal Markdown the
 * entry produces, which teaches the syntax as a side effect of using the menu.
 */
function detailFor(definition: InsertDefinition): string {
  const firstLine = definition.markdown.text.split("\n")[0] ?? "";
  const trimmed = firstLine.trim();
  return trimmed.length > 0 && trimmed.length <= 12 ? trimmed : "";
}
