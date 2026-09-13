import type { CompletionContext, CompletionResult, Completion } from "@codemirror/autocomplete";
import type { EditorView } from "@codemirror/view";
import type { ActionContext, InsertDefinition } from "../insert-actions";
import { filterSlashItems, insertTextOf, type SlashItem } from "../slash-items";

/**
 * Slash commands for the raw-Markdown editor.
 *
 * `/` opened a block menu in the rich-text editor but did nothing in Split or
 * Source view, so the same keystroke silently meant two different things
 * depending on which tab you were on.
 *
 * The list is not defined here — it comes from `slash-items`, the same source
 * the rich-text menu reads: the editor's blocks from `insert-actions` and the
 * app's tools, in the same groups. Implemented as a CodeMirror completion
 * source rather than a bespoke popup so it inherits arrow-key navigation,
 * Enter to accept, Escape to dismiss, and the tooltip theming for free.
 */

/**
 * Applies an item in place of the typed `/query`.
 *
 * An explicit `apply` rather than letting CodeMirror splice the label in,
 * because the inserted text and the searchable label are different things —
 * you type "/diagram" and get a fenced mermaid block.
 */
function applyItem(item: SlashItem, context: ActionContext) {
  return (view: EditorView, _completion: Completion, from: number, to: number) => {
    const { target } = item;

    if (target.kind === "app") {
      const text = insertTextOf(target.action);
      if (text !== null) {
        view.dispatch({
          changes: { from, to, insert: text },
          selection: { anchor: from + text.length },
          scrollIntoView: true,
        });
        return;
      }
      // A tool opens something in the app; the typed query still has to go.
      view.dispatch({ changes: { from, to, insert: "" }, selection: { anchor: from } });
      context.runExtra?.(target.action.id);
      return;
    }

    const definition = target.definition;
    // Images and links are questions for the app — it is the only thing that
    // knows whether there is a repository to upload into.
    const ask =
      (definition.id === "image" && context.requestImage) ||
      (definition.id === "link" && context.requestLink);

    if (ask) {
      view.dispatch({ changes: { from, to, insert: "" }, selection: { anchor: from } });
      ask();
      return;
    }

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
export function markdownSlashCommands(
  context: CompletionContext,
  actions: ActionContext = {},
): CompletionResult | null {
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
  // visible label — that would stop "/erd" finding "Diagram", or "/anki"
  // finding "Flashcard".
  const matches = filterSlashItems(match.text.slice(1), "source", actions.extras ?? []);
  if (matches.length === 0) return null;

  // Sections in the order their first item appears, so the best match's group
  // leads rather than whichever name sorts first.
  const ranks = new Map<string, number>();
  for (const item of matches) if (!ranks.has(item.group)) ranks.set(item.group, ranks.size);

  return {
    from: match.from,
    // Keeps the menu open while more of the query is typed instead of
    // re-querying the source on every keystroke.
    validFor: /^\/[a-zA-Z0-9]*$/,
    filter: false,
    options: matches.map((item, index) => ({
      label: `/${item.label}`,
      detail: item.target.kind === "block" ? detailFor(item.target.definition) : "",
      info: item.hint,
      type: "keyword",
      boost: -index,
      section: { name: item.group, rank: ranks.get(item.group) ?? 0 },
      apply: applyItem(item, actions),
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

/**
 * The same source, bound to what the surrounding app can do.
 *
 * CodeMirror wants a plain `(context) => result` function and keeps it for the
 * editor's whole life, so the app's capabilities are read through a getter
 * rather than captured — a handler that arrives a render later still counts,
 * and one that never arrives is correctly absent rather than a no-op stub.
 */
export function markdownSlashSource(getActions: () => ActionContext = () => ({})) {
  return (context: CompletionContext): CompletionResult | null =>
    markdownSlashCommands(context, getActions());
}
