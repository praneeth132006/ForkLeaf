/**
 * Which fenced blocks can be run, and what a run leaves behind in the note.
 *
 * A runbook written in markdown is a list of commands you copy into a terminal
 * one at a time, paste the output back by hand, and then never update. The
 * commands and their results drift apart immediately, and a year later there
 * is no way to tell which output belongs to which version of which script.
 *
 * Running the block in place fixes the drift: the output lands directly under
 * the code that produced it, stamped with when, so the note records what
 * actually happened rather than what was supposed to.
 *
 * Everything here is deliberately plain markdown. The result is a fenced
 * block, not a custom node — it renders on github.com, in any other editor,
 * and in a plain-text pager, because a runbook whose results are only legible
 * inside one app has traded the whole point away.
 */

/** How a language is actually executed inside the sandbox. */
export interface Runner {
  /** Canonical name, which is what the button and the API agree on. */
  id: string;
  /** Shown to the reader — "Shell", not "bash". */
  label: string;
  /** The interpreter to invoke. */
  command: string;
  /** Extension for the script file written into the sandbox. */
  extension: string;
}

const SHELL: Runner = { id: "bash", label: "Shell", command: "bash", extension: "sh" };
const PYTHON: Runner = { id: "python", label: "Python", command: "python3", extension: "py" };
const NODE: Runner = { id: "javascript", label: "JavaScript", command: "node", extension: "js" };

/**
 * Fence labels that can be run, pointed at the interpreter that runs them.
 *
 * Only three families, and on purpose. Every entry here is a language the
 * sandbox image can already execute; offering a Run button that fails on
 * arrival because nothing can interpret the block would be worse than not
 * offering one. Adding a language is one line plus a sandbox that has it.
 */
const RUNNERS = new Map<string, Runner>([
  ["bash", SHELL],
  ["sh", SHELL],
  ["shell", SHELL],
  ["zsh", SHELL],
  ["console", SHELL],
  ["python", PYTHON],
  ["py", PYTHON],
  ["python3", PYTHON],
  ["javascript", NODE],
  ["js", NODE],
  ["node", NODE],
  ["mjs", NODE],
]);

/** The fence label a run's result is written under. */
export const OUTPUT_LANGUAGE = "output";

/** The interpreter for a fence label, or null when it is not runnable. */
export function runnerFor(language: string | null | undefined): Runner | null {
  if (!language) return null;
  return RUNNERS.get(language.trim().toLowerCase()) ?? null;
}

/** True for a fence label with a Run button. */
export function isRunnable(language: string | null | undefined): boolean {
  return runnerFor(language) !== null;
}

/** True for the blocks this module writes, which must never be runnable. */
export function isOutput(language: string | null | undefined): boolean {
  return (language ?? "").trim().toLowerCase() === OUTPUT_LANGUAGE;
}

/** What the sandbox reports back about one run. */
export interface RunResult {
  stdout: string;
  stderr: string;
  /** Non-zero means the script itself failed, which is a result, not an error. */
  exitCode: number;
  /** Wall-clock duration of the run. */
  ms: number;
  /** True when output was cut at the cap. */
  truncated: boolean;
  /** ISO timestamp of when the run finished. */
  ranAt: string;
  /** Set when the run never completed — a timeout, or the sandbox failing. */
  failure?: string;
}

/**
 * The most output kept, in characters.
 *
 * A command that prints a megabyte would otherwise put a megabyte into the
 * note, and the note is a file in a git repository that someone has to clone.
 * Generous enough for real command output, small enough that a runaway loop
 * cannot poison the history.
 */
export const MAX_OUTPUT = 20_000;

/** UTC, spelled out — unambiguous in a file that outlives this app's locale. */
function stamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "unknown time";

  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}` +
    ` ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`
  );
}

/** "0.4s", "1m 02s" — a duration a person reads rather than decodes. */
export function durationOf(ms: number): string {
  if (ms < 1000) return `${Math.max(0, Math.round(ms))}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;

  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

/** Cuts text to the cap, saying so in the text itself rather than silently. */
function cap(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_OUTPUT) return { text, truncated: false };
  return {
    text: `${text.slice(0, MAX_OUTPUT)}\n… output cut off at ${MAX_OUTPUT.toLocaleString("en-US")} characters.`,
    truncated: true,
  };
}

/**
 * The text written into the output block under a run.
 *
 * The first line is a header rather than hidden metadata: someone reading this
 * note on github.com, or in three years in an editor nobody has written yet,
 * can see when it ran and whether it worked without anything having to parse
 * it. Machine-readable attributes in the info string would have been tidier
 * and completely invisible to the person the note is for.
 */
export function formatOutput(result: RunResult): string {
  const status = result.failure
    ? result.failure
    : result.exitCode === 0
      ? "ok"
      : `exit ${result.exitCode}`;

  const header = `— ran ${stamp(result.ranAt)} · ${status} · ${durationOf(result.ms)}`;

  const sections: string[] = [];
  const out = result.stdout.replace(/\s+$/, "");
  const err = result.stderr.replace(/\s+$/, "");

  if (out) sections.push(out);
  // Labelled, because output interleaved with errors and no way to tell them
  // apart is how you misread a failure as a result.
  if (err) sections.push(`— stderr\n${err}`);

  if (sections.length === 0) {
    sections.push(result.failure ? "" : "(no output)");
  }

  const body = cap(sections.join("\n\n"));
  return `${header}\n${body.text}`.replace(/\s+$/, "");
}
