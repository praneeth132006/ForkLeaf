/**
 * Live code in a note: the parts that need no editor.
 *
 * A ```live-code block names a piece of code in a repository and keeps a copy
 * of it as it was when the note was written:
 *
 *     ```live-code
 *     repo: owner/name        (optional: this notebook's repository)
 *     path: src/lib/auth.ts
 *     symbol: login           (or  lines: 10-40)
 *     ref: main               (optional: the default branch)
 *     ---
 *     export function login(...) { … }
 *     ```
 *
 * The copy is what makes it honest. On github.com, in Obsidian, in any viewer
 * that knows nothing of ForkLeaf, the block is still the code it explains. In
 * ForkLeaf the current code is fetched and compared with the copy, so the note
 * can say plainly when the code it describes has moved on — and show how.
 */

export interface LiveCodeSpec {
  repo: string | null;
  path: string;
  symbol: string | null;
  /** 1-based, inclusive. */
  lines: { from: number; to: number } | null;
  ref: string | null;
  /** The code as it was when the note was written. Empty before the first fetch. */
  snapshot: string;
}

const KEYS = ["repo", "path", "symbol", "lines", "ref"] as const;

/** Reads a block's text. Unknown lines in the header are ignored rather than refused. */
export function parseLiveCode(text: string): LiveCodeSpec {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const divider = lines.findIndex((line) => line.trim() === "---");
  const header = divider >= 0 ? lines.slice(0, divider) : lines;
  const body = divider >= 0 ? lines.slice(divider + 1).join("\n") : "";

  const values: Record<string, string> = {};
  for (const line of header) {
    const match = /^\s*([a-z]+)\s*:\s*(.*?)\s*$/i.exec(line);
    if (match && (KEYS as readonly string[]).includes(match[1]!.toLowerCase())) {
      values[match[1]!.toLowerCase()] = match[2]!;
    }
  }

  const range =
    /^(\d+)\s*(?:-|–|to)\s*(\d+)$/.exec(values.lines ?? "") ?? /^(\d+)$/.exec(values.lines ?? "");
  const from = range ? Number(range[1]) : 0;
  const to = range ? Number(range[2] ?? range[1]) : 0;

  return {
    repo: normaliseRepo(values.repo ?? ""),
    path: (values.path ?? "").replace(/^\/+/, ""),
    symbol: values.symbol?.trim() || null,
    lines: range && from >= 1 && to >= from ? { from, to } : null,
    ref: values.ref?.trim() || null,
    snapshot: body.replace(/\n+$/, ""),
  };
}

/** `owner/name`, from either that or a github.com address. */
export function normaliseRepo(value: string): string | null {
  const trimmed = value.trim().replace(/\.git$/, "");
  const match = /^(?:https?:\/\/github\.com\/)?([\w.-]+)\/([\w.-]+)\/?$/i.exec(trimmed) ?? null;
  return match ? `${match[1]}/${match[2]}` : null;
}

/** Writes a block's text back. */
export function serializeLiveCode(spec: LiveCodeSpec): string {
  const header = [
    ...(spec.repo ? [`repo: ${spec.repo}`] : []),
    `path: ${spec.path}`,
    ...(spec.symbol ? [`symbol: ${spec.symbol}`] : []),
    ...(spec.lines ? [`lines: ${spec.lines.from}-${spec.lines.to}`] : []),
    ...(spec.ref ? [`ref: ${spec.ref}`] : []),
  ];
  return spec.snapshot ? `${header.join("\n")}\n---\n${spec.snapshot}` : header.join("\n");
}

