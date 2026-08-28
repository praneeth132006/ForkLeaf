import { afterEach, describe, expect, it, vi } from "vitest";

const getPullRequest = vi.fn();
const findOpenPullRequestForBranch = vi.fn();
const listReviewComments = vi.fn();
const listReviews = vi.fn();
const listConversation = vi.fn();
const replyToReviewComment = vi.fn();
const addConversationComment = vi.fn();
const mergePullRequest = vi.fn();

vi.mock("@/lib/session", () => ({
  getSession: () => Promise.resolve({ token: "t", user: { login: "me" } }),
  // What `requireClient` actually calls: the session with a token that has
  // been renewed if it needed renewing.
  getLiveSession: () => Promise.resolve({ token: "t", user: { login: "me" } }),
}));

vi.mock("@forkleaf/github-client", async () => {
  const actual =
    await vi.importActual<typeof import("@forkleaf/github-client")>("@forkleaf/github-client");
  return {
    ...actual,
    GitHubClient: class {
      getPullRequest = getPullRequest;
      findOpenPullRequestForBranch = findOpenPullRequestForBranch;
      listReviewComments = listReviewComments;
      listReviews = listReviews;
      listConversation = listConversation;
      replyToReviewComment = replyToReviewComment;
      addConversationComment = addConversationComment;
      mergePullRequest = mergePullRequest;
    },
  };
});

const { GET, POST } = await import("./route");

afterEach(() => vi.clearAllMocks());

async function get(query: string) {
  const response = await GET(new Request(`http://localhost/api/gh/review?${query}`) as never);
  return { status: response.status, body: await response.json() };
}

async function post(body: unknown) {
  const response = await POST(
    new Request("http://localhost/api/gh/review", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }) as never,
  );
  return { status: response.status, body: await response.json() };
}

const REPO = { owner: "me", repo: "notes", number: 7 };

describe("GET /api/gh/review", () => {
  it("refuses a request with no pull request number", async () => {
    expect((await get("owner=me&repo=notes")).status).toBe(400);
  });

  it("refuses a number that is not one", async () => {
    for (const value of ["nope", "0", "-3", "1.5"]) {
      expect((await get(`owner=me&repo=notes&number=${value}`)).status).toBe(400);
    }
  });

  it("gathers the request, its comments, its reviews and its conversation", async () => {
    getPullRequest.mockResolvedValue({ number: 7, title: "Notes on recon" });
    listReviewComments.mockResolvedValue([{ id: 1 }]);
    listReviews.mockResolvedValue([{ id: 2, state: "APPROVED" }]);
    listConversation.mockResolvedValue([{ id: 3 }]);

    const { status, body } = await get("owner=me&repo=notes&number=7");

    expect(status).toBe(200);
    expect(body.pull.title).toBe("Notes on recon");
    expect(body.comments).toEqual([{ id: 1 }]);
    expect(body.reviews).toEqual([{ id: 2, state: "APPROVED" }]);
    expect(body.conversation).toEqual([{ id: 3 }]);
  });

  it("reads all four at once rather than one after another", async () => {
    getPullRequest.mockResolvedValue({});
    listReviewComments.mockResolvedValue([]);
    listReviews.mockResolvedValue([]);
    listConversation.mockResolvedValue([]);

    await get("owner=me&repo=notes&number=7");

    for (const call of [getPullRequest, listReviewComments, listReviews, listConversation]) {
      expect(call).toHaveBeenCalledWith("me", "notes", 7);
    }
  });
});

describe("GET /api/gh/review — finding the review for a branch", () => {
  it("says plainly that a branch has no review open", async () => {
    findOpenPullRequestForBranch.mockResolvedValue(null);
    const { status, body } = await get("owner=me&repo=notes&head=study/recon");

    // Not a 404: "nothing under review" is an ordinary state.
    expect(status).toBe(200);
    expect(body.pull).toBeNull();
    expect(body.comments).toEqual([]);
  });

  it("does not read comments for a branch with no review", async () => {
    findOpenPullRequestForBranch.mockResolvedValue(null);
    await get("owner=me&repo=notes&head=study/recon");

    expect(listReviewComments).not.toHaveBeenCalled();
  });

  it("gathers the whole review once the branch resolves to one", async () => {
    findOpenPullRequestForBranch.mockResolvedValue({ number: 12 });
    getPullRequest.mockResolvedValue({ number: 12, title: "Recon" });
    listReviewComments.mockResolvedValue([{ id: 1 }]);
    listReviews.mockResolvedValue([]);
    listConversation.mockResolvedValue([]);

    const { status, body } = await get("owner=me&repo=notes&head=study/recon");

    expect(status).toBe(200);
    expect(body.pull.number).toBe(12);
    expect(listReviewComments).toHaveBeenCalledWith("me", "notes", 12);
  });

  it("prefers a branch lookup over a number when both are given", async () => {
    findOpenPullRequestForBranch.mockResolvedValue(null);
    await get("owner=me&repo=notes&head=study/recon&number=99");

    expect(getPullRequest).not.toHaveBeenCalled();
  });
});

