import { type NextRequest } from "next/server";
import {
  MAX_PASSAGE,
  discussionBody,
  pageHash,
  passageBody,
  passageTitle,
  pickCategory,
  type ThreadSummaryDto,
} from "@forkleaf/github-client";
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
 * With `passages=1`, GET also lists the threads opened on passages of the
 * note; POST with a `passage` opens a new one of those instead of writing in
 * the note's own conversation.
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
    const withPassages = params.get("passages") === "1";

    return explained(async () => {
      // Side by side, and the passages allowed to fail on their own: a search
      // that is having a bad minute is no reason to hide the conversation.
      const [conversation, passages] = await Promise.all([
        client.findNoteConversation({ owner, repo, path, knownNumber }),
        withPassages
          ? client
              .findPassageThreads({ owner, repo, path })
              .catch((): ThreadSummaryDto[] | null => null)
          : Promise.resolve(undefined),
      ]);
      return passages === undefined ? conversation : { ...conversation, passages };
    });
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

    const passage =
      input.passage === undefined || input.passage === null
        ? null
        : typeof input.passage === "string"
          ? input.passage.trim()
          : "";
    if (passage !== null && (passage === "" || passage.length > MAX_PASSAGE)) {
      throw new ApiError(400, "validation", "Choose a passage of up to 500 characters.");
    }

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

      if (passage !== null) {
        // A passage gets a thread of its own, every time: two people asking
        // about two sentences are two conversations, and a reply belongs to
        // a thread, not to a passage.
        const category = pickCategory(found.repo.categories);
        if (!category) {
          throw new ApiError(
            409,
            "no-category",
            "This repository has no Discussions category ForkLeaf can post in. Add one — General is the usual choice — on GitHub.",
          );
        }
        const opened = await client.createNoteDiscussion({
          repositoryId: found.repo.id,
          categoryId: category.id,
          title: passageTitle(passage, title),
          body: passageBody({ owner, repo, branch, path, quote: passage }),
        });
        const comment = await client.addDiscussionComment({ discussionId: opened.id, body });
        return { number: opened.number, comment, passage: true };
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
          body: discussionBody({ owner, repo, branch, path, hash: await pageHash(path) }),
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
