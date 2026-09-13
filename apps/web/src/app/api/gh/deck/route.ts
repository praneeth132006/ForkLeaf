import { type NextRequest } from "next/server";
import { GitHubClient } from "@forkleaf/github-client";
import { DECK_FILE, deckCardsOf, deckFile, deckRepoName } from "@forkleaf/markdown-engine";
import type { RepoRef } from "@forkleaf/types";
import {
  ApiError,
  assertName,
  handle,
  requireClient,
  withRateLimitAdvice,
} from "@/lib/api-helpers";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getLiveSession } from "@/lib/session";

/**
 * Decks you can fork.
 *
 * GET reads a shared deck — its `deck.md` and the commit it is at, or the file
 * as it was at an earlier commit — and works without signing in, because a
 * deck is public and somebody copying one should not need an account first.
 *
 * POST publishes the cards of a note as a public repository of the signer's
 * own: a README saying what it is and how to copy it, and `deck.md`. Always
 * public, since sharing is the point; the text the cards are written in is
 * rebuilt from the card lines only, so nothing else from the note leaves it.
 */

const MAX_CARDS = 2000;
const MAX_BODY = 500_000;
const SHA = /^[0-9a-f]{7,40}$/i;

export async function GET(request: NextRequest) {
  return handle(async () => {
    enforceRateLimit(request, { name: "deck-read", limit: 60, windowMs: 60_000 });
    const params = new URL(request.url).searchParams;
    const owner = assertName((params.get("owner") ?? "").trim(), "repository owner");
    const repo = assertName((params.get("repo") ?? "").trim(), "repository name");
    const ref = (params.get("ref") ?? "").trim();
    if (ref && !SHA.test(ref)) throw new ApiError(400, "validation", "That is not a version.");

    const session = await getLiveSession();
    const client = new GitHubClient({
      token: session?.token ?? "",
      userAgent: "forkleaf",
      maxRetries: 0,
    });

    const summary = await withRateLimitAdvice(() => client.getRepo(owner, repo), session !== null);
    if (!summary) throw new ApiError(404, "not-found", `There is no deck at ${owner}/${repo}.`);
    const where: RepoRef = { owner, repo, branch: summary.defaultBranch, directory: "" };

    if (ref) {
      const content = await client.readFileAtCommit(where, DECK_FILE, ref);
      if (content === null) {
        throw new ApiError(
          404,
          "not-found",
          `${owner}/${repo} had no ${DECK_FILE} at that version.`,
        );
      }
      return { owner, repo, sha: ref, content };
    }

    const [file, sha] = await Promise.all([
      client.readFile(where, DECK_FILE),
      client.getBranchHead(where),
    ]);
    if (!file) {
      throw new ApiError(
        404,
        "not-found",
        `${owner}/${repo} is not a deck: it has no ${DECK_FILE}.`,
      );
    }
    return { owner, repo, sha, content: file.content };
  });
}

export async function POST(request: NextRequest) {
  return handle(async () => {
    const { client, login } = await requireClient();
    // Creating a public repository shows on somebody's profile.
    enforceRateLimit(request, { name: "deck-share", limit: 10, windowMs: 10 * 60_000 });

    const raw = await request.text();
    if (raw.length > MAX_BODY)
      throw new ApiError(413, "too-large", "That deck is too big to share.");
    const body = (JSON.parse(raw || "{}") ?? {}) as {
      title?: unknown;
      cards?: unknown;
      repo?: unknown;
    };

    const title =
      String(body.title ?? "")
        .trim()
        .slice(0, 120) || "Flashcards";
    const cards = deckCardsOf(String(body.cards ?? ""));
    if (cards.length === 0) {
      throw new ApiError(400, "validation", "This note has no cards to share yet.");
    }
    if (cards.length > MAX_CARDS) {
      throw new ApiError(413, "too-large", `A deck can hold up to ${MAX_CARDS} cards.`);
    }

    const name = assertName(
      typeof body.repo === "string" && body.repo ? body.repo : deckRepoName(title),
      "repository name",
    );

    let summary = await client.getRepo(login, name);
    if (summary?.private) {
      throw new ApiError(
        409,
        "conflict",
        `${login}/${name} already exists and is private. Make it public on GitHub, or give the note another title.`,
      );
    }
    if (summary && !summary.canPush) {
      throw new ApiError(409, "conflict", `${login}/${name} exists and cannot be written to.`);
    }
    summary ??= await client.createRepo({
      name,
      description: `Flashcards: ${title}`,
      private: false,
    });

    const readme =
      `# ${title}\n\n` +
      `A deck of ${cards.length} ${cards.length === 1 ? "flashcard" : "flashcards"}, shared from ForkLeaf. ` +
      `The cards are in [${DECK_FILE}](${DECK_FILE}), one \`Question :: Answer\` per line.\n\n` +
      `To study it, type **/ → Shared deck** in any ForkLeaf note and paste ` +
      `\`https://github.com/${login}/${name}\`. Your progress stays in your own notebook, ` +
      `and new versions of the deck can be pulled in later.\n`;

    const result = await client.commitChanges(
      { owner: login, repo: name, branch: summary.defaultBranch, directory: "" },
      [
        { op: "upsert", path: "README.md", content: readme },
        { op: "upsert", path: DECK_FILE, content: deckFile(title, cards) },
      ],
      { message: `Share ${cards.length} ${cards.length === 1 ? "card" : "cards"}: ${title}` },
    );

    return { owner: login, repo: name, sha: result.sha, cards: cards.length };
  });
}
