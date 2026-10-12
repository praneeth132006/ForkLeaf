import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({
  session: { token: "t", user: { login: "me" } } as {
    token: string;
    user: { login: string };
  } | null,
  github: { changesSince: vi.fn() },
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

const { GET } = await import("./route");

const get = (query: string) => GET(new NextRequest(`http://localhost/api/gh/following?${query}`));

beforeEach(() => {
  state.session = { token: "t", user: { login: "me" } };
  state.github.changesSince.mockReset();
});

describe("GET /api/gh/following", () => {
  it("asks for the notes changed in that notebook since the moment", async () => {
    state.github.changesSince.mockResolvedValue({
      baseSha: "b",
      headSha: "h",
      files: [],
      truncated: false,
    });
    const response = await get("owner=ada&repo=notes&branch=main&since=2026-10-01T00:00:00Z");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      baseSha: "b",
      headSha: "h",
      files: [],
      truncated: false,
    });
    expect(state.github.changesSince).toHaveBeenCalledWith(
      { owner: "ada", repo: "notes", branch: "main", directory: "" },
      "2026-10-01T00:00:00Z",
    );
  });

  it("refuses a since that is not a date", async () => {
    const response = await get("owner=ada&repo=notes&branch=main&since=yesterday");
    expect(response.status).toBe(400);
    expect(state.github.changesSince).not.toHaveBeenCalled();
  });

  it("refuses a repository name that would reach another endpoint", async () => {
    const response = await get("owner=ada&repo=..&branch=main&since=2026-10-01");
    expect(response.status).toBe(400);
  });

  it("needs a sign-in", async () => {
    state.session = null;
    const response = await get("owner=ada&repo=notes&branch=main&since=2026-10-01");
    expect(response.status).toBe(401);
  });
});