/** A fence long enough that nothing in the code can close it early. */
export function fenceFor(text: string): string {
  const longest = Math.max(0, ...(text.match(/`{3,}/g) ?? []).map((run) => run.length));
  return "`".repeat(Math.max(3, longest + 1));
}

/** The language to label the code with, from the file's extension. */
export function languageOf(path: string): string {
  const extension = /\.([a-z0-9]+)$/i.exec(path)?.[1]?.toLowerCase() ?? "";
  const known: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    py: "python",
    rb: "ruby",
    go: "go",
    rs: "rust",
    java: "java",
    kt: "kotlin",
    swift: "swift",
    c: "c",
    h: "c",
    cpp: "cpp",
    cc: "cpp",
    hpp: "cpp",
    cs: "csharp",
    php: "php",
    sh: "bash",
    bash: "bash",
    sql: "sql",
    yml: "yaml",
    yaml: "yaml",
    json: "json",
    md: "markdown",
    css: "css",
    scss: "scss",
    html: "html",
  };
  return known[extension] ?? "";
}

export type Extracted =
  { found: true; code: string; from: number; to: number } | { found: false; reason: string };

const INDENTED = new Set(["python", "ruby", "yaml"]);

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The line a symbol is declared on, by the ways languages declare things. */
function declarationLine(lines: readonly string[], symbol: string): number {
  const name = escape(symbol);
  const patterns = [
    // function login / async function login / export default function login
    new RegExp(`^\\s*(?:export\\s+(?:default\\s+)?)?(?:async\\s+)?function\\s*\\*?\\s+${name}\\b`),
    // class / interface / type / enum / struct / trait / impl / module / object
    new RegExp(
      `^\\s*(?:export\\s+(?:default\\s+)?)?(?:public\\s+|private\\s+|protected\\s+|internal\\s+|abstract\\s+|final\\s+|sealed\\s+|data\\s+|pub(?:\\([^)]*\\))?\\s+)*(?:class|interface|type|enum|struct|trait|impl|module|object|record|protocol)\\s+${name}\\b`,
    ),
    // const login = / let / var  (arrow functions, values)
    new RegExp(`^\\s*(?:export\\s+)?(?:const|let|var)\\s+${name}\\b\\s*[:=]`),
    // def login / async def / def self.login
    new RegExp(`^\\s*(?:async\\s+)?def\\s+(?:self\\.)?${name}\\b`),
    // fn login / pub fn / pub async fn
    new RegExp(`^\\s*(?:pub(?:\\([^)]*\\))?\\s+)?(?:async\\s+)?(?:unsafe\\s+)?fn\\s+${name}\\b`),
    // func login / func (s *Server) login
    new RegExp(`^\\s*func\\s+(?:\\([^)]*\\)\\s*)?${name}\\b`),
    // methods: login(…) { / async login(…) / public static void login(…)
    new RegExp(
      `^\\s*(?:(?:public|private|protected|static|async|override|final|virtual|abstract|synchronized|get|set|readonly)\\s+)*(?:[\\w<>\\[\\],.?]+\\s+)?${name}\\s*(?:<[^>]*>)?\\s*\\([^;]*$`,
    ),
  ];
  for (const pattern of patterns) {
    const index = lines.findIndex((line) => pattern.test(line));
    if (index >= 0) return index;
  }
  return -1;
}

/** Comment and decorator lines directly above a declaration belong to it. */
function leadingLines(lines: readonly string[], start: number): number {
  let index = start;
  while (index > 0) {
    const above = lines[index - 1]!.trim();
    if (
      /^(\/\/|\/\*|\*|#(?!!)|@|"""|''')/.test(above) &&
      !/^#\s*(include|define|if|import)/.test(above)
    ) {
      index -= 1;
    } else break;
  }
  return index;
}

/** Where a brace-delimited block that starts on `start` ends. */
function braceEnd(lines: readonly string[], start: number): number {
  let depth = 0;
  let opened = false;
  let quote: string | null = null;
  let blockComment = false;

  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index]!;
    for (let i = 0; i < line.length; i += 1) {
      const character = line[i]!;
      const pair = line.slice(i, i + 2);
      if (blockComment) {
        if (pair === "*/") {
          blockComment = false;
          i += 1;
        }
        continue;
      }
      if (quote) {
        if (character === "\\") i += 1;
        else if (character === quote) quote = null;
        continue;
      }
      if (pair === "//") break;
      if (pair === "/*") {
        blockComment = true;
        i += 1;
        continue;
      }
      if (character === '"' || character === "'" || character === "`") {
        quote = character;
        continue;
      }
      if (character === "{") {
        depth += 1;
        opened = true;
      } else if (character === "}") {
        depth -= 1;
        // The block ends at a brace that closes the statement — not at the end
        // of a destructured argument `({ user }: Props)` or a type literal
        // `Promise<{ ok: boolean }>`, which are followed by more signature.
        if (opened && depth === 0 && /^[;),]*\s*(\/\/.*)?$/.test(line.slice(i + 1).trim())) {
          return index;
        }
      } else if (character === ";" && !opened && depth === 0) {
        // `const limit = 5;` — a statement, with no block.
        return index;
      }
    }
    // Template strings may run over lines; ordinary quotes may not.
    if (quote && quote !== "`") quote = null;
  }
  return opened ? lines.length - 1 : start;
}

