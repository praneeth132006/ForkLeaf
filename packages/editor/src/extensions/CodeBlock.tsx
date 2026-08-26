"use client";

import React, { useMemo, useState } from "react";
import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import {
  ReactNodeViewRenderer,
  NodeViewContent,
  NodeViewWrapper,
  type NodeViewProps,
} from "@tiptap/react";
import { all, createLowlight } from "lowlight";
import { OUTPUT_LANGUAGE, formatOutput, isOutput, runnerFor } from "@forkleaf/markdown-engine";

/**
 * Code blocks in the rich editor: syntax-highlighted, with the language on the
 * block itself rather than buried in the markdown source.
 *
 * The rendered preview has highlighted code for every language lowlight knows.
 * The editing surface used to have neither colour nor any way to say what
 * language a block was in — you had to switch to source view and type it after
 * the opening fence, which is not discoverable at all.
 *
 * The language lives in the `language` attribute, which is exactly what
 * tiptap-markdown writes after the ``` fence, so a block labelled here is
 * labelled on GitHub too.
 *
 * Blocks in a language something can interpret also carry a Run button. What
 * comes back is written into a plain fenced block underneath — see
 * `runnable.ts` for why the result is ordinary markdown rather than a node of
 * its own.
 */

// The full language set, matching what the preview renders with. `common` is
// 37 languages and quietly leaves anything outside it flat and grey.
const lowlight = createLowlight(all);

/**
 * The fence labels people actually write, pointed at the grammar that handles
 * them. Without these, choosing HTML would have to mean writing ```xml, and a
 * block someone tagged ```py on GitHub would come back unhighlighted.
 */
const ALIASES: Record<string, string[]> = {
  xml: ["html", "svg", "vue"],
  javascript: ["js", "jsx", "mjs", "cjs"],
  typescript: ["ts", "tsx"],
  python: ["py"],
  bash: ["sh", "zsh", "shell"],
  yaml: ["yml"],
  markdown: ["md"],
  csharp: ["cs"],
  cpp: ["c++", "cc", "hpp"],
  ruby: ["rb"],
  rust: ["rs"],
  kotlin: ["kt"],
  dockerfile: ["docker"],
  plaintext: ["text", "txt"],
};

lowlight.registerAlias(ALIASES);

/** Every name the dropdown may offer, including the aliases above. */
function isKnown(language: string): boolean {
  return lowlight.registered(language);
}

/**
 * The languages worth putting at the top of the list.
 *
 * The rest of the list follows underneath; this is about not making someone
 * scroll past a dozen things to reach TypeScript.
 */
const POPULAR = [
  "javascript",
  "typescript",
  "tsx",
  "python",
  "java",
  "go",
  "rust",
  "c",
  "cpp",
  "csharp",
  "ruby",
  "php",
  "swift",
  "kotlin",
  "sql",
  "bash",
  "json",
  "yaml",
  "html",
  "css",
  "markdown",
  "diff",
];

/**
 * Everything else the picker offers: languages, and only languages.
 *
 * lowlight ships 192 grammars and the dropdown used to list all of them, in
 * alphabetical order, so the first things under "All languages" were `1c`,
 * `abnf`, `accesslog`, `angelscript`, `arcade`, `avrasm` and `axapta` — a wall
 * of things almost nobody has written a line of, and some of them not
 * languages at all. Access logs are not a language. Neither is Asciidoc.
 *
 * So this is the long tail cut down to programming languages: things you write
 * programs in, nothing else. Build files, config formats, stylesheets, query
 * languages and markup are not here — the handful anybody actually fences in a
 * note (JSON, YAML, HTML, CSS, SQL, Markdown, diff) are already in Common
 * above, where they are reached in one scroll rather than twenty.
 *
 * A block that arrives from a repository tagged with something outside both
 * lists is still highlighted — lowlight keeps every grammar — and still shows
 * its own tag in the picker, so nothing is lost by not listing it. Adding one
 * back is one line.
 */
const MORE = [
  "clojure",
  "coffeescript",
  "crystal",
  "d",
  "dart",
  "delphi",
  "elixir",
  "elm",
  "erlang",
  "fortran",
  "fsharp",
  "groovy",
  "haskell",
  "haxe",
  "julia",
  "lisp",
  "lua",
  "matlab",
  "nim",
  "objectivec",
  "ocaml",
  "perl",
  "powershell",
  "prolog",
  "r",
  "scala",
  "scheme",
  "smalltalk",
  "tcl",
  "vala",
  "vbnet",
  "verilog",
  "vhdl",
  "x86asm",
];

/** Names lowlight knows the language by, but nobody types. */
const DISPLAY_NAMES: Record<string, string> = {
  cpp: "C++",
  csharp: "C#",
  javascript: "JavaScript",
  typescript: "TypeScript",
  tsx: "TSX / JSX",
  xml: "HTML / XML",
  php: "PHP",
  sql: "SQL",
  json: "JSON",
  yaml: "YAML",
  html: "HTML",
  css: "CSS",
  bash: "Shell",
  d: "D",
  fsharp: "F#",
  matlab: "MATLAB",
  objectivec: "Objective-C",
  ocaml: "OCaml",
  r: "R",
  vbnet: "VB.NET",
  vhdl: "VHDL",
  x86asm: "Assembly",
};

function displayName(language: string): string {
  return DISPLAY_NAMES[language] ?? language.charAt(0).toUpperCase() + language.slice(1);
}

