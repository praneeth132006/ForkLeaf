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
 * Everything else the picker offers.
 *
 * lowlight ships 192 grammars and the dropdown used to list all of them, in
 * alphabetical order, which meant the first thing anyone saw under "All
 * languages" was `1c`, `abnf`, `accesslog`, `angelscript`, `arcade`, `avrasm`
 * and `axapta` — a wall of things almost nobody has written a line of, sitting
 * between them and Scala. Access logs and Asciidoc are not even languages.
 *
 * So this is the long tail, curated: languages people actually write, and the
 * few formats worth tagging. A block that arrives from a repository tagged
 * with something outside the list is still highlighted — lowlight keeps every
 * grammar — and still shows its own tag in the picker, so nothing is lost by
 * not listing it. If something belongs here and is missing, it is one line.
 */
const MORE = [
  "ada",
  "arduino",
  "clojure",
  "cmake",
  "coffeescript",
  "crystal",
  "d",
  "dart",
  "delphi",
  "dockerfile",
  "elixir",
  "elm",
  "erlang",
  "fortran",
  "fsharp",
  "gradle",
  "graphql",
  "groovy",
  "haskell",
  "haxe",
  "ini",
  "julia",
  "latex",
  "less",
  "lisp",
  "lua",
  "makefile",
  "matlab",
  "nim",
  "nix",
  "objectivec",
  "ocaml",
  "perl",
  "powershell",
  "prolog",
  "protobuf",
  "r",
  "scala",
  "scheme",
  "scss",
  "smalltalk",
  "tcl",
  "vala",
  "vbnet",
  "verilog",
  "vhdl",
  "vim",
  "wasm",
  "x86asm",
  "xml",
  "xquery",
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
  cmake: "CMake",
  d: "D",
  fsharp: "F#",
  graphql: "GraphQL",
  ini: "INI / TOML",
  latex: "LaTeX",
  less: "Less",
  matlab: "MATLAB",
  objectivec: "Objective-C",
  ocaml: "OCaml",
  protobuf: "Protocol Buffers",
  r: "R",
  scss: "SCSS",
  vbnet: "VB.NET",
  vhdl: "VHDL",
  wasm: "WebAssembly",
  x86asm: "Assembly",
  xquery: "XQuery",
};

function displayName(language: string): string {
  return DISPLAY_NAMES[language] ?? language.charAt(0).toUpperCase() + language.slice(1);
}

function CodeBlockView({ node, updateAttributes, editor, getPos }: NodeViewProps) {
  const language = (node.attrs.language as string) ?? "";
  const [copied, setCopied] = useState(false);

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

        <button type="button" onClick={copy} className="fl-code-copy">
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

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
