import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  github: {
    getRepo: vi.fn(),
    getBranchHead: vi.fn(),
    listTree: vi.fn(),
    readFileAtCommit: vi.fn(),
    listFileCommits: vi.fn(),
  },
  tokens: [] as string[],
}));

vi.mock("@forkleaf/github-client", async () => {
  const actual =
    await vi.importActual<typeof import("@forkleaf/github-client")>("@forkleaf/github-client");
  return {
    ...actual,
    GitHubClient: class {
      constructor(config: { token: string }) {
        state.tokens.push(config.token);
        return state.github;
      }
    },
  };
});

const { GET } = await import("./route");
const { resetRateLimits } = await import("@/lib/rate-limit");

const file = (path: string) => ({ kind: "file", path, name: path.split("/").pop() });

async function badge(query: string) {
  const response = await GET(new Request(`http://localhost/api/badge?${query}`) as never);
  return {
    status: response.status,
    type: response.headers.get("content-type"),
    cache: response.headers.get("cache-control"),
    svg: await response.text(),
  };
}

beforeEach(() => {
  resetRateLimits();
  state.tokens = [];
  for (const mock of Object.values(state.github)) mock.mockReset();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-13T12:00:00Z"));
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("the notebook health badge", () => {
  it("counts broken links, stale notes and the review streak from a public repository", async () => {
    state.github.getRepo.mockResolvedValue({ private: false, defaultBranch: "main" });
    state.github.getBranchHead.mockResolvedValue("abc");
    state.github.listTree.mockResolvedValue([
      file("Plan.md"),
      file("Budget.md"),
      file("reviews/flashcards.md"),
    ]);
    state.github.readFileAtCommit.mockImplementation(async (_where: unknown, path: string) =>
      path === "Plan.md" ? "See [[Budget]] and [[Nowhere]]." : "Costs.",
    );
    state.github.listFileCommits.mockResolvedValue([
      { date: "2026-09-13T07:00:00Z" },
      { date: "2026-09-12T07:00:00Z" },
    ]);

    const result = await badge("owner=me&repo=notes");
    expect(result.status).toBe(200);
    expect(result.type).toBe("image/svg+xml; charset=utf-8");
    expect(result.cache).toContain("s-maxage=3600");
    expect(result.svg).toContain("notebook: 1 broken · 0 stale · 2-day streak");
    expect(result.svg).toContain("#e05d44");
    // Read as nobody: the badge never uses a session or a token.
    expect(state.tokens).toEqual([""]);
    expect(state.github.readFileAtCommit).not.toHaveBeenCalledWith(
      expect.anything(),
      "reviews/flashcards.md",
      "abc",
    );
  });

  it("is green for a tidy notebook, without a streak when nothing is reviewed", async () => {
    state.github.getRepo.mockResolvedValue({ private: false, defaultBranch: "main" });
    state.github.getBranchHead.mockResolvedValue("abc");
    state.github.listTree.mockResolvedValue([file("Plan.md")]);
    state.github.readFileAtCommit.mockResolvedValue("Nothing linked.");
    const result = await badge("owner=me&repo=notes");
    expect(result.svg).toContain("notebook: links ok · 0 stale");
    expect(result.svg).toContain("#2ea44f");
    expect(state.github.listFileCommits).not.toHaveBeenCalled();
  });

  it("says private, not found, or unavailable in grey instead of a broken image", async () => {
    state.github.getRepo.mockResolvedValue({ private: true, defaultBranch: "main" });
    expect((await badge("owner=me&repo=secret")).svg).toContain("notebook: private");

    state.github.getRepo.mockResolvedValue(null);
    expect((await badge("owner=me&repo=gone")).svg).toContain("notebook: not found");

    state.github.getRepo.mockRejectedValue(new Error("rate limited"));
    const failed = await badge("owner=me&repo=notes");
    expect(failed.status).toBe(200);
    expect(failed.svg).toContain("notebook: unavailable");
    expect(failed.cache).toContain("max-age=60");
  });

  it("refuses names that would change the address called, without calling GitHub", async () => {
    const result = await badge("owner=me&repo=..");
    expect(result.svg).toContain("unavailable");
    expect(state.github.getRepo).not.toHaveBeenCalled();
  });
});