function CodeBlockView({ node, updateAttributes, editor, getPos }: NodeViewProps) {
  const language = (node.attrs.language as string) ?? "";
  const [copied, setCopied] = useState(false);
  const [running, setRunning] = useState(false);

  /**
   * Why a run could not be attempted — rate limited, signed out, no sandbox.
   *
   * Kept out of the note on purpose. A block that ran and failed is a result
   * worth recording; the app declining to run it is not something the reader
   * should find committed in their notes a year later.
   */
  const [problem, setProblem] = useState<string | null>(null);

  const runner = runnerFor(language);

  const languages = useMemo(() => {
    const popular = POPULAR.filter(isKnown);
    const rest = MORE.filter((name) => isKnown(name) && !popular.includes(name)).sort((a, b) =>
      displayName(a).localeCompare(displayName(b)),
    );
    // A block that arrived from a repository may be tagged with a language
    // this list leaves out, or with something no grammar covers at all.
    // Keeping that tag in the picker means opening it cannot silently retag
    // the block.
    const unlisted =
      language && !popular.includes(language) && !rest.includes(language) ? [language] : [];
    return { popular, rest, unlisted };
  }, [language]);

  /**
   * Puts the caret in the code when the click lands on the block's padding
   * rather than on a character.
   *
   * An empty code block is *all* padding — there is no text to aim at — so
   * clicking one did nothing whatsoever: ProseMirror could not resolve a
   * position, the editor never took focus, and the next keystroke went to the
   * page instead of into the block. It read as a block that swallowed clicks
   * and then quietly disappeared.
   */
  const focusCode = (event: React.MouseEvent<HTMLPreElement>) => {
    if ((event.target as HTMLElement).closest("code")) return;

    const pos = typeof getPos === "function" ? getPos() : null;
    if (typeof pos !== "number") return;

    event.preventDefault();
    // The last position inside this node, so clicking below the final line
    // lands at the end of the code rather than at the start of it.
    editor
      .chain()
      .focus()
      .setTextSelection(pos + node.nodeSize - 1)
      .run();
  };

  /**
   * Puts a run's result in a fenced block directly under this one.
   *
   * Replaces the previous result rather than stacking a new block under it:
   * a runbook re-run five times should read as what it does now, not as an
   * archive of every time somebody pressed the button. The history of those
   * runs is in the commits, which is where history belongs.
   */
  const writeOutput = (text: string) => {
    const pos = typeof getPos === "function" ? getPos() : null;
    if (typeof pos !== "number") return;

    const { state, view } = editor;
    const after = pos + node.nodeSize;
    // Read fresh rather than from a closure: the document may have been
    // edited while the sandbox was working.
    const next = after <= state.doc.content.size ? state.doc.resolve(after).nodeAfter : null;

    const block = node.type.create(
      { language: OUTPUT_LANGUAGE },
      text ? state.schema.text(text) : null,
    );

    const replacing = next && next.type === node.type && isOutput(next.attrs.language as string);

    view.dispatch(
      replacing
        ? state.tr.replaceWith(after, after + next.nodeSize, block)
        : state.tr.insert(after, block),
    );
  };

  const run = async () => {
    if (!runner || running) return;

    setRunning(true);
    setProblem(null);

    try {
      const response = await fetch("/api/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ language, code: node.textContent }),
      });

      const body = await response.json().catch(() => null);

      if (!response.ok) {
        setProblem(body?.error?.message ?? "That block could not be run.");
        return;
      }

      writeOutput(formatOutput(body));
    } catch {
      // Offline, or the request never arrived. Nothing ran, so nothing is
      // written down.
      setProblem("Could not reach the server. Nothing was run.");
    } finally {
      setRunning(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(node.textContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access can be refused; the selection still works.
    }
  };

  return (
    <NodeViewWrapper className="fl-code-node">
      {/* contentEditable={false} keeps ProseMirror from treating the toolbar as
          part of the document — without it the caret can land in the select. */}
      <div contentEditable={false} className="fl-code-head">
        <select
          value={language}
          onChange={(event) => updateAttributes({ language: event.target.value })}
          aria-label="Code language"
          title="Set the language for syntax highlighting"
          className="fl-code-lang"
        >
          <option value="">Plain text</option>
          {languages.unlisted.length > 0 && (
            <option value={languages.unlisted[0]}>{languages.unlisted[0]}</option>
          )}
          <optgroup label="Common">
            {languages.popular.map((name) => (
              <option key={name} value={name}>
                {displayName(name)}
              </option>
            ))}
          </optgroup>
          <optgroup label="All languages">
            {languages.rest.map((name) => (
              <option key={name} value={name}>
                {displayName(name)}
              </option>
            ))}
          </optgroup>
        </select>

        <div className="fl-code-actions">
          {runner && (
            <button
              type="button"
              onClick={run}
              disabled={running}
              className="fl-code-run"
              title={`Run this ${runner.label} block in a throwaway virtual machine — not on your own computer. It has internet access, and is destroyed when the run finishes.`}
            >
              {running ? "Running…" : "Run"}
            </button>
          )}

          <button type="button" onClick={copy} className="fl-code-copy">
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      {problem && (
        <div contentEditable={false} className="fl-code-problem" role="status">
          {problem}
        </div>
      )}

      <pre spellCheck={false} onMouseDown={focusCode}>
        <NodeViewContent<"code">
          as="code"
          className={language ? `language-${language}` : undefined}
        />
      </pre>
    </NodeViewWrapper>
  );
}

export const CodeBlock = CodeBlockLowlight.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView);
  },
}).configure({ lowlight, HTMLAttributes: { class: "fl-code-block" } });
