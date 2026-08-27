import { type NextRequest } from "next/server";
import { handle, requireClient, ApiError } from "@/lib/api-helpers";
import { enforceRateLimit } from "@/lib/rate-limit";
import { MAX_OUTPUT, runnerFor } from "@forkleaf/markdown-engine";

/**
 * Runs one fenced code block in a throwaway virtual machine.
 *
 * The block runs nowhere near the reader's own machine and nowhere near this
 * server: a Vercel Sandbox is a Firecracker microVM created for this one
 * request and destroyed at the end of it, so a script that deletes everything
 * it can reach deletes only its own empty VM. That isolation is the whole
 * reason this route can exist — a note is a document, and documents arrive
 * from other people.
 *
 * It does have network access, deliberately. A runbook that cannot reach the
 * host it is about is a text file, and looking something up is the entire
 * point of the scripts people keep in notes.
 */

/** Long enough for a real command, short enough to bound a stuck one. */
const RUN_TIMEOUT_MS = 30_000;

/** Head-room over the run itself, so the VM outlives the command it hosts. */
const SANDBOX_TIMEOUT_MS = 90_000;

/**
 * The largest script accepted.
 *
 * A fenced block in a note is a script somebody typed. Anything approaching
 * this is not that, and shipping it to a VM is a waste of both ends.
 */
const MAX_CODE = 64_000;

/** Runs allowed per client, per window. Compute is not free and this is a note. */
const RATE_LIMIT = { name: "run", limit: 12, windowMs: 5 * 60_000 };

/**
 * Vercel functions default to a shorter ceiling than the run itself allows,
 * which would kill the request while the sandbox was still working and report
 * it as a network error rather than a timeout.
 */
export const maxDuration = 120;

/** True when this deployment can actually reach the sandbox API. */
function sandboxCredentials(): Record<string, string> | null {
  const { VERCEL_TOKEN, VERCEL_TEAM_ID, VERCEL_PROJECT_ID, VERCEL_OIDC_TOKEN } = process.env;

  if (VERCEL_TOKEN && VERCEL_TEAM_ID && VERCEL_PROJECT_ID) {
    return { token: VERCEL_TOKEN, teamId: VERCEL_TEAM_ID, projectId: VERCEL_PROJECT_ID };
  }

  // On Vercel the SDK authenticates itself from the OIDC token in the
  // environment, and passing nothing is correct.
  if (VERCEL_OIDC_TOKEN) return {};

  return null;
}

function readBody(body: unknown): { language: string; code: string } {
  if (typeof body !== "object" || body === null) {
    throw new ApiError(400, "validation", "Expected a JSON body.");
  }

  const { language, code } = body as Record<string, unknown>;

  if (typeof language !== "string" || typeof code !== "string") {
    throw new ApiError(400, "validation", "A language and some code are required.");
  }

  if (code.trim() === "") {
    throw new ApiError(400, "validation", "There is nothing in that block to run.");
  }

  if (code.length > MAX_CODE) {
    throw new ApiError(
      400,
      "validation",
      `That block is larger than ${MAX_CODE.toLocaleString("en-US")} characters.`,
    );
  }

  return { language, code };
}

export async function POST(request: NextRequest) {
  return handle(async () => {
    // Signed in, because this spends real compute on somebody's behalf.
    await requireClient();
    enforceRateLimit(request, RATE_LIMIT);

    const { language, code } = readBody(await request.json().catch(() => null));

    // The allow-list is the security boundary that matters here: the language
    // decides the interpreter, and nothing from the request reaches a shell as
    // a command name.
    const runner = runnerFor(language);
    if (!runner) {
      throw new ApiError(
        400,
        "validation",
        `ForkLeaf cannot run ${language || "unlabelled"} blocks.`,
      );
    }

    const credentials = sandboxCredentials();
    if (!credentials) {
      // Naming the variables matters: this is a deployment-configuration
      // problem, and the person who hits it is usually the person who can fix
      // it. A message that only says "not configured" sends them to the source.
      throw new ApiError(
        503,
        "unavailable",
        "Running blocks needs a Vercel Sandbox. Set VERCEL_TOKEN, VERCEL_TEAM_ID and VERCEL_PROJECT_ID for local development — on Vercel it authenticates itself.",
      );
    }

    // Imported here rather than at module scope so the rest of the API is not
    // held hostage to a native dependency it never uses.
    const { Sandbox } = await import("@vercel/sandbox");

    const started = Date.now();
    let sandbox: Awaited<ReturnType<typeof Sandbox.create>> | null = null;

    try {
      sandbox = await Sandbox.create({
        ...credentials,
        // The universal image carries bash, python3 and node, which is exactly
        // the set this route will run. `runtime` is the deprecated spelling.
        image: "vercel/sandbox/universal",
        timeout: SANDBOX_TIMEOUT_MS,
      });

      const path = `/tmp/block.${runner.extension}`;
      await sandbox.writeFiles([{ path, content: Buffer.from(code, "utf8") }]);

      const finished = await sandbox.runCommand(runner.command, [path], {
        timeoutMs: RUN_TIMEOUT_MS,
      });

      const [stdout, stderr] = await Promise.all([finished.stdout(), finished.stderr()]);

      return {
        stdout: stdout.slice(0, MAX_OUTPUT),
        stderr: stderr.slice(0, MAX_OUTPUT),
        exitCode: finished.exitCode,
        ms: finished.durationMs ?? Date.now() - started,
        truncated: stdout.length > MAX_OUTPUT || stderr.length > MAX_OUTPUT,
        ranAt: new Date().toISOString(),
      };
    } catch (error) {
      // A run that could not happen is reported as a result with a reason
      // rather than as a failed request: the note should record the attempt.
      const reason = error instanceof Error ? error.message : "the sandbox failed";

      return {
        stdout: "",
        stderr: "",
        exitCode: -1,
        ms: Date.now() - started,
        truncated: false,
        ranAt: new Date().toISOString(),
        failure: /timed?.?out/i.test(reason)
          ? `timed out after ${RUN_TIMEOUT_MS / 1000}s`
          : `could not run — ${reason}`,
      };
    } finally {
      // The VM bills for as long as it lives, so it is never left behind.
      await sandbox?.stop().catch(() => {});
    }
  });
}
