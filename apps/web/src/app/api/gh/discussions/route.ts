import { type NextRequest } from "next/server";
import {
  GitHubError,
  MAX_DISCUSSION_BODY,
  discussionBody,
  pickCategory,
} from "@forkleaf/github-client";
import {
  ApiError,
  assertName,
  assertRef,
  handle,
  normalize,
  requireClient,
} from "@/lib/api-helpers";

/**
 * The conversation about a note, kept in the repository's GitHub Discussions.
 *
 * GET reads it — or says nobody has started one, or that Discussions is off.
 * POST adds a message, opening the discussion first if this is the first one.
 * Every message lives on GitHub; nothing is stored here.
 *
 * The browser polls GET while a note is open, so it passes back the number of
 * the discussion it found last time and the read is usually one request.
 */

/**
 * A GraphQL node id. Two shapes: the current `DC_kwDO…` (URL-safe base64 with
 * a type prefix) and the legacy plain base64 older comments still carry,
 * which can contain `+` and `/`. It travels as a GraphQL variable, never in a
 * URL or a query string, so this is about rejecting junk, not escaping.
 */
const NODE_ID = /^[\w=+/-]{1,200}$/;

/** A repository path, the way notes are addressed everywhere else. */
function readPath(value: unknown): string {
  const path = typeof value === "string" ? normalize(value) : "";
  if (!path || path.length > 1024) {
    throw new ApiError(400, "validation", "Name the note this conversation is about.");
  }
  return path;
}

function readNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0 || number > 10_000_000) {
    throw new ApiError(400, "validation", "That is not a discussion number.");
  }
  return number;
}

/**
 * GitHub's refusal, said in a way that helps.
 *
 * "Resource not accessible by integration" is what GitHub says when ForkLeaf's
 * GitHub App was never given the Discussions permission, or was not installed
 * on this repository. Neither is something the reader did wrong, and neither
 * is fixed by trying again.
 */
async function explained<T>(run: () => Promise<T>): Promise<T> {
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

export async function GET(request: NextRequest) {
  return handle(async () => {
    const { client } = await requireClient();
    const params = new URL(request.url).searchParams;

    const owner = assertName(params.get("owner") ?? "", "owner");
    const repo = assertName(params.get("repo") ?? "", "repository");
    const path = readPath(params.get("path"));
    const knownNumber = readNumber(params.get("number"));

    return explained(() => client.findNoteConversation({ owner, repo, path, knownNumber }));
  });
}

export async function POST(request: NextRequest) {
  return handle(async () => {
    const { client } = await requireClient();
    const input = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!input) throw new ApiError(400, "validation", "Expected a JSON body.");

    const owner = assertName(typeof input.owner === "string" ? input.owner : "", "owner");
    const repo = assertName(typeof input.repo === "string" ? input.repo : "", "repository");
    const branch = assertRef(typeof input.branch === "string" ? input.branch : "");
    const path = readPath(input.path);
    const knownNumber = readNumber(input.number);

    const body = typeof input.body === "string" ? input.body.trim() : "";
    if (!body) throw new ApiError(400, "validation", "Write something to send.");
    if (body.length > MAX_DISCUSSION_BODY) {
      throw new ApiError(400, "validation", "That message is longer than GitHub allows.");
    }

    const replyTo = input.replyTo;
    if (
      replyTo !== undefined &&
      replyTo !== null &&
      !(typeof replyTo === "string" && NODE_ID.test(replyTo))
    ) {
      throw new ApiError(400, "validation", "That is not a message to reply to.");
    }

    const title =
      (typeof input.title === "string" ? input.title.trim() : "") ||
      path
        .split("/")
        .pop()!
        .replace(/\.mdx?$/i, "");

    return explained(async () => {
      const found = await client.findNoteConversation({ owner, repo, path, knownNumber });

      if (!found.repo.enabled) {
        throw new ApiError(
          409,
          "discussions-off",
          "Discussions is switched off for this repository. Turn it on in the repository's settings on GitHub.",
        );
      }
      if (!found.repo.canComment) {
        throw new ApiError(
          403,
          "forbidden",
          "Only this repository's collaborators can join its conversations.",
        );
      }

      let discussion = found.discussion
        ? { id: found.discussion.id, number: found.discussion.number }
        : null;

      if (found.discussion?.locked) {
        throw new ApiError(409, "locked", "This conversation has been locked on GitHub.");
      }

      if (!discussion) {
        if (replyTo) throw new ApiError(409, "conflict", "That conversation is no longer there.");

        const category = pickCategory(found.repo.categories);
        if (!category) {
          throw new ApiError(
            409,
            "no-category",
            "This repository has no Discussions category ForkLeaf can post in. Add one — General is the usual choice — on GitHub.",
          );
        }

        discussion = await client.createNoteDiscussion({
          repositoryId: found.repo.id,
          categoryId: category.id,
          title,
          body: discussionBody({ owner, repo, branch, path }),
        });
      }

      const comment = await client.addDiscussionComment({
        discussionId: discussion.id,
        body,
        ...(typeof replyTo === "string" ? { replyToId: replyTo } : {}),
      });

      return { number: discussion.number, comment };
    });
  });
}
