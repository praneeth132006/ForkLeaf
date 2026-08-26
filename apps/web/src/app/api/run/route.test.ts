import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.fn();
const writeFiles = vi.fn();
const runCommand = vi.fn();
const stop = vi.fn();

vi.mock("@/lib/session", () => ({
  getSession: () => Promise.resolve({ token: "t", user: { login: "me" } }),
}));

vi.mock("@forkleaf/github-client", async () => {
  const actual =
    await vi.importActual<typeof import("@forkleaf/github-client")>("@forkleaf/github-client");
  return { ...actual, GitHubClient: class {} };
});

vi.mock("@vercel/sandbox", () => ({ Sandbox: { create } }));

const { POST } = await import("./route");
const { resetRateLimits } = await import("@/lib/rate-limit");

/** A sandbox whose command finishes the way the test asks it to. */
function sandboxReturning(result: {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  durationMs?: number;
}) {
  runCommand.mockResolvedValue({
    stdout: () => Promise.resolve(result.stdout ?? ""),
    stderr: () => Promise.resolve(result.stderr ?? ""),
    exitCode: result.exitCode ?? 0,
    durationMs: result.durationMs,
  });
  create.mockResolvedValue({ writeFiles, runCommand, stop });
}

async function post(body: unknown, ip = "test-client") {
  const request = new Request("http://localhost/api/run", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

  const response = await POST(request as never);
  return { status: response.status, body: await response.json() };
}

beforeEach(() => {
  resetRateLimits();
  process.env.VERCEL_TOKEN = "token";
  process.env.VERCEL_TEAM_ID = "team";
  process.env.VERCEL_PROJECT_ID = "project";
  stop.mockResolvedValue(undefined);
  writeFiles.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.VERCEL_TOKEN;
  delete process.env.VERCEL_TEAM_ID;
  delete process.env.VERCEL_PROJECT_ID;
  delete process.env.VERCEL_OIDC_TOKEN;
});

describe("POST /api/run — what it refuses", () => {
  it("refuses a body that is not JSON", async () => {
    expect((await post("not json")).status).toBe(400);
  });

  it("refuses a request with no code", async () => {
    expect((await post({ language: "bash" })).status).toBe(400);
  });

  it("refuses a block containing only whitespace", async () => {
    const { status, body } = await post({ language: "bash", code: "   \n  " });
    expect(status).toBe(400);
    expect(body.error.message).toMatch(/nothing in that block/i);
  });

  it("refuses a language nothing can interpret", async () => {
    const { status, body } = await post({ language: "rust", code: "fn main() {}" });
    expect(status).toBe(400);
    expect(body.error.message).toMatch(/cannot run rust/i);
  });

  it("never starts a sandbox for a refused request", async () => {
    await post({ language: "rust", code: "fn main() {}" });
    expect(create).not.toHaveBeenCalled();
  });

  it("refuses a block far larger than anything anyone typed", async () => {
    const { status } = await post({ language: "bash", code: "x".repeat(64_001) });
    expect(status).toBe(400);
  });

  it("says so plainly when the deployment has no sandbox configured", async () => {
    delete process.env.VERCEL_TOKEN;
    const { status, body } = await post({ language: "bash", code: "echo hi" });

    expect(status).toBe(503);
    expect(body.error.message).toMatch(/not configured/i);
  });

  it("accepts OIDC alone, which is how it authenticates on Vercel", async () => {
    delete process.env.VERCEL_TOKEN;
    process.env.VERCEL_OIDC_TOKEN = "oidc";
    sandboxReturning({ stdout: "hi" });

    expect((await post({ language: "bash", code: "echo hi" })).status).toBe(200);
    // Nothing is passed, so the SDK reads the OIDC token itself.
    expect(create).toHaveBeenCalledWith(expect.not.objectContaining({ token: expect.anything() }));
  });
});

describe("POST /api/run — running a block", () => {
  it("returns what the command printed", async () => {
    sandboxReturning({ stdout: "hello\n", exitCode: 0, durationMs: 120 });
    const { status, body } = await post({ language: "bash", code: "echo hello" });

    expect(status).toBe(200);
    expect(body.stdout).toBe("hello\n");
    expect(body.exitCode).toBe(0);
    expect(body.ms).toBe(120);
  });

  it("writes the block to a file and runs the interpreter on it", async () => {
    sandboxReturning({ stdout: "" });
    await post({ language: "python", code: "print(1)" });

    expect(writeFiles).toHaveBeenCalledWith([
      { path: "/tmp/block.py", content: Buffer.from("print(1)", "utf8") },
    ]);
    expect(runCommand).toHaveBeenCalledWith("python3", ["/tmp/block.py"], {
      timeoutMs: 30_000,
    });
  });

  it("runs a shell block under bash whichever alias was fenced", async () => {
    sandboxReturning({ stdout: "" });
    await post({ language: "sh", code: "ls" });

    expect(runCommand).toHaveBeenCalledWith("bash", ["/tmp/block.sh"], expect.anything());
  });

  it("uses the universal image, which carries all three interpreters", async () => {
    sandboxReturning({ stdout: "" });
    await post({ language: "bash", code: "ls" });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ image: "vercel/sandbox/universal" }),
    );
  });

  it("reports a non-zero exit as a result, not as an error", async () => {
    sandboxReturning({ stderr: "no such file", exitCode: 2 });
    const { status, body } = await post({ language: "bash", code: "cat nope" });

    expect(status).toBe(200);
    expect(body.exitCode).toBe(2);
    expect(body.stderr).toBe("no such file");
  });

  it("stamps when the run finished", async () => {
    sandboxReturning({ stdout: "hi" });
    const { body } = await post({ language: "bash", code: "echo hi" });

    expect(Number.isNaN(Date.parse(body.ranAt))).toBe(false);
  });

  it("caps enormous output before it reaches the note", async () => {
    sandboxReturning({ stdout: "x".repeat(50_000) });
    const { body } = await post({ language: "bash", code: "yes" });

    expect(body.stdout).toHaveLength(20_000);
    expect(body.truncated).toBe(true);
  });

  it("falls back to wall-clock time when the sandbox reports no duration", async () => {
    sandboxReturning({ stdout: "hi", durationMs: undefined });
    const { body } = await post({ language: "bash", code: "echo hi" });

    expect(typeof body.ms).toBe("number");
    expect(body.ms).toBeGreaterThanOrEqual(0);
  });
});

