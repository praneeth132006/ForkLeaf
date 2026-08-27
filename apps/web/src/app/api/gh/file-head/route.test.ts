import { afterEach, describe, expect, it, vi } from "vitest";

const listFileCommits = vi.fn();

vi.mock("@/lib/session", () => ({
  getSession: () => Promise.resolve({ token: "t", user: { login: "me" } }),
}));

vi.mock("@forkleaf/github-client", async () => {
  const actual =
    await vi.importActual<typeof import("@forkleaf/github-client")>("@forkleaf/github-client");
  return {
    ...actual,
    GitHubClient: class {
      listFileCommits = listFileCommits;
    },
  };
});

const { GET } = await import("./route");

afterEach(() => vi.clearAllMocks());

async function get(query: string) {
  const response = await GET(new Request(`http://localhost/api/gh/file-head?${query}`) as never);
  return { status: response.status, body: await response.json() };
}

const BASE = "owner=me&repo=tools&branch=main";

describe("GET /api/gh/file-head", () => {
  it("refuses a request with no path", async () => {
    expect((await get(BASE)).status).toBe(400);
  });

  it("refuses an owner that is not a name", async () => {
    expect((await get("owner=../etc&repo=tools&branch=main&path=x.sh")).status).toBe(400);
  });

  it("reports the newest commit touching the file", async () => {
    listFileCommits.mockResolvedValue([{ sha: "a1b2c3d", date: "2026-08-01T00:00:00Z" }]);
    const { status, body } = await get(`${BASE}&path=scripts/scan.sh`);

    expect(status).toBe(200);
    expect(body).toEqual({ exists: true, sha: "a1b2c3d", committedAt: "2026-08-01T00:00:00Z" });
  });

  it("asks for one commit, not for the whole history", async () => {
    listFileCommits.mockResolvedValue([{ sha: "a" }]);
    await get(`${BASE}&path=scripts/scan.sh`);

    expect(listFileCommits).toHaveBeenCalledWith(
      { owner: "me", repo: "tools", branch: "main", directory: "" },
      "scripts/scan.sh",
      1,
    );
  });

  it("reads paths from the repository root, not from the notes folder", async () => {
    listFileCommits.mockResolvedValue([{ sha: "a" }]);
    await get(`${BASE}&path=scripts/scan.sh`);

    expect(listFileCommits.mock.calls[0]![0].directory).toBe("");
  });

  it("reports a file that is not there as absent, not as an error", async () => {
    // A note linking a file somebody deleted is the case this exists to catch.
    listFileCommits.mockResolvedValue([]);
    const { status, body } = await get(`${BASE}&path=gone.sh`);

    expect(status).toBe(200);
    expect(body).toEqual({ exists: false, sha: null, committedAt: null });
  });

  it("survives a commit with no date on it", async () => {
    listFileCommits.mockResolvedValue([{ sha: "a1b2c3d" }]);
    expect((await get(`${BASE}&path=x.sh`)).body.committedAt).toBeNull();
  });
});
