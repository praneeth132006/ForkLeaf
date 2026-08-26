import { type NextRequest } from "next/server";
import { handle, requireClient, ApiError, assertName } from "@/lib/api-helpers";

/**
 * The review on a note's pull request: what was said, and merging when it is
 * settled.
 *
 * Opening the request already worked. Reading the review meant going to
 * github.com and reading your own prose as a unified diff, which is the part
 * that made "study something, then have it reviewed" not actually work.
 */

/** A pull request number, which is interpolated into the upstream URL. */
function readNumber(value: string | null): number {
  const number = Number(value);
  if (!value || !Number.isInteger(number) || number <= 0) {
    throw new ApiError(400, "validation", "A pull request number is required.");
  }
  return number;
}

/** Everything a review panel needs, in one round trip. */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const { client } = await requireClient();
    const params = new URL(request.url).searchParams;

    const owner = assertName(params.get("owner") ?? "", "owner");
    const repo = assertName(params.get("repo") ?? "", "repository");

    /**
     * A branch instead of a number, for the panel that does not know one yet.
     *
     * The editor knows which branch it is on; it does not know whether that
     * branch is under review. Answering with `{ pull: null }` rather than a
     * 404 is deliberate — "no review open" is an ordinary state, not a
     * failure, and a panel should not have to read error codes to learn it.
     */
    const head = params.get("head");
    if (head) {
      const found = await client.findOpenPullRequestForBranch(owner, repo, head);
      if (!found) return { pull: null, comments: [], reviews: [], conversation: [] };

      const [pull, comments, reviews, conversation] = await Promise.all([
        client.getPullRequest(owner, repo, found.number),
        client.listReviewComments(owner, repo, found.number),
        client.listReviews(owner, repo, found.number),
        client.listConversation(owner, repo, found.number),
      ]);

      return { pull, comments, reviews, conversation };
    }

    const number = readNumber(params.get("number"));

    // In parallel: four independent reads, and the panel is useless until it
    // has all of them.
    const [pull, comments, reviews, conversation] = await Promise.all([
      client.getPullRequest(owner, repo, number),
      client.listReviewComments(owner, repo, number),
      client.listReviews(owner, repo, number),
      client.listConversation(owner, repo, number),
    ]);

    return { pull, comments, reviews, conversation };
  });
}

/** Replying to a comment, adding to the conversation, or merging. */
export async function POST(request: NextRequest) {
  return handle(async () => {
    const { client } = await requireClient();
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

    if (!body) throw new ApiError(400, "validation", "Expected a JSON body.");

    const owner = assertName(String(body.owner ?? ""), "owner");
    const repo = assertName(String(body.repo ?? ""), "repository");
    const number = readNumber(String(body.number ?? ""));
    const action = String(body.action ?? "");

    if (action === "merge") {
      const method = String(body.method ?? "squash");
      if (method !== "merge" && method !== "squash" && method !== "rebase") {
        throw new ApiError(400, "validation", `${method} is not a way to merge.`);
      }

      const result = await client.mergePullRequest(owner, repo, number, {
        method,
        title: typeof body.title === "string" ? body.title : undefined,
      });

      // GitHub answers a refused merge with 405 and a reason, which `handle`
      // has already turned into an error. Reaching here with merged false is
      // the odd case worth naming rather than reporting as success.
      if (!result.merged) {
        throw new ApiError(409, "conflict", result.message || "GitHub would not merge that.");
      }

      return result;
    }

    const text = typeof body.body === "string" ? body.body.trim() : "";
    if (!text) throw new ApiError(400, "validation", "A reply cannot be empty.");

    if (action === "reply") {
      const commentId = Number(body.commentId);
      if (!Number.isInteger(commentId) || commentId <= 0) {
        throw new ApiError(400, "validation", "A comment to reply to is required.");
      }

      return { comment: await client.replyToReviewComment(owner, repo, number, commentId, text) };
    }

    if (action === "comment") {
      return { comment: await client.addConversationComment(owner, repo, number, text) };
    }

    throw new ApiError(400, "validation", `${action || "That"} is not something you can do here.`);
  });
}
