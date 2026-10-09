import { describe, expect, it, vi } from "vitest";
import { GitHubClient } from "./client";
import { GitHubError } from "./errors";
import {
  codeForGraphQLType,
  discussionBody,
  isNoteDiscussion,
  noteMarker,
  pickCategory,
  type DiscussionCategoryDto,
} from "./discussions";

/**
 * A fake GraphQL endpoint. Each request is answered by the first handler whose
 * operation name appears in the query, and every request is recorded.
 */
function fakeGraphQL(handlers: Record<string, (variables: Record<string, unknown>) => Response>) {
  const calls: { operation: string; variables: Record<string, unknown> }[] = [];

  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    expect(String(url)).toBe("https://api.github.com/graphql");
    expect(init?.method).toBe("POST");
    const { query, variables } = JSON.parse(String(init?.body)) as {
      query: string;
      variables: Record<string, unknown>;
    };
    const operation = Object.keys(handlers).find((name) => query.includes(name));
    if (!operation) throw new Error(`No handler for query: ${query.slice(0, 80)}`);
    calls.push({ operation, variables });
    return handlers[operation]!(variables);
  });

  const client = new GitHubClient({
    token: "t",
    fetch: fetchImpl as unknown as typeof globalThis.fetch,
    maxRetries: 1,
  });
  return { client, calls, fetchImpl };
}