/** Where an indented block that starts on `start` ends. */
function indentEnd(lines: readonly string[], start: number): number {
  const indent = (line: string) => line.length - line.trimStart().length;
  const base = indent(lines[start]!);
  let end = start;
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (!line.trim()) continue;
    if (indent(line) <= base) {
      // Ruby closes with an `end` at the same indentation.
      if (/^\s*end\b/.test(line) && indent(line) === base) end = index;
      break;
    }
    end = index;
  }
  return end;
}

/** The named symbol, or the line range, out of a file. */
export function extractCode(
  source: string,
  spec: Pick<LiveCodeSpec, "path" | "symbol" | "lines">,
): Extracted {
  const lines = source.replace(/\r\n/g, "\n").split("\n");

  if (spec.symbol) {
    const at = declarationLine(lines, spec.symbol);
    if (at < 0)
      return { found: false, reason: `“${spec.symbol}” is not in ${spec.path} any more.` };
    const first = leadingLines(lines, at);
    const language = languageOf(spec.path);
    const last = INDENTED.has(language) ? indentEnd(lines, at) : braceEnd(lines, at);
    return {
      found: true,
      code: dedent(lines.slice(first, last + 1)).join("\n"),
      from: first + 1,
      to: last + 1,
    };
  }

  if (spec.lines) {
    if (spec.lines.from > lines.length) {
      return {
        found: false,
        reason: `${spec.path} has ${lines.length} lines now, so line ${spec.lines.from} is gone.`,
      };
    }
    const to = Math.min(spec.lines.to, lines.length);
    return {
      found: true,
      code: dedent(lines.slice(spec.lines.from - 1, to)).join("\n"),
      from: spec.lines.from,
      to,
    };
  }

  return { found: true, code: source.replace(/\n+$/, ""), from: 1, to: lines.length };
}

/** Removes the indentation every non-blank line shares. */
function dedent(lines: readonly string[]): string[] {
  const indents = lines
    .filter((line) => line.trim())
    .map((line) => line.length - line.trimStart().length);
  const common = indents.length > 0 ? Math.min(...indents) : 0;
  const trimmed = lines.map((line) =>
    line.slice(Math.min(common, line.length - line.trimStart().length)).trimEnd(),
  );
  while (trimmed.length > 0 && !trimmed[trimmed.length - 1]!.trim()) trimmed.pop();
  return trimmed;
}

/** True when two copies of code say the same thing, ignoring trailing spaces and line endings. */
export function sameCode(a: string, b: string): boolean {
  const normal = (text: string) =>
    text
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((line) => line.trimEnd())
      .join("\n")
      .trim();
  return normal(a) === normal(b);
}

export type DiffLine = { kind: "same" | "added" | "removed"; text: string };

/** A line-by-line diff (longest common subsequence), for "show what changed". */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split("\n");
  const b = after.split("\n");
  // A note's snippet is small; refuse to build a huge table for a pathological one.
  if (a.length * b.length > 4_000_000) {
    return [
      ...a.map((text) => ({ kind: "removed" as const, text })),
      ...b.map((text) => ({ kind: "added" as const, text })),
    ];
  }
  const table: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i]![j] =
        a[i] === b[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ kind: "same", text: a[i]! });
      i += 1;
      j += 1;
    } else if (table[i + 1]![j]! >= table[i]![j + 1]!) {
      out.push({ kind: "removed", text: a[i]! });
      i += 1;
    } else {
      out.push({ kind: "added", text: b[j]! });
      j += 1;
    }
  }
  while (i < a.length) out.push({ kind: "removed", text: a[i++]! });
  while (j < b.length) out.push({ kind: "added", text: b[j++]! });
  return out;
}
