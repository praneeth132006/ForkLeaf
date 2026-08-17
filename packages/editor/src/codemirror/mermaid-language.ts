import type {
  CompletionContext,
  CompletionResult,
  Completion as CmCompletion,
} from "@codemirror/autocomplete";
import { linter, type Diagnostic } from "@codemirror/lint";
import { snippetCompletion } from "@codemirror/autocomplete";
import type { Extension } from "@codemirror/state";
import { completionsFor, detectKind, type DiagramKind } from "@forkleaf/diagrams";

/**
 * Mermaid language support for CodeMirror.
 *
 * This is the part that makes diagrams "easy": autocomplete that knows which
 * diagram type you are writing, and errors that underline the offending line
 * with an explanation rather than a parser dump.
 */

/**
 * Converts our snippet syntax (`${1:label}`) into CodeMirror's (`#{label}`),
 * so tab stops work in the editor.
 */
function toCodeMirrorSnippet(snippet: string): string {
  return snippet.replace(
    /\$\{\d+:([^}]*)\}/g,
    (_match, placeholder: string) => `#{${placeholder}}`,
  );
}

/** Builds the completion list for whichever diagram type is being written. */
export function mermaidCompletions(getKind: () => DiagramKind | null) {
  return (context: CompletionContext): CompletionResult | null => {
    const word = context.matchBefore(/[\w-]*/);
    // Only fire on an explicit request when there is nothing typed yet,
    // otherwise the list pops up constantly and gets in the way.
    if (!word || (word.from === word.to && !context.explicit)) return null;

    const options: CmCompletion[] = completionsFor(getKind()).map((completion, index) =>
      snippetCompletion(toCodeMirrorSnippet(completion.snippet), {
        label: completion.label,
        detail: completion.detail,
        type: completion.section === "Nodes" ? "class" : "keyword",
        // Preserve the curated order rather than letting it sort alphabetically.
        boost: 100 - index,
      }),
    );

    return { from: word.from, options, validFor: /^[\w-]*$/ };
  };
}

/**
 * Surfaces the current diagram error as a CodeMirror diagnostic.
 *
 * The error is supplied by the preview (which is the thing actually calling
 * mermaid), so the linter never parses anything itself — it just draws.
 */
export function mermaidLinter(
  getError: () => { message: string; line: number | null; hint: string | null } | null,
): Extension {
  return linter(
    (view) => {
      const error = getError();
      if (!error) return [];

      const doc = view.state.doc;
      // With no line number, underline the whole document rather than guessing.
      const line = error.line !== null && error.line <= doc.lines ? doc.line(error.line) : null;

      const diagnostic: Diagnostic = {
        from: line ? line.from : 0,
        to: line ? line.to : Math.min(doc.length, doc.line(1).to),
        severity: "error",
        message: error.hint ? `${error.message}\n\n${error.hint}` : error.message,
      };

      return [diagnostic];
    },
    { delay: 400 },
  );
}

/** Re-exported so callers do not need a direct dependency on the diagrams package. */
export { detectKind };