function ok(data: unknown, errors?: unknown[]): Response {
  return new Response(JSON.stringify({ data, ...(errors ? { errors } : {}) }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

const repoFields = {
  id: "R_1",
  url: "https://github.com/octo/notes",
  isPrivate: true,
  hasDiscussionsEnabled: true,
  viewerPermission: "ADMIN",
  discussionCategories: {
    nodes: [
      { id: "C_ann", name: "Announcements", slug: "announcements" },
      { id: "C_gen", name: "General", slug: "general" },
    ],
  },
};

function comment(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    body: `body of ${id}`,
    createdAt: "2026-10-01T10:00:00Z",
    url: `https://github.com/octo/notes/discussions/4#${id}`,
    isAnswer: false,
    isMinimized: false,
    viewerDidAuthor: false,
    author: { login: "ada", avatarUrl: "https://avatars/ada", url: "https://github.com/ada" },
    ...extra,
  };
}

function thread(number: number, path: string, comments: unknown[] = []) {
  return {
    id: `D_${number}`,
    number,
    title: "Runbook",
    url: `https://github.com/octo/notes/discussions/${number}`,
    body: `Conversation about it.\n\n${noteMarker(path)}`,
    locked: false,
    category: { name: "General" },
    comments: { totalCount: comments.length, nodes: comments },
  };
}

describe("the note marker", () => {
  it("is an HTML comment naming the note", () => {
    expect(noteMarker("ops/runbook.md")).toBe("<!-- forkleaf:note ops%2Frunbook.md -->");
  });

  it("cannot be closed early or spoofed by a file name", () => {
    const marker = noteMarker("evil --> <script>.md");
    expect(marker.match(/-->/g)).toHaveLength(1);
    expect(marker).not.toContain("<script>");
  });

  it("matches only the exact note, not one whose name starts the same way", () => {
    const body = `hi\n${noteMarker("a.md.bak")}`;
    expect(isNoteDiscussion(body, "a.md.bak")).toBe(true);
    expect(isNoteDiscussion(body, "a.md")).toBe(false);
  });
});

describe("pickCategory", () => {
  const cat = (slug: string): DiscussionCategoryDto => ({ id: `C_${slug}`, name: slug, slug });

  it("prefers General", () => {
    expect(pickCategory([cat("ideas"), cat("general"), cat("q-a")])?.slug).toBe("general");
  });

  it("falls back to Ideas, then to anything usable", () => {
    expect(pickCategory([cat("q-a"), cat("ideas")])?.slug).toBe("ideas");
    expect(pickCategory([cat("show-and-tell")])?.slug).toBe("show-and-tell");
  });

  it("never picks Announcements or Polls", () => {
    expect(pickCategory([cat("announcements"), cat("polls")])).toBeNull();
    expect(pickCategory([])).toBeNull();
  });
});

describe("discussionBody", () => {
  it("links the note on GitHub and carries the marker", () => {
    const body = discussionBody({
      owner: "octo",
      repo: "notes",
      branch: "main",
      path: "my notes/run book.md",
    });
    expect(body).toContain("https://github.com/octo/notes/blob/main/my%20notes/run%20book.md");
    expect(isNoteDiscussion(body, "my notes/run book.md")).toBe(true);
  });

  it("keeps a backtick in a file name from breaking the code span", () => {
    const body = discussionBody({ owner: "o", repo: "r", branch: "main", path: "a`b.md" });
    expect(body).toContain("[`a'b.md`]");
  });
});

describe("GitHubClient.graphql", () => {
  it("turns a GraphQL error into a GitHubError with a code", async () => {
    const { client } = fakeGraphQL({
      Q: () => ok(null, [{ type: "FORBIDDEN", message: "Resource not accessible by integration" }]),
    });

    const error = (await client
      .graphql("query Q { viewer { login } }", {})
      .catch((e: unknown) => e)) as GitHubError;
    expect(error).toBeInstanceOf(GitHubError);
    expect(error.code).toBe("forbidden");
    expect(error.message).toBe("Resource not accessible by integration");
  });

  it("throws on errors beside data unless partial data was asked for", async () => {
    const { client } = fakeGraphQL({
      Q: () => ok({ a: 1 }, [{ type: "NOT_FOUND", message: "gone", path: ["b"] }]),
    });

    await expect(client.graphql("query Q { a }", {})).rejects.toMatchObject({
      code: "not-found",
    });
    await expect(client.graphql("query Q { a }", {}, { allowPartial: true })).resolves.toEqual({
      a: 1,
    });
  });

  it("never retries a write, which might post the same comment twice", async () => {
    const { client, fetchImpl } = fakeGraphQL({
      M: () => new Response("{}", { status: 502 }),
    });

    await expect(client.graphql("mutation M { x }", {}, { write: true })).rejects.toBeInstanceOf(
      GitHubError,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("does retry a read that hit a server error", async () => {
    let attempts = 0;
    const { client } = fakeGraphQL({
      Q: () => (++attempts === 1 ? new Response("{}", { status: 502 }) : ok({ a: 2 })),
    });

    await expect(client.graphql("query Q { a }", {})).resolves.toEqual({ a: 2 });
    expect(attempts).toBe(2);
  });

  it("maps GraphQL error types", () => {
    expect(codeForGraphQLType("NOT_FOUND")).toBe("not-found");
    expect(codeForGraphQLType("RATE_LIMITED")).toBe("rate-limited");
    expect(codeForGraphQLType("UNPROCESSABLE")).toBe("validation");
    expect(codeForGraphQLType(undefined)).toBe("unknown");
  });
});

describe("findNoteConversation", () => {
  it("reads a known discussion in one request when its marker still matches", async () => {
    const { client, calls } = fakeGraphQL({
      ForkLeafNoteThread: () =>
        ok({
          repository: {
            ...repoFields,
            discussion: thread(4, "ops/runbook.md", [
              { ...comment("c1"), replies: { totalCount: 1, nodes: [comment("r1")] } },
            ]),
          },
        }),
    });

    const found = await client.findNoteConversation({
      owner: "octo",
      repo: "notes",
      path: "ops/runbook.md",
      knownNumber: 4,
    });

    expect(calls.map((c) => c.operation)).toEqual(["ForkLeafNoteThread"]);
    expect(found.repo).toMatchObject({ enabled: true, canComment: true, private: true });
    expect(found.discussion?.number).toBe(4);
    expect(found.discussion?.comments[0]?.replies[0]?.id).toBe("r1");
    expect(found.discussion?.comments[0]?.replyCount).toBe(1);
  });

  it("looks again when the known discussion is about a different note", async () => {
    const { client, calls } = fakeGraphQL({
      ForkLeafNoteThread: (variables) =>
        ok({
          repository: {
            ...repoFields,
            discussion:
              variables.number === 4 ? thread(4, "renamed.md") : thread(9, "ops/runbook.md"),
          },
        }),
      ForkLeafNoteLookup: () =>
        ok({
          repository: {
            ...repoFields,
            discussions: { nodes: [{ number: 9, body: noteMarker("ops/runbook.md") }] },
          },
          search: { nodes: [] },
        }),
    });

    const found = await client.findNoteConversation({
      owner: "octo",
      repo: "notes",
      path: "ops/runbook.md",
      knownNumber: 4,
    });

    expect(calls.map((c) => c.operation)).toEqual([
      "ForkLeafNoteThread",
      "ForkLeafNoteLookup",
      "ForkLeafNoteThread",
    ]);
    expect(found.discussion?.number).toBe(9);
  });

  it("picks the oldest matching discussion, and ignores other repositories in search", async () => {
    const { client, calls } = fakeGraphQL({
      ForkLeafNoteLookup: () =>
        ok({
          repository: {
            ...repoFields,
            discussions: {
              nodes: [
                { number: 12, body: noteMarker("a.md") },
                { number: 3, body: noteMarker("other.md") },
              ],
            },
          },
          search: {
            nodes: [
              { number: 1, body: noteMarker("a.md"), repository: { nameWithOwner: "evil/fork" } },
              { number: 7, body: noteMarker("a.md"), repository: { nameWithOwner: "Octo/Notes" } },
            ],
          },
        }),
      ForkLeafNoteThread: (variables) =>
        ok({ repository: { ...repoFields, discussion: thread(Number(variables.number), "a.md") } }),
    });

    const found = await client.findNoteConversation({ owner: "octo", repo: "notes", path: "a.md" });

    expect(found.discussion?.number).toBe(7);
    expect(calls[1]?.variables.number).toBe(7);
  });

  it("still finds a recent discussion when search fails", async () => {
    const { client } = fakeGraphQL({
      ForkLeafNoteLookup: () =>
        ok(
          {
            repository: {
              ...repoFields,
              discussions: { nodes: [{ number: 2, body: noteMarker("a.md") }] },
            },
            search: null,
          },
          [{ type: "SERVICE_UNAVAILABLE", message: "search is down", path: ["search"] }],
        ),
      ForkLeafNoteThread: () =>
        ok({ repository: { ...repoFields, discussion: thread(2, "a.md") } }),
    });

    const found = await client.findNoteConversation({ owner: "octo", repo: "notes", path: "a.md" });
    expect(found.discussion?.number).toBe(2);
  });

  it("says there is no conversation yet, with what is needed to start one", async () => {
    const { client } = fakeGraphQL({
      ForkLeafNoteLookup: () =>
        ok({ repository: { ...repoFields, discussions: { nodes: [] } }, search: { nodes: [] } }),
    });

    const found = await client.findNoteConversation({ owner: "octo", repo: "notes", path: "a.md" });
    expect(found.discussion).toBeNull();
    expect(found.repo.id).toBe("R_1");
    expect(found.repo.categories.map((c) => c.slug)).toEqual(["announcements", "general"]);
  });

  it("reports Discussions switched off", async () => {
    const { client } = fakeGraphQL({
      ForkLeafNoteLookup: () =>
        ok({
          repository: {
            ...repoFields,
            hasDiscussionsEnabled: false,
            discussions: { nodes: [] },
          },
          search: { nodes: [] },
        }),
    });

    const found = await client.findNoteConversation({ owner: "octo", repo: "notes", path: "a.md" });
    expect(found.repo).toMatchObject({ enabled: false, canComment: false });
  });

  it("lets anyone signed in take part in a public repository", async () => {
    const { client } = fakeGraphQL({
      ForkLeafNoteLookup: () =>
        ok({
          repository: {
            ...repoFields,
            isPrivate: false,
            viewerPermission: null,
            discussions: { nodes: [] },
          },
          search: { nodes: [] },
        }),
    });

    const found = await client.findNoteConversation({ owner: "octo", repo: "notes", path: "a.md" });
    expect(found.repo.canComment).toBe(true);
  });

  it("fails as not-found when the repository is not there", async () => {
    const { client } = fakeGraphQL({
      ForkLeafNoteLookup: () =>
        ok({ repository: null, search: { nodes: [] } }, [
          { type: "NOT_FOUND", message: "Could not resolve", path: ["repository"] },
        ]),
    });

    await expect(
      client.findNoteConversation({ owner: "octo", repo: "gone", path: "a.md" }),
    ).rejects.toMatchObject({ code: "not-found" });
  });
});

describe("writing", () => {
  it("creates a discussion with the title cut to GitHub's limit", async () => {
    const { client, calls } = fakeGraphQL({
      ForkLeafStartConversation: () =>
        ok({ createDiscussion: { discussion: { id: "D_5", number: 5 } } }),
    });

    const created = await client.createNoteDiscussion({
      repositoryId: "R_1",
      categoryId: "C_gen",
      title: "x".repeat(400),
      body: "b",
    });

    expect(created).toEqual({ id: "D_5", number: 5 });
    expect(String(calls[0]?.variables.title)).toHaveLength(256);
  });

  it("posts a comment, and a reply when told what to reply to", async () => {
    const { client, calls } = fakeGraphQL({
      ForkLeafComment: () => ok({ addDiscussionComment: { comment: comment("c9") } }),
    });

    const posted = await client.addDiscussionComment({ discussionId: "D_5", body: "hello" });
    await client.addDiscussionComment({ discussionId: "D_5", body: "hi", replyToId: "c1" });

    expect(posted).toMatchObject({ id: "c9", replies: [], replyCount: 0 });
    expect(calls[0]?.variables).toEqual({ discussionId: "D_5", body: "hello", replyToId: null });
    expect(calls[1]?.variables.replyToId).toBe("c1");
  });
});
