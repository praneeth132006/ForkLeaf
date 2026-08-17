/**
 * Turning mermaid's parser errors into something a person can act on.
 *
 * Raw mermaid errors look like:
 *   "Parse error on line 3:\n...  A --> \n----------^\nExpecting 'NODE_STRING'…"
 *
 * That is unreadable in a toast. We pull out the line number so the editor can
 * underline the offending line, and map the most common failures to plain
 * advice, because "Expecting 'SEMI', 'NEWLINE'" tells a beginner nothing.
 */

export interface DiagramError {
  message: string;
  /** 1-based line number in the diagram source, when we could work it out. */
  line: number | null;
  /** A concrete suggestion, shown under the message. Always present. */
  hint: string;
  /** The unmodified mermaid error, for the "details" disclosure. */
  raw: string;
}

interface ErrorRule {
  match: RegExp;
  message: string;
  hint: string;
}

/**
 * Ordered most-specific first. Each rule replaces a parser message with an
 * explanation of what to actually do about it.
 */
const RULES: ErrorRule[] = [
  {
    match: /no diagram type detected/i,
    message: "The first line doesn't name a diagram type.",
    hint: 'Start with a type, for example "flowchart TD", "sequenceDiagram" or "pie".',
  },
  {
    match: /expecting\s+'?(?:SPACE|NEWLINE|SEMI)'?/i,
    message: "Something on this line isn't where mermaid expected it.",
    hint: "Check for a missing arrow (-->) or an extra bracket, and keep one statement per line.",
  },
  {
    match: /expecting\s+'?(?:SQE|DIAMOND_STOP|PS|PE|STADIUMEND|CYLINDEREND)'?/i,
    message: "A node's brackets aren't closed.",
    hint: "Every node needs a matching pair, like A[Label], B{Decision} or C([Start]).",
  },
  {
    match: /expecting\s+'?NODE_STRING'?/i,
    message: "An arrow doesn't point at anything.",
    hint: "Give the arrow a destination, for example: A --> B",
  },
  {
    match: /(?:unsupported markdown|lexical error)/i,
    message: "There's a character here mermaid can't read.",
    hint: 'Wrap labels containing punctuation in quotes, like A["Cost: $5"].',
  },
  {
    match: /duplicate/i,
    message: "This name is already used elsewhere in the diagram.",
    hint: "Give each node a unique id. The label can repeat, the id can't.",
  },
  {
    match: /trying to inactivate an inactive participant/i,
    message: "A participant is deactivated without being activated first.",
    hint: "Add a matching activate line, or use ->>+ and -->>- to pair them up.",
  },
];

export function parseMermaidError(err: unknown, code: string): DiagramError {
  const raw = err instanceof Error ? err.message : String(err);

  return {
    message: friendlyMessage(raw),
    line: extractLine(raw, code),
    hint: findHint(raw),
    raw,
  };
}

function friendlyMessage(raw: string): string {
  for (const rule of RULES) {
    if (rule.match.test(raw)) return rule.message;
  }

  // Mermaid's first line is often only a location marker — "Parse error on
  // line 7:" — which tells the user nothing they can act on. Quote the offending
  // text instead, which does.
  const snippet = offendingSnippet(raw);
  if (snippet) return `Mermaid couldn't read this: ${snippet}`;

  const firstLine = raw.split("\n")[0]?.trim();
  if (!firstLine || /^parse error(?: on line \d+)?:?$/i.test(firstLine)) {
    return "There's a syntax error on this line.";
  }

  return firstLine.length < 160 ? firstLine : "This diagram has a syntax error.";
}

/**
 * Generic advice for when no specific rule matched.
 *
 * There is always a hint: a bare parser message with no suggestion is the exact
 * experience this module exists to avoid, so falling back to the three things
 * that are almost always wrong beats saying nothing.
 */
const FALLBACK_HINT =
  "Check for an unclosed bracket, an arrow with nothing after it, or " +
  "punctuation in a label that needs quotes.";

function findHint(raw: string): string {
  for (const rule of RULES) {
    if (rule.match.test(raw)) return rule.hint;
  }
  return FALLBACK_HINT;
}

/**
 * Pulls the quoted source fragment out of mermaid's error.
 *
 * Mermaid formats parse errors as three lines: a location, the offending text,
 * and a caret pointing into it. The middle line is the useful part.
 */
function offendingSnippet(raw: string): string | null {
  const lines = raw.split("\n");
  if (lines.length < 2) return null;

  const candidate = lines[1]
    ?.trim()
    .replace(/^\.{3}/, "")
    .replace(/\.{3}$/, "")
    .trim();
  if (!candidate || candidate.length > 60) return null;
  // The caret line is punctuation only; never quote that back at the user.
  if (/^[\^\-\s]+$/.test(candidate)) return null;

  return `"${candidate}"`;
}

/**
 * Digs the line number out of mermaid's message.
 *
 * Mermaid counts lines against its own preprocessed copy of the source, which
 * can be one ahead of what the user sees. Clamping into range rather than
 * discarding an out-of-range number means the editor still underlines
 * approximately the right place, which is far more useful than nothing.
 */
function extractLine(raw: string, code: string): number | null {
  const explicit = /(?:parse error on line|error on line|line)\s*:?\s*(\d+)/i.exec(raw);
  if (!explicit) return null;

  const reported = Number(explicit[1]);
  if (!Number.isFinite(reported) || reported < 1) return null;

  const total = code.split("\n").length;
  return Math.min(reported, total);
}
