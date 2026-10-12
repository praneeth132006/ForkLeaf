import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({
  session: { token: "t", user: { login: "me" } } as {
    token: string;
    user: { login: string };
  } | null,
  github: {
    listDiscussions: vi.fn(),
    readDiscussion: vi.fn(),
    createNoteDiscussion: vi.fn(),
    addDiscussionComment: vi.fn(),
    updateDiscussionComment: vi.fn(),
  },
}));

vi.mock("@/lib/session", () => ({
  getSession: () => Promise.resolve(state.session),
  getLiveSession: () => Promise.resolve(state.session),
  clearSessionCookie: () => Promise.resolve(),
  endCurrentSession: () => Promise.resolve(),
}));

vi.mock("@forkleaf/github-client", async () => {
  const actual =
    await vi.importActual<typeof import("@forkleaf/github-client")>("@forkleaf/github-client");
  return {
    ...actual,
    GitHubClient: class {
      constructor() {
        return state.github;
      }
    },
  };
});

const { GET, POST } = await import("./route");
const { roomBody, progressComment } = await import("@/lib/study-room");

const REPO = {
  id: "R_1",
  url: "https://github.com/ada/bio-deck",
  private: false,
  enabled: true,
  canComment: true,
  categories: [{ id: "C_1", name: "General", slug: "general" }],
};

const progress = { week: 12, streak: 3, mastered: 8, cards: 40, on: "2026-10-12" };

const room = (comments: unknown[]) => ({
  repo: REPO,
  discussion: {
    id: "D_9",
    number: 9,
    title: "Study room",
    url: "https://github.com/ada/bio-deck/discussions/9",
    body: roomBody("Bio"),
    comments,
  },
});

const post = (body: unknown) =>
  POST(
    new NextRequest("http://localhost/api/gh/study-room", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  state.session = { token: "t", user: { login: "me" } };
  for (const fn of Object.values(state.github)) fn.mockReset();
});

describe("study room route", () => {
  it("reads the room's progress lines", async () => {
    state.github.listDiscussions.mockResolvedValue({
      repo: REPO,
      threads: [{ number: 9, title: "Study room" }],
      nextCursor: null,
    });
    state.github.readDiscussion.mockResolvedValue(
      room([
        {
          id: "c1",
          body: progressComment(progress),
          createdAt: "2026-10-12T00:00:00Z",
          viewerDidAuthor: false,
          author: { login: "ada", avatarUrl: "a" },
        },
      ]),
    );
    const response = await GET(
      new NextRequest("http://localhost/api/gh/study-room?owner=ada&repo=bio-deck"),
    );
    const data = await response.json();
    expect(data.room).toEqual({ number: 9, url: "https://github.com/ada/bio-deck/discussions/9" });
    expect(data.comments[0].author.login).toBe("ada");
  });

  it("says there is no room yet without making one", async () => {
    state.github.listDiscussions.mockResolvedValue({ repo: REPO, threads: [], nextCursor: null });
    const data = await (
      await GET(new NextRequest("http://localhost/api/gh/study-room?owner=ada&repo=bio-deck"))
    ).json();
    expect(data).toMatchObject({ enabled: true, room: null, comments: [] });
    expect(state.github.createNoteDiscussion).not.toHaveBeenCalled();
  });

  it("opens the room on the first share, then adds the member's line", async () => {
    state.github.listDiscussions.mockResolvedValue({ repo: REPO, threads: [], nextCursor: null });
    state.github.createNoteDiscussion.mockResolvedValue({ id: "D_9", number: 9 });
    state.github.readDiscussion.mockResolvedValue(room([]));
    const response = await post({ owner: "ada", repo: "bio-deck", deck: "Bio", progress });
    expect(response.status).toBe(200);
    expect(state.github.createNoteDiscussion).toHaveBeenCalledWith(
      expect.objectContaining({ repositoryId: "R_1", categoryId: "C_1", title: "Study room" }),
    );
    expect(state.github.addDiscussionComment).toHaveBeenCalledWith({
      discussionId: "D_9",
      body: progressComment(progress),
    });
  });

  it("rewrites the member's earlier line instead of adding another", async () => {
    state.github.listDiscussions.mockResolvedValue({
      repo: REPO,
      threads: [{ number: 9, title: "Study room" }],
      nextCursor: null,
    });
    state.github.readDiscussion.mockResolvedValue(
      room([
        {
          id: "mine",
          body: progressComment({ ...progress, week: 1 }),
          createdAt: "2026-10-01T00:00:00Z",
          viewerDidAuthor: true,
          author: { login: "me", avatarUrl: "m" },
        },
      ]),
    );
    await post({ owner: "ada", repo: "bio-deck", progress });
    expect(state.github.updateDiscussionComment).toHaveBeenCalledWith({
      commentId: "mine",
      body: progressComment(progress),
    });
    expect(state.github.addDiscussionComment).not.toHaveBeenCalled();
  });

  it("explains when the deck's repository has Discussions off", async () => {
    state.github.listDiscussions.mockResolvedValue({
      repo: { ...REPO, enabled: false },
      threads: [],
      nextCursor: null,
    });
    const response = await post({ owner: "ada", repo: "bio-deck", progress });
    expect(response.status).toBe(409);
    expect((await response.json()).error.message).toContain(
      "Discussions is switched off in ada/bio-deck",
    );
  });

  it("refuses progress that is not whole numbers", async () => {
    const response = await post({
      owner: "ada",
      repo: "bio-deck",
      progress: { ...progress, week: -1 },
    });
    expect(response.status).toBe(400);
  });
});
