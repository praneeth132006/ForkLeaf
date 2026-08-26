import { describe, expect, it } from "vitest";
import {
  MAX_OUTPUT,
  OUTPUT_LANGUAGE,
  durationOf,
  formatOutput,
  isOutput,
  isRunnable,
  runnerFor,
  type RunResult,
} from "./runnable";

const RAN_AT = "2026-08-27T10:04:09.000Z";

function result(overrides: Partial<RunResult> = {}): RunResult {
  return {
    stdout: "",
    stderr: "",
    exitCode: 0,
    ms: 412,
    truncated: false,
    ranAt: RAN_AT,
    ...overrides,
  };
}

describe("runnerFor", () => {
  it("runs the shell under every name people fence it with", () => {
    for (const name of ["bash", "sh", "shell", "zsh", "console"]) {
      expect(runnerFor(name)?.command).toBe("bash");
    }
  });

  it("runs python under its aliases", () => {
    for (const name of ["python", "py", "python3"]) {
      expect(runnerFor(name)?.command).toBe("python3");
    }
  });

  it("runs javascript under its aliases", () => {
    for (const name of ["javascript", "js", "node", "mjs"]) {
      expect(runnerFor(name)?.command).toBe("node");
    }
  });

  it("ignores case and stray whitespace in the fence label", () => {
    expect(runnerFor("  BaSh ")?.command).toBe("bash");
  });

  it("refuses a language nothing can interpret", () => {
    for (const name of ["typescript", "json", "yaml", "markdown", "rust", "sql"]) {
      expect(runnerFor(name)).toBeNull();
    }
  });

  it("refuses an empty, absent or unlabelled fence", () => {
    expect(runnerFor("")).toBeNull();
    expect(runnerFor(null)).toBeNull();
    expect(runnerFor(undefined)).toBeNull();
  });

  it("gives every runner a file extension to write the script under", () => {
    expect(runnerFor("bash")?.extension).toBe("sh");
    expect(runnerFor("python")?.extension).toBe("py");
    expect(runnerFor("node")?.extension).toBe("js");
  });

  it("labels runners for a reader, not for a parser", () => {
    expect(runnerFor("sh")?.label).toBe("Shell");
    expect(runnerFor("py")?.label).toBe("Python");
  });
});

describe("isRunnable / isOutput", () => {
  it("agrees with runnerFor", () => {
    expect(isRunnable("bash")).toBe(true);
    expect(isRunnable("rust")).toBe(false);
  });

  it("never offers to run a block this module wrote", () => {
    // Otherwise a run's output grows another Run button, and clicking it
    // executes the last run's stdout as a script.
    expect(isRunnable(OUTPUT_LANGUAGE)).toBe(false);
    expect(isOutput(OUTPUT_LANGUAGE)).toBe(true);
    expect(isOutput("OUTPUT")).toBe(true);
    expect(isOutput("bash")).toBe(false);
    expect(isOutput(null)).toBe(false);
  });
});

describe("durationOf", () => {
  it("reads in milliseconds under a second", () => {
    expect(durationOf(412)).toBe("412ms");
    expect(durationOf(0)).toBe("0ms");
  });

  it("reads in seconds under a minute", () => {
    expect(durationOf(1000)).toBe("1.0s");
    expect(durationOf(12_400)).toBe("12.4s");
  });

  it("reads in minutes and seconds beyond that", () => {
    expect(durationOf(62_000)).toBe("1m 02s");
    expect(durationOf(600_000)).toBe("10m 00s");
  });

  it("never shows a negative duration from a clock that moved", () => {
    expect(durationOf(-5)).toBe("0ms");
  });
});

describe("formatOutput — the header", () => {
  it("stamps the run in UTC, so the file does not depend on a locale", () => {
    expect(formatOutput(result({ stdout: "hi" }))).toContain("2026-08-27 10:04 UTC");
  });

  it("says ok when the script succeeded", () => {
    expect(formatOutput(result({ stdout: "hi" }))).toContain("· ok ·");
  });

  it("reports a non-zero exit as a result rather than an error", () => {
    expect(formatOutput(result({ exitCode: 2, stderr: "boom" }))).toContain("· exit 2 ·");
  });

  it("reports a run that never finished by its reason", () => {
    const text = formatOutput(result({ failure: "timed out after 30s", ms: 30_000 }));
    expect(text).toContain("· timed out after 30s ·");
  });

  it("includes how long it took", () => {
    expect(formatOutput(result({ stdout: "hi", ms: 2500 }))).toContain("· 2.5s");
  });

  it("survives a timestamp it cannot parse", () => {
    expect(formatOutput(result({ ranAt: "not a date" }))).toContain("unknown time");
  });
});

describe("formatOutput — the body", () => {
  it("writes stdout under the header", () => {
    expect(formatOutput(result({ stdout: "hello\nworld" }))).toBe(
      "— ran 2026-08-27 10:04 UTC · ok · 412ms\nhello\nworld",
    );
  });

  it("labels stderr so a failure is not misread as a result", () => {
    const text = formatOutput(result({ stdout: "some", stderr: "bad", exitCode: 1 }));
    expect(text).toContain("some");
    expect(text).toContain("— stderr\nbad");
  });

  it("says so plainly when a command printed nothing", () => {
    expect(formatOutput(result())).toContain("(no output)");
  });

  it("does not claim there was no output when the run itself failed", () => {
    const text = formatOutput(result({ failure: "the sandbox could not start" }));
    expect(text).not.toContain("(no output)");
    expect(text).toContain("the sandbox could not start");
  });

  it("trims trailing whitespace rather than leaving a ragged block", () => {
    expect(formatOutput(result({ stdout: "hi\n\n\n" }))).toBe(
      "— ran 2026-08-27 10:04 UTC · ok · 412ms\nhi",
    );
  });

  it("keeps stderr when there is no stdout at all", () => {
    const text = formatOutput(result({ stderr: "only an error", exitCode: 1 }));
    expect(text).toContain("— stderr\nonly an error");
    expect(text).not.toContain("(no output)");
  });
});

describe("formatOutput — the cap", () => {
  it("cuts output that would bloat the repository", () => {
    const text = formatOutput(result({ stdout: "x".repeat(MAX_OUTPUT + 5000) }));
    expect(text.length).toBeLessThan(MAX_OUTPUT + 200);
  });

  it("says in the note itself that it cut something", () => {
    const text = formatOutput(result({ stdout: "x".repeat(MAX_OUTPUT + 1) }));
    expect(text).toContain("output cut off at 20,000 characters");
  });

  it("leaves output just under the cap untouched", () => {
    const exact = "y".repeat(MAX_OUTPUT);
    expect(formatOutput(result({ stdout: exact }))).toContain(exact);
    expect(formatOutput(result({ stdout: exact }))).not.toContain("cut off");
  });
});
