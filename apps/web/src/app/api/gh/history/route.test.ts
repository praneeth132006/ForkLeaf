import { afterEach, describe, expect, it, vi } from "vitest";

const listFileCommits = vi.fn();
const readFileAtCommit = vi.fn();
const getCommitFiles = vi.fn();

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
      listFileCommits = listFileCommits;
      readFileAtCommit = readFileAtCommit;
      getCommitFiles = getCommitFiles;
    },
  };
});

const { GET } = await import("./route");

afterEach(() => vi.clearAllMocks());

const BASE = "http://localhost/api/gh/history?owner=me&repo=notes&branch=main&dir=";

async function get(query: string) {
  const response = await GET(new Request(`${BASE}${query}`) as never);
  return { status: response.status, body: await response.json() };
}

describe("GET /api/gh/history", () => {
  it("refuses a request with no path", async () => {
    const { status } = await get("");
    expect(status).toBe(400);
  });

  it("lists a note's commits", async () => {
    listFileCommits.mockResolvedValue([{ sha: "a" }]);
    const { status, body } = await get("&path=notes/a.md");

    expect(status).toBe(200);
    expect(body.commits).toEqual([{ sha: "a" }]);
  });

  it("keeps the default window when no limit is asked for", async () => {
    listFileCommits.mockResolvedValue([]);
    await get("&path=notes/a.md");
    // `Number(null)` is 0, not NaN: parsing an absent parameter without
    // checking for it clamped this to a single commit.
    expect(listFileCommits).toHaveBeenCalledWith(expect.anything(), "notes/a.md", 30);
  });

  it("honours a longer window, which blame needs", async () => {
    listFileCommits.mockResolvedValue([]);
    await get("&path=notes/a.md&limit=100");
    expect(listFileCommits).toHaveBeenCalledWith(expect.anything(), "notes/a.md", 100);
  });

  it("clamps a limit outside the usable range", async () => {
    listFileCommits.mockResolvedValue([]);

    await get("&path=notes/a.md&limit=5000");
    expect(listFileCommits).toHaveBeenLastCalledWith(expect.anything(), "notes/a.md", 100);

    await get("&path=notes/a.md&limit=0");
    expect(listFileCommits).toHaveBeenLastCalledWith(expect.anything(), "notes/a.md", 1);

    await get("&path=notes/a.md&limit=-9");
    expect(listFileCommits).toHaveBeenLastCalledWith(expect.anything(), "notes/a.md", 1);
  });

  it("falls back to the default for a limit that is not a number", async () => {
    listFileCommits.mockResolvedValue([]);
    await get("&path=notes/a.md&limit=lots");
    expect(listFileCommits).toHaveBeenCalledWith(expect.anything(), "notes/a.md", 30);
  });

  it("reads one revision's content", async () => {
    readFileAtCommit.mockResolvedValue("# hello");
    const { body } = await get("&path=notes/a.md&sha=abc1234");
    expect(body.content).toBe("# hello");
  });

  it("returns what else a commit touched", async () => {
    getCommitFiles.mockResolvedValue({ files: [{ path: "notes/b.md" }], truncated: false });
    const { body } = await get("&path=notes/a.md&sha=abc1234&files=1");

    expect(body.files).toEqual([{ path: "notes/b.md" }]);
    expect(readFileAtCommit).not.toHaveBeenCalled();
  });

  it("rejects a SHA that is not an object name", async () => {
    // This value is interpolated into the upstream URL.
    const { status } = await get("&path=notes/a.md&sha=../../etc/passwd");
    expect(status).toBe(400);
    expect(readFileAtCommit).not.toHaveBeenCalled();
    expect(getCommitFiles).not.toHaveBeenCalled();
  });
});
