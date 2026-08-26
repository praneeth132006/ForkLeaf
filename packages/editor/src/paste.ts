/**
 * What a paste actually is.
 *
 * Text arriving from the clipboard is the one place this editor gets content
 * it did not shape itself, and the shape it arrives in is usually wrong for a
 * notebook. Two failures happened constantly:
 *
 * A script or a list of shell commands pasted as prose — one paragraph per
 * line, a blank line of margin between every one of them, no monospace and no
 * highlighting. Turning that into code afterwards was worse, because a
 * selection of twenty paragraphs became twenty code blocks.
 *
 * And notes apps that write one `<p>` per *line* rather than per paragraph.
 * ProseMirror is right to trust the HTML it is handed, and the result is a
 * page of single lines each sitting in its own paragraph, spaced as if every
 * line were a new thought.
 *
 * These are the decisions behind fixing both, kept away from the editor so
 * they can be tested as what they are: guesses about text.
 */

/** What a shebang line says to run, and the fence label that matches it. */
const INTERPRETERS: Record<string, string> = {
  bash: "bash",
  sh: "bash",
  zsh: "bash",
  dash: "bash",
  ksh: "bash",
  python: "python",
  python2: "python",
  python3: "python",
  node: "javascript",
  deno: "typescript",
  ruby: "ruby",
  perl: "perl",
  php: "php",
  pwsh: "powershell",
  lua: "lua",
  rscript: "r",
};

/**
 * The shell case, which is the most common paste of all and the hardest to pin
 * down: a shell command is just words, and what marks it out is the
 * punctuation around them — a flag, a pipe, a redirect, a `$variable`, a
 * relative path — or one of the words only a shell uses.
 */
