import { type NextRequest } from "next/server";
import { discussionBody, pickCategory } from "@forkleaf/github-client";
import {
  ApiError,
  assertName,
  assertRef,
  handle,
  normalize,
  requireClient,
} from "@/lib/api-helpers";
import { explained, isNodeId, readBody, readNumber } from "@/lib/discussions-api";

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

/** A repository path, the way notes are addressed everywhere else. */
function readPath(value: unknown): string {
  const path = typeof value === "string" ? normalize(value) : "";
  if (!path || path.length > 1024) {
    throw new ApiError(400, "validation", "Name the note this conversation is about.");
  }
  return path;
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

    const body = readBody(input.body);

    const replyTo = input.replyTo;
    if (replyTo !== undefined && replyTo !== null && !isNodeId(replyTo)) {
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