describe("POST /api/run — when the run itself fails", () => {
  it("reports a timeout as a result the note can record", async () => {
    create.mockResolvedValue({ writeFiles, runCommand, stop });
    runCommand.mockRejectedValue(new Error("command timed out"));

    const { status, body } = await post({ language: "bash", code: "sleep 999" });

    expect(status).toBe(200);
    expect(body.failure).toMatch(/timed out after 30s/);
  });

  it("reports a sandbox that never started, rather than a bare 500", async () => {
    create.mockRejectedValue(new Error("no capacity"));
    const { status, body } = await post({ language: "bash", code: "echo hi" });

    expect(status).toBe(200);
    expect(body.failure).toMatch(/could not run — no capacity/);
  });

  it("stops the sandbox even when the command threw", async () => {
    create.mockResolvedValue({ writeFiles, runCommand, stop });
    runCommand.mockRejectedValue(new Error("boom"));

    await post({ language: "bash", code: "echo hi" });
    expect(stop).toHaveBeenCalled();
  });

  it("stops the sandbox after a successful run", async () => {
    sandboxReturning({ stdout: "hi" });
    await post({ language: "bash", code: "echo hi" });

    expect(stop).toHaveBeenCalled();
  });

  it("does not fail the request when stopping the sandbox fails", async () => {
    sandboxReturning({ stdout: "hi" });
    stop.mockRejectedValue(new Error("already gone"));

    expect((await post({ language: "bash", code: "echo hi" })).status).toBe(200);
  });
});

describe("POST /api/run — rate limiting", () => {
  it("stops a client running far more than a person would", async () => {
    sandboxReturning({ stdout: "" });

    const statuses: number[] = [];
    for (let i = 0; i < 14; i += 1) {
      statuses.push((await post({ language: "bash", code: "echo hi" }, "flooder")).status);
    }

    expect(statuses.filter((s) => s === 200)).toHaveLength(12);
    expect(statuses.at(-1)).toBe(429);
  });

  it("budgets each client separately", async () => {
    sandboxReturning({ stdout: "" });

    for (let i = 0; i < 12; i += 1) await post({ language: "bash", code: "echo" }, "first");
    expect((await post({ language: "bash", code: "echo" }, "second")).status).toBe(200);
  });
});