const SHELL =
  /(^|\s)(-{1,2}[a-zA-Z][\w-]*|\|\s*\w|>>?\s*\S|\$\{?\w+|\.\/\S+)|^\s*(sudo|apt|apt-get|brew|npm|pnpm|yarn|git|docker|kubectl|curl|wget|echo|cat|cd|mkdir|rm|cp|mv|chmod|chown|export|source|ssh|scp|grep|sed|awk|find|tar|make|whois|ping|nmap)\b|^\s*(fi|done|esac|then|else)\s*$/m;

/**
 * Signals that a language is the one, in the order they are checked.
 *
 * Deliberately hand-written rather than handed to highlight.js's automatic
 * detection, which scores a grammar per line and, run over a couple of hundred
 * grammars, confidently reports that a JavaScript function is an INI file. A
 * short list of things only one language says is both more accurate on the
 * pastes people actually make and legible when it gets one wrong.
 */
const LANGUAGE_RULES: ReadonlyArray<{ language: string; pattern: RegExp }> = [
  { language: "php", pattern: /<\?php\b/ },
  { language: "go", pattern: /^\s*package\s+\w+\s*$|\bfunc\s+\w+\s*\([^)]*\)\s*[\w*[\]]*\s*\{/m },
  { language: "rust", pattern: /\bfn\s+\w+\s*\(|\blet\s+mut\s+\w+|\buse\s+std::/ },
  { language: "csharp", pattern: /\busing\s+System\b|\bnamespace\s+\w+\s*[;{]/ },
  {
    language: "java",
    pattern: /\b(public|private|protected)\s+(static\s+)?(final\s+)?(class|void|int|String)\b/,
  },
  { language: "cpp", pattern: /#include\s*<\w+>|\bstd::\w+/ },
  { language: "c", pattern: /#include\s*<\w+\.h>/ },
  {
    language: "swift",
    pattern: /\bimport\s+(Foundation|SwiftUI|UIKit)\b|\bfunc\s+\w+\([^)]*\)\s*->/,
  },
  { language: "kotlin", pattern: /\bfun\s+\w+\s*\(|\bval\s+\w+\s*(:|=)/ },
  {
    language: "typescript",
    pattern: /\binterface\s+\w+\s*\{|:\s*(string|number|boolean|void|unknown)\b|\btype\s+\w+\s*=/,
  },
  {
    language: "javascript",
    pattern: /\b(const|let|var)\s+[\w{[]|\bfunction\s*\w*\s*\(|=>\s*[{(]|\bconsole\.\w+\(/,
  },
  {
    language: "python",
    pattern: /^\s*(def|class)\s+\w+.*:\s*$|^\s*(from\s+[\w.]+\s+)?import\s+\w+/m,
  },
  { language: "ruby", pattern: /^\s*(require|puts)\s+['"\w]|\bdef\s+\w+.*\n[\s\S]*^\s*end\s*$/m },
  {
    language: "sql",
    pattern: /\b(select\s+[\w*,\s]+\s+from|insert\s+into|create\s+table|update\s+\w+\s+set)\b/i,
  },
  { language: "dockerfile", pattern: /^FROM\s+\S+/m },
  { language: "html", pattern: /<\/(html|body|head|div|section|main|p|span)>/ },
  { language: "css", pattern: /^[.#@]?[\w-]+[^{}\n]*\{\s*$[\s\S]*?^\s*[\w-]+\s*:\s*[^;]+;/m },
  { language: "powershell", pattern: /\b(Get|Set|New|Remove)-\w+\b/ },
  { language: "bash", pattern: SHELL },
];

/** The language a piece of code is in, or `""` when nothing says clearly. */
export function detectLanguage(text: string): string {
  const shebang = /^#!\s*(?:\S*\/)?(?:env\s+)?(\w+)/.exec(text);
  if (shebang) {
    const named = INTERPRETERS[shebang[1]!.toLowerCase()];
    if (named) return named;
  }

  // JSON before the rest: it is the one format that can be *proved* rather
  // than guessed at, and a JSON object matches several of the rules below.
  const trimmed = text.trim();
  if (/^[[{]/.test(trimmed) && isJson(trimmed)) return "json";

  for (const rule of LANGUAGE_RULES) {
    if (rule.pattern.test(text)) return rule.language;
  }

  // Documents of `key: value` lines, once everything with a stronger claim on
  // them has passed. Checked last because a single colon is the weakest signal
  // in this file.
  if (isYaml(text)) return "yaml";

  return "";
}

function isJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

function isYaml(text: string): boolean {
  const lines = contentLines(text);
  if (lines.length < 2) return false;
  const pairs = lines.filter((line) => /^\s*(-\s+)?[\w.-]+:(\s|$)/.test(line));
  return pairs.length / lines.length >= 0.7;
}

/** Everything with something on it, trailing spaces removed. */
function contentLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.replace(/\s+$/, ""))
    .filter((line) => line.trim() !== "");
}

/** Marks of a line of code rather than a line of writing. */
const CODE_LINE_SIGNALS: readonly RegExp[] = [
  // Punctuation no sentence ends on.
  /[;{}]\s*$/,
  /^\s*[)}\]]+[;,]?\s*$/,
  // A comment, in any of the languages that spell it differently.
  /^\s*(#|\/\/|\/\*|\*\/|--\s|<!--)/,
  // An assignment, but not "Total: 40" — the right-hand side has to look like
  // a value rather than the rest of an English sentence.
  /^\s*(const|let|var|val|my|export|local)?\s*[\w.$[\]-]+\s*(=|:=|\+=|\|\|=)\s*\S/,
  // A call, a definition, or an index.
  /\w+\([^)]*\)/,
  /^\s*(function|def|fun|fn|class|struct|impl|interface|module|package|import|from|require|return|if|elif|else|for|while|switch|case|try|catch|finally|echo|print|printf|puts|end|fi|done|then|do)\b/,
  // Shell furniture: flags, pipes, redirects, variables, relative paths.
  /(^|\s)-{1,2}[a-zA-Z][\w-]*(\s|=|$)/,
  /\|\s*\w|>>?\s*\S|\$\{?\w+|&&|\.\/\S/,
  // Indented continuation, which prose in a notebook does not do.
  /^(\t| {2,})\S/,
  // Markup and tags.
  /^\s*<\/?[a-zA-Z][\w-]*/,
];

function isCodeLine(line: string): boolean {
  return CODE_LINE_SIGNALS.some((signal) => signal.test(line));
}

/** Shell punctuation strong enough to say what the whole block is. */
const SHELL_STRONG = /(^|\s)-{1,2}[a-zA-Z][\w-]*(\s|=|$)|\|\s*\w|>>?\s*\S|\$\{?\w+|&&|\.\/\S/;

/** A bare command and its arguments: `whois tcm-sec.com`. */
const COMMAND_LINE = /^[a-z][\w./-]*(\s+\S+){1,5}$/;

/**
 * A command judged by the company it keeps.
 *
 * Half the lines in a list of shell commands have nothing in them but words —
 * `whois tcm-sec.com`, `assetfinder tcm-sec.com` — and on their own they are
 * indistinguishable from a note to self. Read next to a line carrying a pipe
 * or a flag, they are obviously the same kind of thing, and that context is
 * what this asks for: it only counts when the paste has already shown its
 * hand. Anything ending in sentence punctuation is a sentence, not a command.
 */
function isCommandLine(line: string): boolean {
  const trimmed = line.trim();
  if (/[.,;:!?]$/.test(trimmed)) return false;
  return COMMAND_LINE.test(trimmed);
}

/**
 * Whether a paste should become one code block.
 *
 * Conservative on purpose, and in one direction: mistaking prose for code puts
 * someone's writing in a monospace box they have to undo, while missing a
 * snippet leaves them exactly where they were before any of this existed. So a
 * single line never qualifies — "Meeting at 4pm (bring notes)" has a call in
 * it as far as any regex is concerned — and a clear majority of the lines have
 * to look like code, not just a couple of them.
 */
export function looksLikeCode(text: string): boolean {
  const body = text.trim();
  if (body === "") return false;

  // A shebang is not ambiguous, whatever follows it.
  if (body.startsWith("#!")) return true;

  // Already fenced, or a markdown document that contains a fence: the markdown
  // parser makes a better job of that than anything here would.
  if (/^\s*```/m.test(body)) return false;

  const lines = contentLines(body);
  if (lines.length < 2) return false;

  // A markdown document is prose with punctuation, and its headings and
  // bullets trip the comment and flag signals. Left alone deliberately.
  if (looksLikeMarkdown(lines)) return false;

  const shellContext = lines.some((line) => SHELL_STRONG.test(line));
  const code = lines.filter(
    (line) => isCodeLine(line) || (shellContext && isCommandLine(line)),
  ).length;

  return code / lines.length >= 0.6;
}

/** Headings, bullets and links: a document, not a program. */
function looksLikeMarkdown(lines: string[]): boolean {
  const markers = lines.filter((line) =>
    /^\s{0,3}(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|\|.*\|)/.test(line),
  ).length;
  return markers / lines.length >= 0.5;
}

/**
 * The clipboard's own line spacing, made even.
 *
 * Sources vary in how many blank lines they put between things, and a paste
 * that arrives with three of them keeps all three. One is a paragraph break;
 * more than one is the same paragraph break with padding.
 */
export function evenSpacing(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\n+|\n+$/g, "");
}

/** Elements that carry structure worth keeping exactly as the source had it. */
const STRUCTURAL = "h1,h2,h3,h4,h5,h6,ul,ol,li,table,tr,td,th,img,pre,code,blockquote,hr,figure";

/**
 * Whether pasted HTML is only lines of text dressed as blocks.
 *
 * Notes apps, chat clients and code panes on the web all emit one `<p>` or
 * `<div>` per line. ProseMirror believes them — correctly, in general — and
 * the result here is a run of one-line paragraphs with a paragraph's margin
 * between each, which is not what the source looked like and not what anybody
 * meant. When the HTML says nothing that the plain text does not, the plain
 * text is the better of the two: it goes through the markdown parser, where a
 * newline is a line break and a bare URL becomes a link.
 *
 * Anything with real structure in it — a heading, a list, a table, an image —
 * is left to ProseMirror, along with anything whose blocks are long enough to
 * be actual paragraphs, and anything carrying a link whose label is not just
 * its address, which is the one thing the plain text would lose.
 */
export function isLinesOfText(html: string, parse: (html: string) => Document): boolean {
  const body = parse(html).body;
  if (!body) return false;
  if (body.querySelector(STRUCTURAL)) return false;

  for (const anchor of Array.from(body.querySelectorAll("a"))) {
    const href = anchor.getAttribute("href") ?? "";
    const label = (anchor.textContent ?? "").trim();
    if (label !== "" && href !== "" && label !== href && href !== `${label}/`) return false;
  }

  const blocks = Array.from(body.querySelectorAll("p,div"));
  if (blocks.length < 2) return false;

  // A block long enough to wrap is a paragraph, and paragraphs keep their
  // spacing. This is the line between "a note written in lines" and "prose
  // copied off a web page".
  return blocks.every((block) => (block.textContent ?? "").trim().length <= 120);
}
