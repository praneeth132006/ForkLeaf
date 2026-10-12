import { type NextRequest } from "next/server";
import { pickCategory, type GitHubClient } from "@forkleaf/github-client";
import { ApiError, assertName, handle, requireClient } from "@/lib/api-helpers";
import { explained } from "@/lib/discussions-api";
import {
  ROOM_TITLE,
  isRoom,
  progressComment,
  roomBody,
  viewersProgressComment,
  type StudyProgress,
} from "@/lib/study-room";

/**
 * A shared deck's study room: one discussion in the deck's repository where
 * everybody studying it keeps one progress line.
 *
 * GET reads the room (and says whether one can be opened at all). POST brings
 * the signed-in member's line up to date — opening the room first if nobody
 * has yet, and rewriting their earlier line rather than adding another.
 */

/** Discussions are listed a page at a time; a room is looked for in the first few. */
const PAGES = 4;

async function findRoom(client: GitHubClient, owner: string, repo: string) {
  let after: string | undefined;
  let first: Awaited<ReturnType<GitHubClient["listDiscussions"]>> | null = null;
  for (let page = 0; page < PAGES; page += 1) {
    const lounge = await client.listDiscussions({ owner, repo, ...(after ? { after } : {}) });
    first ??= lounge;
    const room = lounge.threads.find((thread) => isRoom({ title: thread.title }));
    if (room) return { repo: lounge.repo, number: room.number };
    if (!lounge.nextCursor) break;
    after = lounge.nextCursor;
  }
  return { repo: first!.repo, number: null };
}

function readRepo(owner: unknown, repo: unknown) {
  return {
    owner: assertName(typeof owner === "string" ? owner : "", "owner"),
    repo: assertName(typeof repo === "string" ? repo : "", "repository"),
  };
}

export async function GET(request: NextRequest) {
  return handle(async () => {
    const { client } = await requireClient();
    const params = new URL(request.url).searchParams;
    const { owner, repo } = readRepo(params.get("owner"), params.get("repo"));

    return explained(async () => {
      const found = await findRoom(client, owner, repo);
      if (found.number === null) {
        return { enabled: found.repo.enabled, url: found.repo.url, room: null, comments: [] };
      }
      const { discussion } = await client.readDiscussion({ owner, repo, number: found.number });
      if (!discussion || !isRoom(discussion)) {
        return { enabled: found.repo.enabled, url: found.repo.url, room: null, comments: [] };
      }
      return {
        enabled: found.repo.enabled,
        url: found.repo.url,
        room: { number: discussion.number, url: discussion.url },
        comments: discussion.comments.map((comment) => ({
          id: comment.id,
          body: comment.body,
          createdAt: comment.createdAt,
          viewerDidAuthor: comment.viewerDidAuthor,
          author: comment.author
            ? { login: comment.author.login, avatarUrl: comment.author.avatarUrl }
            : null,
        })),
      };
    });
  });
}

function readProgressInput(value: unknown): StudyProgress {
  const data = (value ?? {}) as Record<string, unknown>;
  const number = (key: string) => {
    const raw = data[key];
    if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 0 || raw > 1_000_000) {
      throw new ApiError(400, "validation", `Progress needs a whole number for ${key}.`);
    }
    return raw;
  };
  const on = typeof data.on === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data.on) ? data.on : null;
  if (!on) throw new ApiError(400, "validation", "Progress needs the day it is for.");
  return {
    week: number("week"),
    streak: number("streak"),
    mastered: number("mastered"),
    cards: number("cards"),
    on,
  };
}

export async function POST(request: NextRequest) {
  return handle(async () => {
    const { client } = await requireClient();
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const { owner, repo } = readRepo(body.owner, body.repo);
    const deck =
      typeof body.deck === "string" && body.deck.trim()
        ? body.deck.trim().slice(0, 120)
        : `${owner}/${repo}`;
    const progress = readProgressInput(body.progress);

    return explained(async () => {
      const found = await findRoom(client, owner, repo);
      if (!found.repo.enabled) {
        throw new ApiError(
          409,
          "discussions-off",
          `Discussions is switched off in ${owner}/${repo}. Its owner can turn it on in the repository's Settings → General → Features, and the study room opens there.`,
        );
      }

      let number = found.number;
      if (number === null) {
        const category = pickCategory(found.repo.categories);
        if (!category) {
          throw new ApiError(
            409,
            "no-category",
            `${owner}/${repo} has no Discussions category to open a study room in.`,
          );
        }
        const created = await client.createNoteDiscussion({
          repositoryId: found.repo.id,
          categoryId: category.id,
          title: ROOM_TITLE,
          body: roomBody(deck),
        });
        number = created.number;
      }

      const { discussion } = await client.readDiscussion({ owner, repo, number });
      if (!discussion) throw new ApiError(404, "not-found", "The study room could not be read.");

      const line = progressComment(progress);
      const mine = viewersProgressComment(discussion.comments);
      if (mine) await client.updateDiscussionComment({ commentId: mine.id, body: line });
      else await client.addDiscussionComment({ discussionId: discussion.id, body: line });

      return { room: { number: discussion.number, url: discussion.url } };
    });
  });
}
