import { afterEach, describe, expect, it, vi } from "vitest";

const commitAt = vi.fn();
const listTree = vi.fn();

vi.mock("@/lib/session", () => ({
  getSession: () => Promise.resolve({ token: "t", user: { login: "me" } }),
  getLiveSession: () => Promise.resolve({ token: "t", user: { login: "me" } }),
}));

vi.mock("@forkleaf/github-client", async () => {
  const actual =
    await vi.importActual<typeof import("@forkleaf/github-client")>("@forkleaf/github-client");
  return {
    ...actual,
    GitHubClient: class {
      commitAt = commitAt;
      listTree = listTree;
    },
  };
});

const { GET } = await import("./route");

afterEach(() => vi.clearAllMocks());

const BASE = "http://localhost/api/gh/at?owner=me&repo=notes&branch=main&dir=";

async function get(query: string) {
  const response = await GET(new Request(`${BASE}${query}`) as never);
  return { status: response.status, body: await response.json() };
}

describe("GET /api/gh/at", () => {
  it("returns the commit that was current, and the tree at it", async () => {
    commitAt.mockResolvedValue({ sha: "abc123", date: "2026-03-03T18:00:00Z" });
    listTree.mockResolvedValue([{ kind: "file", name: "a.md", path: "a.md" }]);

    const { status, body } = await get("&until=2026-03-03");

    expect(status).toBe(200);
    expect(body.commit.sha).toBe("abc123");
    // The tree has to be read *at that commit*, or the answer is a notebook
    // that never existed: one day's file list beside another day's date.
    expect(listTree).toHaveBeenCalledWith(expect.anything(), { ref: "abc123" });
    expect(body.tree).toHaveLength(1);
  });

  /**
   * GitHub's `until` is inclusive and a bare date means midnight, so asking
   * for "the 3rd" would otherwise answer with the notebook as it stood at the
   * end of the 2nd — off by a day, silently, which is the worst way for a time
   * machine to be wrong.
   */
  it("means the whole of the day it was given", async () => {
    commitAt.mockResolvedValue(null);
    await get("&until=2026-03-03");

    expect(commitAt).toHaveBeenCalledWith(expect.anything(), "2026-03-03T23:59:59Z");
  });

  it("passes a full timestamp through untouched", async () => {
    commitAt.mockResolvedValue(null);
    await get("&until=2026-03-03T09:30:00Z");

    expect(commitAt).toHaveBeenCalledWith(expect.anything(), "2026-03-03T09:30:00Z");
  });

  it("answers a day before the repository existed with nothing, not an error", async () => {
    commitAt.mockResolvedValue(null);

    const { status, body } = await get("&until=1999-01-01");

    expect(status).toBe(200);
    expect(body).toEqual({ commit: null, tree: [] });
    // Nothing to read a tree at, so nothing is asked for.
    expect(listTree).not.toHaveBeenCalled();
  });

  it("refuses anything that is not a date", async () => {
    // The value is interpolated into the upstream URL, so a date is the only
    // thing this route has any business asking GitHub about.
    for (const bad of ["", "yesterday", "2026-03-03&sha=main", "../../etc"]) {
      const { status } = await get(`&until=${encodeURIComponent(bad)}`);
      expect(status).toBe(400);
    }

    expect(commitAt).not.toHaveBeenCalled();
  });
});
