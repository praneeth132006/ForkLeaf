import "server-only";
import { GitHubError, MAX_DISCUSSION_BODY } from "@forkleaf/github-client";
import { ApiError } from "@/lib/api-helpers";

/**
 * Checks shared by the routes that talk to GitHub Discussions — a note's
 * conversation and the Lounge — so a value one route refuses is never one the
 * other lets through.
 */

/**
 * A GraphQL node id. Two shapes: the current `DC_kwDO…` (URL-safe base64 with
 * a type prefix) and the legacy plain base64 older comments still carry,
 * which can contain `+` and `/`. It travels as a GraphQL variable, never in a
 * URL or a query string, so this is about rejecting junk, not escaping.
 */
const NODE_ID = /^[\w=+/-]{1,200}$/;

export function isNodeId(value: unknown): value is string {
  return typeof value === "string" && NODE_ID.test(value);
}

export function readNodeId(value: unknown, label: string): string {
  if (!isNodeId(value)) throw new ApiError(400, "validation", `That is not ${label}.`);
  return value;
}

/** A discussion number, or undefined when none was given. */
export function readNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0 || number > 10_000_000) {
    throw new ApiError(400, "validation", "That is not a discussion number.");
  }
  return number;
}

/** A message body: trimmed, not empty, and within GitHub's limit. */
export function readBody(value: unknown): string {
  const body = typeof value === "string" ? value.trim() : "";
  if (!body) throw new ApiError(400, "validation", "Write something to send.");
  if (body.length > MAX_DISCUSSION_BODY) {
    throw new ApiError(400, "validation", "That message is longer than GitHub allows.");
  }
  return body;
}

/**
 * GitHub's refusal, said in a way that helps.
 *
 * "Resource not accessible by integration" is what GitHub says when ForkLeaf's
 * GitHub App was never given the Discussions permission, or was not installed
 * on this repository. Neither is something the reader did wrong, and neither
 * is fixed by trying again.
 */
export async function explained<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof GitHubError && error.code === "forbidden") {
      throw new ApiError(
        403,
        "discussions-forbidden",
        "GitHub did not let ForkLeaf use Discussions in this repository. The repository's owner may need to approve ForkLeaf's access to Discussions on GitHub.",
      );
    }
    throw error;
  }
}
