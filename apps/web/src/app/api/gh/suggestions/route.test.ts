import { afterEach, describe, expect, it, vi } from "vitest";

const listOpenPullRequests = vi.fn();
const getPullRequest = vi.fn();
const listPullRequestFiles = vi.fn();
const readFileAtCommit = vi.fn();

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
      listOpenPullRequests = listOpenPullRequests;
      getPullRequest = getPullRequest;
      listPullRequestFiles = listPullRequestFiles;
      readFileAtCommit = readFileAtCommit;
    },
  };
});

const { GET } = await import("./route");

afterEach(() => vi.clearAllMocks());

async function get(query: string) {
  const response = await GET(new Request(`http://localhost/api/gh/suggestions${query}`) as never);
  return { status: response.status, body: await response.json() };
}

describe("GET /api/gh/suggestions", () => {
  it("lists what is open on the notebook", async () => {
    listOpenPullRequests.mockResolvedValue([{ number: 7, title: "Fix a typo" }]);

    const { status, body } = await get("?owner=me&repo=notes");

    expect(status).toBe(200);
    expect(body.pulls).toHaveLength(1);
    expect(listOpenPullRequests).toHaveBeenCalledWith("me", "notes");
  });

  it("refuses a request with no repository named", async () => {
    // Both halves are interpolated into the upstream URL.
    expect((await get("?owner=me")).status).toBe(400);
    expect((await get("?repo=notes")).status).toBe(400);
    expect(listOpenPullRequests).not.toHaveBeenCalled();
  });

  it("refuses a name that is not one", async () => {
    expect((await get("?owner=me&repo=notes/../../etc")).status).toBe(400);
  });
});

describe("GET /api/gh/suggestions?number= — what one changes", () => {
  const pull = {
    number: 7,
    title: "Fix a typo",
    url: "https://github.com/me/notes/pull/7",
    author: "a-reader",
    base: "main",
    head: "reader:patch-1",
    baseSha: "base000",
    headSha: "head000",
  };

  it("reads both sides of every note it touches", async () => {
    getPullRequest.mockResolvedValue(pull);
    listPullRequestFiles.mockResolvedValue([
      { path: "notes/runbook.md", status: "modified", previousPath: null },
    ]);
    readFileAtCommit.mockImplementation((_ref: unknown, _path: string, sha: string) =>
      Promise.resolve(sha === "base000" ? "before" : "after"),
    );

    const { status, body } = await get("?owner=me&repo=notes&number=7");

    expect(status).toBe(200);
    expect(body.files[0]).toMatchObject({ before: "before", after: "after", diffable: true });
    expect(body.pull.number).toBe(7);
  });

  /**
   * A suggestion nearly always comes from a fork, whose branch does not exist
   * in this repository. Its head *commit* does, which is why every read here
   * names a commit rather than a branch — reading `reader:patch-1` would 404.
   */
  it("reads a fork's proposal by commit, out of this repository", async () => {
    getPullRequest.mockResolvedValue(pull);
    listPullRequestFiles.mockResolvedValue([
      { path: "notes/runbook.md", status: "modified", previousPath: null },
    ]);
    readFileAtCommit.mockResolvedValue("text");

    await get("?owner=me&repo=notes&number=7");

    for (const call of readFileAtCommit.mock.calls) {
      expect(call[0]).toMatchObject({ owner: "me", repo: "notes" });
      expect(["base000", "head000"]).toContain(call[2]);
    }
  });

  it("reads a renamed note from the path it used to have", async () => {
    getPullRequest.mockResolvedValue(pull);
    listPullRequestFiles.mockResolvedValue([
      { path: "notes/new.md", status: "renamed", previousPath: "notes/old.md" },
    ]);
    readFileAtCommit.mockResolvedValue("text");

    await get("?owner=me&repo=notes&number=7");

    expect(readFileAtCommit).toHaveBeenCalledWith(expect.anything(), "notes/old.md", "base000");
    expect(readFileAtCommit).toHaveBeenCalledWith(expect.anything(), "notes/new.md", "head000");
  });

  it("does not look for a file on the side it does not exist on", async () => {
    getPullRequest.mockResolvedValue(pull);
    listPullRequestFiles.mockResolvedValue([
      { path: "notes/added.md", status: "added", previousPath: null },
    ]);
    readFileAtCommit.mockResolvedValue("text");

    const { body } = await get("?owner=me&repo=notes&number=7");

    expect(readFileAtCommit).toHaveBeenCalledTimes(1);
    expect(body.files[0].before).toBeNull();
  });

  /** A picture is a real change and is listed; it is just not a diff. */
  it("lists a change it cannot put a diff through", async () => {
    getPullRequest.mockResolvedValue(pull);
    listPullRequestFiles.mockResolvedValue([
      { path: "notes/diagram.png", status: "added", previousPath: null },
    ]);

    const { body } = await get("?owner=me&repo=notes&number=7");

    expect(body.files[0]).toMatchObject({ diffable: false, before: null, after: null });
    expect(readFileAtCommit).not.toHaveBeenCalled();
  });

  /**
   * `null` means "not on this side". A file too long to compare must not
   * borrow that value, or it renders as a wholesale deletion.
   */
  it("calls a file too long to compare undiffable, not deleted", async () => {
    getPullRequest.mockResolvedValue(pull);
    listPullRequestFiles.mockResolvedValue([
      { path: "notes/huge.md", status: "modified", previousPath: null },
    ]);
    readFileAtCommit.mockResolvedValue("x".repeat(400_001));

    const { body } = await get("?owner=me&repo=notes&number=7");

    expect(body.files[0].diffable).toBe(false);
  });

  it("refuses a number that is not one", async () => {
    expect((await get("?owner=me&repo=notes&number=0")).status).toBe(400);
    expect((await get("?owner=me&repo=notes&number=nope")).status).toBe(400);
    expect(getPullRequest).not.toHaveBeenCalled();
  });
});
