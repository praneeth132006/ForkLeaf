import { afterEach, describe, expect, it, vi } from "vitest";

const findNoteConversation = vi.fn();
const createNoteDiscussion = vi.fn();
const addDiscussionComment = vi.fn();
const findPassageThreads = vi.fn();

vi.mock("@/lib/session", () => ({
  getSession: () => Promise.resolve({ token: "t", user: { login: "me" } }),
  getLiveSession: () => Promise.resolve({ token: "t", user: { login: "me" } }),
  clearSessionCookie: () => Promise.resolve(),
}));

vi.mock("@forkleaf/github-client", async () => {
  const actual =
    await vi.importActual<typeof import("@forkleaf/github-client")>("@forkleaf/github-client");
  return {
    ...actual,
    GitHubClient: class {
      findNoteConversation = findNoteConversation;
      createNoteDiscussion = createNoteDiscussion;
      addDiscussionComment = addDiscussionComment;
      findPassageThreads = findPassageThreads;
    },
  };
});

const { GET, POST } = await import("./route");
const { GitHubError, isNoteDiscussion, pageHash, passageOf } =
  await import("@forkleaf/github-client");

afterEach(() => vi.clearAllMocks());

const repo = {
  id: "R_1",
  url: "https://github.com/me/notes",
  private: true,
  enabled: true,
  canComment: true,
  categories: [
    { id: "C_ann", name: "Announcements", slug: "announcements" },
    { id: "C_gen", name: "General", slug: "general" },
  ],
};

const discussion = {
  id: "D_4",
  number: 4,
  title: "Runbook",
  url: "https://github.com/me/notes/discussions/4",
  locked: false,
  category: "General",
  comments: [],
  commentCount: 0,
};

async function get(query: string) {
  const response = await GET(new Request(`http://localhost/api/gh/discussions${query}`) as never);
  return { status: response.status, body: await response.json() };
}

async function post(body: unknown) {
  const response = await POST(
    new Request("http://localhost/api/gh/discussions", {
      method: "POST",
      body: JSON.stringify(body),
    }) as never,
  );
  return { status: response.status, body: await response.json() };
}

const message = {
  owner: "me",
  repo: "notes",
  branch: "main",
  path: "ops/runbook.md",
  title: "Runbook",
  body: "  Is step 3 still right?  ",
};

