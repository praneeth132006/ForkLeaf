import { type NextRequest } from "next/server";
import { MAX_DISCUSSION_TITLE } from "@forkleaf/github-client";
import { ApiError, assertName, handle, requireClient } from "@/lib/api-helpers";
import { explained, isNodeId, readBody, readNodeId, readNumber } from "@/lib/discussions-api";

/**
 * The Lounge: every conversation in a notebook, as channels and threads.
 *
 * A channel is a Discussions category and a thread is a discussion — the ones
 * ForkLeaf opened about notes, and the ones people started on github.com.
 *
 * GET with no `number` lists threads (newest activity first, optionally in one
 * category, a page at a time). GET with a `number` reads one thread.
 * POST does one thing, named by `action`:
 *
 * - `reply`  — a message in a thread, or a reply to one of its messages
 * - `start`  — a new thread in a channel
 * - `answer` — mark a message as the answer, or take that back
 */

function readRepo(source: { owner?: unknown; repo?: unknown }): { owner: string; repo: string } {
  return {
    owner: assertName(typeof source.owner === "string" ? source.owner : "", "owner"),
    repo: assertName(typeof source.repo === "string" ? source.repo : "", "repository"),
  };
}

/** GraphQL paging cursors are opaque base64; anything else is not one of ours. */
const CURSOR = /^[\w=+/:-]{1,300}$/;

export async function GET(request: NextRequest) {
  return handle(async () => {
    const { client } = await requireClient();
    const params = new URL(request.url).searchParams;
    const { owner, repo } = readRepo({
      owner: params.get("owner") ?? "",
      repo: params.get("repo") ?? "",
    });

    const number = readNumber(params.get("number"));
    if (number !== undefined) {
      return explained(() => client.readDiscussion({ owner, repo, number }));
    }

    const category = params.get("category");
    if (category !== null && !isNodeId(category)) {
      throw new ApiError(400, "validation", "That is not a channel.");
    }
    const after = params.get("after");
    if (after !== null && !CURSOR.test(after)) {
      throw new ApiError(400, "validation", "That is not a page of threads.");
    }

    return explained(() =>
      client.listDiscussions({
        owner,
        repo,
        ...(category ? { categoryId: category } : {}),
        ...(after ? { after } : {}),
      }),
    );
  });
}

export async function POST(request: NextRequest) {
  return handle(async () => {
    const { client } = await requireClient();
    const input = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!input) throw new ApiError(400, "validation", "Expected a JSON body.");

    // Validated even though the writes below address GitHub by node id: the
    // pair is what the reader is looking at, and a request that names no
    // repository is not one this route should act on.
    readRepo(input);

    switch (input.action) {
      case "reply": {
        const discussionId = readNodeId(input.discussionId, "a thread");
        const body = readBody(input.body);
        const replyTo =
          input.replyTo === undefined || input.replyTo === null
            ? undefined
            : readNodeId(input.replyTo, "a message to reply to");

        const comment = await explained(() =>
          client.addDiscussionComment({
            discussionId,
            body,
            ...(replyTo ? { replyToId: replyTo } : {}),
          }),
        );
        return { comment };
      }

      case "start": {
        const repositoryId = readNodeId(input.repositoryId, "a repository");
        const categoryId = readNodeId(input.categoryId, "a channel");
        const title = typeof input.title === "string" ? input.title.trim() : "";
        if (!title) throw new ApiError(400, "validation", "Give the thread a title.");
        if (title.length > MAX_DISCUSSION_TITLE) {
          throw new ApiError(400, "validation", "That title is longer than GitHub allows.");
        }
        const body = readBody(input.body);

        const created = await explained(() =>
          client.createNoteDiscussion({ repositoryId, categoryId, title, body }),
        );
        return { number: created.number };
      }

      case "answer": {
        const commentId = readNodeId(input.commentId, "a message");
        if (typeof input.answer !== "boolean") {
          throw new ApiError(400, "validation", "Say whether this is the answer.");
        }
        const answer = input.answer;
        await explained(() => client.setDiscussionAnswer({ commentId, answer }));
        return { ok: true };
      }

      default:
        throw new ApiError(400, "validation", "Unknown action.");
    }
  });
}
