import { afterEach, describe, expect, it, vi } from "vitest";

const listDiscussions = vi.fn();
const readDiscussion = vi.fn();
const addDiscussionComment = vi.fn();
const createNoteDiscussion = vi.fn();
const setDiscussionAnswer = vi.fn();

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
      listDiscussions = listDiscussions;
      readDiscussion = readDiscussion;
      addDiscussionComment = addDiscussionComment;
      createNoteDiscussion = createNoteDiscussion;
      setDiscussionAnswer = setDiscussionAnswer;
    },
  };
});

const { GET, POST } = await import("./route");
const { GitHubError } = await import("@forkleaf/github-client");

afterEach(() => vi.clearAllMocks());

async function get(query: string) {
  const response = await GET(new Request(`http://localhost/api/gh/lounge${query}`) as never);
  return { status: response.status, body: await response.json() };
}

async function post(body: unknown) {
  const response = await POST(
    new Request("http://localhost/api/gh/lounge", {
      method: "POST",
      body: JSON.stringify(body),
    }) as never,
  );
  return { status: response.status, body: await response.json() };
}

const where = { owner: "me", repo: "notes" };

describe("GET /api/gh/lounge — the list", () => {
  it("lists every thread", async () => {
    listDiscussions.mockResolvedValue({ repo: {}, threads: [{ number: 1 }], nextCursor: null });

    const { status, body } = await get("?owner=me&repo=notes");

    expect(status).toBe(200);
    expect(body.threads).toEqual([{ number: 1 }]);
    expect(listDiscussions).toHaveBeenCalledWith({ owner: "me", repo: "notes" });
  });

  it("lists one channel, a page at a time", async () => {
    listDiscussions.mockResolvedValue({ repo: {}, threads: [], nextCursor: null });

    await get("?owner=me&repo=notes&category=DIC_kwDOabc&after=Y3Vyc29yOnYyOpK5MjAyNi0xMA%3D%3D");

    expect(listDiscussions).toHaveBeenCalledWith({
      owner: "me",
      repo: "notes",
      categoryId: "DIC_kwDOabc",
      after: "Y3Vyc29yOnYyOpK5MjAyNi0xMA==",
    });
  });

  it("refuses a malformed channel, page or repository", async () => {
    expect((await get("?owner=me&repo=notes&category=a%20b")).status).toBe(400);
    expect((await get("?owner=me&repo=notes&after=%3Cscript%3E")).status).toBe(400);
    expect((await get("?owner=me&repo=..")).status).toBe(400);
    expect(listDiscussions).not.toHaveBeenCalled();
  });

  it("explains a GitHub App without the Discussions permission", async () => {
    listDiscussions.mockRejectedValue(
      new GitHubError("forbidden", "Resource not accessible by integration", 403),
    );
    const { status, body } = await get("?owner=me&repo=notes");
    expect(status).toBe(403);
    expect(body.error.code).toBe("discussions-forbidden");
  });
});

describe("GET /api/gh/lounge?number= — one thread", () => {
  it("reads it", async () => {
    readDiscussion.mockResolvedValue({ repo: {}, discussion: { number: 7 } });

    const { status, body } = await get("?owner=me&repo=notes&number=7");

    expect(status).toBe(200);
    expect(body.discussion.number).toBe(7);
    expect(readDiscussion).toHaveBeenCalledWith({ owner: "me", repo: "notes", number: 7 });
    expect(listDiscussions).not.toHaveBeenCalled();
  });

  it("says when it is gone", async () => {
    readDiscussion.mockRejectedValue(new GitHubError("not-found", "Discussion #7 is gone.", 404));
    expect((await get("?owner=me&repo=notes&number=7")).status).toBe(404);
  });
});

describe("POST /api/gh/lounge", () => {
  it("replies in a thread", async () => {
    addDiscussionComment.mockResolvedValue({ id: "c1" });

    const { status, body } = await post({
      ...where,
      action: "reply",
      discussionId: "D_kwDO1",
      body: "  Yes, rotate monthly.  ",
    });

    expect(status).toBe(200);
    expect(body.comment).toEqual({ id: "c1" });
    expect(addDiscussionComment).toHaveBeenCalledWith({
      discussionId: "D_kwDO1",
      body: "Yes, rotate monthly.",
    });
  });

  it("replies to one message", async () => {
    addDiscussionComment.mockResolvedValue({ id: "c2" });
    await post({ ...where, action: "reply", discussionId: "D_1", body: "x", replyTo: "DC_9" });
    expect(addDiscussionComment.mock.calls[0]?.[0].replyToId).toBe("DC_9");
  });

  it("starts a thread in a channel", async () => {
    createNoteDiscussion.mockResolvedValue({ id: "D_5", number: 5 });

    const { status, body } = await post({
      ...where,
      action: "start",
      repositoryId: "R_1",
      categoryId: "DIC_qa",
      title: " How do we rotate keys? ",
      body: "Asking for the runbook.",
    });

    expect(status).toBe(200);
    expect(body).toEqual({ number: 5 });
    expect(createNoteDiscussion).toHaveBeenCalledWith({
      repositoryId: "R_1",
      categoryId: "DIC_qa",
      title: "How do we rotate keys?",
      body: "Asking for the runbook.",
    });
  });

  it("marks and unmarks an answer", async () => {
    setDiscussionAnswer.mockResolvedValue(undefined);

    expect(
      (await post({ ...where, action: "answer", commentId: "DC_1", answer: true })).body,
    ).toEqual({
      ok: true,
    });
    await post({ ...where, action: "answer", commentId: "DC_1", answer: false });

    expect(setDiscussionAnswer.mock.calls).toEqual([
      [{ commentId: "DC_1", answer: true }],
      [{ commentId: "DC_1", answer: false }],
    ]);
  });

  it("refuses what it cannot act on", async () => {
    const cases: Record<string, unknown>[] = [
      { ...where, action: "reply", discussionId: "D 1", body: "x" },
      { ...where, action: "reply", discussionId: "D_1", body: "   " },
      { ...where, action: "reply", discussionId: "D_1", body: "x", replyTo: "no spaces" },
      { ...where, action: "start", repositoryId: "R_1", categoryId: "C_1", title: "", body: "x" },
      {
        ...where,
        action: "start",
        repositoryId: "R_1",
        categoryId: "C_1",
        title: "t".repeat(300),
        body: "x",
      },
      { ...where, action: "answer", commentId: "DC_1", answer: "yes" },
      { ...where, action: "delete-everything" },
      { action: "reply", discussionId: "D_1", body: "x" },
    ];
    for (const input of cases) {
      expect((await post(input)).status, JSON.stringify(input).slice(0, 80)).toBe(400);
    }
    expect(addDiscussionComment).not.toHaveBeenCalled();
    expect(createNoteDiscussion).not.toHaveBeenCalled();
    expect(setDiscussionAnswer).not.toHaveBeenCalled();
  });

  it("passes on GitHub's refusal to mark an answer", async () => {
    setDiscussionAnswer.mockRejectedValue(
      new GitHubError("forbidden", "Resource not accessible by integration", 403),
    );
    const { status, body } = await post({
      ...where,
      action: "answer",
      commentId: "DC_1",
      answer: true,
    });
    expect(status).toBe(403);
    expect(body.error.code).toBe("discussions-forbidden");
  });
});