describe("GET /api/gh/discussions", () => {
  it("reads the conversation about a note, passing back the number it knew", async () => {
    findNoteConversation.mockResolvedValue({ repo, discussion });

    const { status, body } = await get("?owner=me&repo=notes&path=ops/runbook.md&number=4");

    expect(status).toBe(200);
    expect(body.discussion.number).toBe(4);
    expect(findNoteConversation).toHaveBeenCalledWith({
      owner: "me",
      repo: "notes",
      path: "ops/runbook.md",
      knownNumber: 4,
    });
  });

  it("refuses names that would change the upstream URL, and bad numbers", async () => {
    expect((await get("?owner=me&repo=../x&path=a.md")).status).toBe(400);
    expect((await get("?owner=me&repo=notes")).status).toBe(400);
    expect((await get("?owner=me&repo=notes&path=a.md&number=-1")).status).toBe(400);
    expect((await get("?owner=me&repo=notes&path=a.md&number=1.5")).status).toBe(400);
    expect(findNoteConversation).not.toHaveBeenCalled();
  });

  it("keeps a path inside the repository", async () => {
    findNoteConversation.mockResolvedValue({ repo, discussion: null });
    await get("?owner=me&repo=notes&path=../../secret/a.md");
    expect(findNoteConversation.mock.calls[0]?.[0].path).toBe("secret/a.md");
  });

  it("explains a GitHub App that was never given Discussions", async () => {
    findNoteConversation.mockRejectedValue(
      new GitHubError("forbidden", "Resource not accessible by integration", 403),
    );

    const { status, body } = await get("?owner=me&repo=notes&path=a.md");

    expect(status).toBe(403);
    expect(body.error.code).toBe("discussions-forbidden");
    expect(body.error.message).toMatch(/approve ForkLeaf's access to Discussions/);
  });
});

describe("POST /api/gh/discussions", () => {
  it("replies in the existing conversation", async () => {
    findNoteConversation.mockResolvedValue({ repo, discussion });
    addDiscussionComment.mockResolvedValue({ id: "c1" });

    const { status, body } = await post({ ...message, number: 4 });

    expect(status).toBe(200);
    expect(body).toEqual({ number: 4, comment: { id: "c1" } });
    expect(createNoteDiscussion).not.toHaveBeenCalled();
    expect(addDiscussionComment).toHaveBeenCalledWith({
      discussionId: "D_4",
      body: "Is step 3 still right?",
    });
  });

  it("opens the conversation in General on the first message", async () => {
    findNoteConversation.mockResolvedValue({ repo, discussion: null });
    createNoteDiscussion.mockResolvedValue({ id: "D_9", number: 9 });
    addDiscussionComment.mockResolvedValue({ id: "c1" });

    const { status, body } = await post(message);

    expect(status).toBe(200);
    expect(body.number).toBe(9);
    const created = createNoteDiscussion.mock.calls[0]?.[0];
    expect(created).toMatchObject({ repositoryId: "R_1", categoryId: "C_gen", title: "Runbook" });
    expect(isNoteDiscussion(created.body, "ops/runbook.md")).toBe(true);
    expect(addDiscussionComment.mock.calls[0]?.[0].discussionId).toBe("D_9");
  });

  it("names the discussion after the file when no title is sent", async () => {
    findNoteConversation.mockResolvedValue({ repo, discussion: null });
    createNoteDiscussion.mockResolvedValue({ id: "D_9", number: 9 });
    addDiscussionComment.mockResolvedValue({ id: "c1" });

    await post({ ...message, title: "  " });

    expect(createNoteDiscussion.mock.calls[0]?.[0].title).toBe("runbook");
  });

  it("sends a reply to the comment it answers", async () => {
    findNoteConversation.mockResolvedValue({ repo, discussion });
    addDiscussionComment.mockResolvedValue({ id: "c2" });

    await post({ ...message, replyTo: "DC_kwDOabc123" });

    expect(addDiscussionComment.mock.calls[0]?.[0].replyToId).toBe("DC_kwDOabc123");
  });

  it("accepts the legacy base64 ids older comments still carry", async () => {
    // Seen on github.com/vercel/next.js: plain base64, which can hold `+` and `/`.
    findNoteConversation.mockResolvedValue({ repo, discussion });
    addDiscussionComment.mockResolvedValue({ id: "c3" });

    const { status } = await post({
      ...message,
      replyTo: "MDE3OkRpc2N1c3Npb25+Db21/tZW50MTc2NjQwMg==",
    });

    expect(status).toBe(200);
    expect(addDiscussionComment.mock.calls[0]?.[0].replyToId).toBe(
      "MDE3OkRpc2N1c3Npb25+Db21/tZW50MTc2NjQwMg==",
    );
  });

  it("refuses an empty message, an oversized one, and a malformed reply target", async () => {
    expect((await post({ ...message, body: "   " })).status).toBe(400);
    expect((await post({ ...message, body: "x".repeat(70_000) })).status).toBe(400);
    expect((await post({ ...message, replyTo: "a b" })).status).toBe(400);
    expect((await post({ ...message, branch: "../main" })).status).toBe(400);
    expect(findNoteConversation).not.toHaveBeenCalled();
  });

  it("says so when Discussions is off, and writes nothing", async () => {
    findNoteConversation.mockResolvedValue({
      repo: { ...repo, enabled: false, canComment: false },
      discussion: null,
    });

    const { status, body } = await post(message);

    expect(status).toBe(409);
    expect(body.error.code).toBe("discussions-off");
    expect(createNoteDiscussion).not.toHaveBeenCalled();
    expect(addDiscussionComment).not.toHaveBeenCalled();
  });

  it("refuses an account that cannot take part", async () => {
    findNoteConversation.mockResolvedValue({ repo: { ...repo, canComment: false }, discussion });
    expect((await post(message)).status).toBe(403);
    expect(addDiscussionComment).not.toHaveBeenCalled();
  });

  it("refuses to post into a locked conversation", async () => {
    findNoteConversation.mockResolvedValue({ repo, discussion: { ...discussion, locked: true } });
    const { status, body } = await post(message);
    expect(status).toBe(409);
    expect(body.error.code).toBe("locked");
  });

  it("says what to do when there is no category it may post in", async () => {
    findNoteConversation.mockResolvedValue({
      repo: { ...repo, categories: [repo.categories[0]] },
      discussion: null,
    });

    const { status, body } = await post(message);

    expect(status).toBe(409);
    expect(body.error.code).toBe("no-category");
    expect(createNoteDiscussion).not.toHaveBeenCalled();
  });

  it("does not open a new conversation to hold a reply to a vanished one", async () => {
    findNoteConversation.mockResolvedValue({ repo, discussion: null });
    expect((await post({ ...message, replyTo: "DC_x" })).status).toBe(409);
    expect(createNoteDiscussion).not.toHaveBeenCalled();
  });
});

describe("v3 — passages and published pages", () => {
  it("lists passage threads beside the conversation when asked", async () => {
    findNoteConversation.mockResolvedValue({ repo, discussion });
    findPassageThreads.mockResolvedValue([{ number: 8, quote: "Rotate keys" }]);

    const { body } = await get("?owner=me&repo=notes&path=ops/runbook.md&passages=1");

    expect(body.discussion.number).toBe(4);
    expect(body.passages).toEqual([{ number: 8, quote: "Rotate keys" }]);
    expect(findPassageThreads).toHaveBeenCalledWith({
      owner: "me",
      repo: "notes",
      path: "ops/runbook.md",
    });
  });

  it("still answers with the conversation when the passage search fails", async () => {
    findNoteConversation.mockResolvedValue({ repo, discussion });
    findPassageThreads.mockRejectedValue(new GitHubError("unknown", "search is down", 502));

    const { status, body } = await get("?owner=me&repo=notes&path=a.md&passages=1");

    expect(status).toBe(200);
    expect(body.passages).toBeNull();
  });

  it("does not look for passages unless asked", async () => {
    findNoteConversation.mockResolvedValue({ repo, discussion });
    const { body } = await get("?owner=me&repo=notes&path=a.md");
    expect(body).not.toHaveProperty("passages");
    expect(findPassageThreads).not.toHaveBeenCalled();
  });

  it("opens a new thread for a passage, quoting it", async () => {
    findNoteConversation.mockResolvedValue({ repo, discussion });
    createNoteDiscussion.mockResolvedValue({ id: "D_20", number: 20 });
    addDiscussionComment.mockResolvedValue({ id: "c1" });

    const { status, body } = await post({ ...message, passage: "  Rotate keys monthly.  " });

    expect(status).toBe(200);
    expect(body).toEqual({ number: 20, comment: { id: "c1" }, passage: true });
    const created = createNoteDiscussion.mock.calls[0]?.[0];
    expect(created.title).toBe("“Rotate keys monthly.” — Runbook");
    expect(created.body).toContain("> Rotate keys monthly.");
    expect(passageOf(created.body)).toEqual({
      path: "ops/runbook.md",
      quote: "Rotate keys monthly.",
    });
    expect(addDiscussionComment).toHaveBeenCalledWith({
      discussionId: "D_20",
      body: "Is step 3 still right?",
    });
  });

  it("refuses an empty or overlong passage", async () => {
    expect((await post({ ...message, passage: "   " })).status).toBe(400);
    expect((await post({ ...message, passage: "x".repeat(501) })).status).toBe(400);
    expect((await post({ ...message, passage: 42 })).status).toBe(400);
    expect(createNoteDiscussion).not.toHaveBeenCalled();
  });

  it("writes the published page's hash into a new conversation", async () => {
    findNoteConversation.mockResolvedValue({ repo, discussion: null });
    createNoteDiscussion.mockResolvedValue({ id: "D_9", number: 9 });
    addDiscussionComment.mockResolvedValue({ id: "c1" });

    await post(message);

    const body = createNoteDiscussion.mock.calls[0]?.[0].body as string;
    expect(body).toContain(`<!-- sha1: ${await pageHash("ops/runbook.md")} -->`);
  });
});