describe("POST /api/gh/review — replying", () => {
  it("answers one inline comment in its thread", async () => {
    replyToReviewComment.mockResolvedValue({ id: 9, body: "fixed" });
    const { status, body } = await post({
      ...REPO,
      action: "reply",
      commentId: 4,
      body: "fixed",
    });

    expect(status).toBe(200);
    expect(replyToReviewComment).toHaveBeenCalledWith("me", "notes", 7, 4, "fixed");
    expect(body.comment.id).toBe(9);
  });

  it("adds to the general conversation when no comment is named", async () => {
    addConversationComment.mockResolvedValue({ id: 10 });
    await post({ ...REPO, action: "comment", body: "thanks for looking" });

    expect(addConversationComment).toHaveBeenCalledWith("me", "notes", 7, "thanks for looking");
  });

  it("refuses an empty reply", async () => {
    const { status } = await post({ ...REPO, action: "reply", commentId: 4, body: "   " });
    expect(status).toBe(400);
    expect(replyToReviewComment).not.toHaveBeenCalled();
  });

  it("trims a reply rather than posting the whitespace", async () => {
    replyToReviewComment.mockResolvedValue({});
    await post({ ...REPO, action: "reply", commentId: 4, body: "  fixed  " });

    expect(replyToReviewComment).toHaveBeenCalledWith("me", "notes", 7, 4, "fixed");
  });

  it("refuses a reply with no comment to attach it to", async () => {
    const { status } = await post({ ...REPO, action: "reply", body: "fixed" });
    expect(status).toBe(400);
  });

  it("refuses an action it does not have", async () => {
    const { status, body } = await post({ ...REPO, action: "delete-everything", body: "x" });
    expect(status).toBe(400);
    expect(body.error.message).toMatch(/not something you can do/i);
  });
});

describe("POST /api/gh/review — merging", () => {
  it("squashes by default, so a review does not land as eight commits", async () => {
    mergePullRequest.mockResolvedValue({ merged: true, message: "ok", sha: "abc" });
    const { status } = await post({ ...REPO, action: "merge" });

    expect(status).toBe(200);
    expect(mergePullRequest).toHaveBeenCalledWith("me", "notes", 7, {
      method: "squash",
      title: undefined,
    });
  });

  it("honours another way of merging", async () => {
    mergePullRequest.mockResolvedValue({ merged: true, message: "", sha: "a" });
    await post({ ...REPO, action: "merge", method: "rebase" });

    expect(mergePullRequest).toHaveBeenCalledWith(
      "me",
      "notes",
      7,
      expect.objectContaining({ method: "rebase" }),
    );
  });

  it("refuses a way of merging that does not exist", async () => {
    const { status } = await post({ ...REPO, action: "merge", method: "obliterate" });
    expect(status).toBe(400);
    expect(mergePullRequest).not.toHaveBeenCalled();
  });

  it("reports a merge GitHub declined rather than claiming success", async () => {
    mergePullRequest.mockResolvedValue({ merged: false, message: "Base branch was modified" });
    const { status, body } = await post({ ...REPO, action: "merge" });

    expect(status).toBe(409);
    expect(body.error.message).toMatch(/base branch was modified/i);
  });

  it("does not require a body to merge", async () => {
    mergePullRequest.mockResolvedValue({ merged: true, message: "", sha: "a" });
    expect((await post({ ...REPO, action: "merge" })).status).toBe(200);
  });
});

describe("POST /api/gh/review — what it refuses outright", () => {
  it("refuses a body that is not JSON", async () => {
    const response = await POST(
      new Request("http://localhost/api/gh/review", {
        method: "POST",
        body: "not json",
      }) as never,
    );
    expect(response.status).toBe(400);
  });

  it("refuses a repository name that is not one", async () => {
    const { status } = await post({ ...REPO, owner: "../../etc", action: "merge" });
    expect(status).toBe(400);
  });
});
