import { afterEach, describe, expect, it, vi } from "vitest";

const compareBranches = vi.fn();
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
      compareBranches = compareBranches;
      readFileAtCommit = readFileAtCommit;
    },
  };
});

const { GET } = await import("./route");

afterEach(() => vi.clearAllMocks());

async function get(query: string) {
  const response = await GET(new Request(`http://localhost/api/gh/compare${query}`) as never);
  return { status: response.status, body: await response.json() };
}

const comparison = (over: Record<string, unknown> = {}) => ({
  mergeBaseSha: "merge00",
  headSha: "head000",
  aheadBy: 3,
  behindBy: 0,
  truncated: false,
  files: [{ path: "notes/runbook.md", status: "modified", previousPath: null }],
  ...over,
});

describe("GET /api/gh/compare", () => {
  it("reads both versions of every note the rewrite touches", async () => {
    compareBranches.mockResolvedValue(comparison());
    readFileAtCommit.mockImplementation((_ref: unknown, _path: string, sha: string) =>
      Promise.resolve(sha === "merge00" ? "the original" : "the rewrite"),
    );

    const { status, body } = await get("?owner=me&repo=notes&base=main&head=try/main/runbook");

    expect(status).toBe(200);
    expect(body.files[0]).toMatchObject({
      before: "the original",
      after: "the rewrite",
      diffable: true,
    });
  });

  /**
   * The correctness point of the whole route.
   *
   * Comparing against the base branch's *tip* would report anything that
   * landed on `main` while the rewrite was being written as something the
   * rewrite deletes — which would talk somebody out of keeping a rewrite that
   * deletes nothing. The merge base is the commit the experiment grew from.
   */
  it("reads the original at the merge base, not at the branch tip", async () => {
    compareBranches.mockResolvedValue(comparison({ behindBy: 4 }));
    readFileAtCommit.mockResolvedValue("text");

    await get("?owner=me&repo=notes&base=main&head=try/main/runbook");

    const befores = readFileAtCommit.mock.calls.filter((call) => call[2] === "merge00");
    expect(befores).toHaveLength(1);
    expect(readFileAtCommit).not.toHaveBeenCalledWith(expect.anything(), expect.anything(), "main");
  });

  it("passes on how far the original has moved, so the dialog can say so", async () => {
    compareBranches.mockResolvedValue(comparison({ behindBy: 4 }));
    readFileAtCommit.mockResolvedValue("text");

    const { body } = await get("?owner=me&repo=notes&base=main&head=try/main/runbook");

    expect(body.behindBy).toBe(4);
  });

  it("reads a renamed note from the path it used to have", async () => {
    compareBranches.mockResolvedValue(
      comparison({
        files: [{ path: "notes/new.md", status: "renamed", previousPath: "notes/old.md" }],
      }),
    );
    readFileAtCommit.mockResolvedValue("text");

    await get("?owner=me&repo=notes&base=main&head=try/main/runbook");

    expect(readFileAtCommit).toHaveBeenCalledWith(expect.anything(), "notes/old.md", "merge00");
    expect(readFileAtCommit).toHaveBeenCalledWith(expect.anything(), "notes/new.md", "head000");
  });

  it("does not look for a file on the side it does not exist on", async () => {
    compareBranches.mockResolvedValue(
      comparison({ files: [{ path: "notes/new.md", status: "added", previousPath: null }] }),
    );
    readFileAtCommit.mockResolvedValue("text");

    const { body } = await get("?owner=me&repo=notes&base=main&head=try/main/runbook");

    expect(readFileAtCommit).toHaveBeenCalledTimes(1);
    expect(body.files[0].before).toBeNull();
  });

  /** A screenshot a rewrite adds is a real change, and is still listed. */
  it("lists a change it cannot put a diff through", async () => {
    compareBranches.mockResolvedValue(
      comparison({ files: [{ path: "notes/shot.png", status: "added", previousPath: null }] }),
    );

    const { body } = await get("?owner=me&repo=notes&base=main&head=try/main/runbook");

    expect(body.files[0]).toMatchObject({ diffable: false, before: null, after: null });
    expect(readFileAtCommit).not.toHaveBeenCalled();
  });

  /**
   * `null` means "not on this side of the comparison". A file too long to
   * diff must not borrow that value, or it renders as a wholesale deletion.
   */
  it("calls a file too long to compare undiffable, not deleted", async () => {
    compareBranches.mockResolvedValue(comparison());
    readFileAtCommit.mockResolvedValue("x".repeat(400_001));

    const { body } = await get("?owner=me&repo=notes&base=main&head=try/main/runbook");

    expect(body.files[0].diffable).toBe(false);
  });

  it("refuses to compare a branch with itself", async () => {
    expect((await get("?owner=me&repo=notes&base=main&head=main")).status).toBe(400);
    expect(compareBranches).not.toHaveBeenCalled();
  });

  it("refuses a request with a side missing", async () => {
    expect((await get("?owner=me&repo=notes&base=main")).status).toBe(400);
    expect((await get("?owner=me&repo=notes&head=try/main/x")).status).toBe(400);
    expect(compareBranches).not.toHaveBeenCalled();
  });

  it("refuses a name that is not one", async () => {
    // Both halves are interpolated into the upstream URL.
    expect((await get("?owner=me&repo=notes/../../etc&base=main&head=x")).status).toBe(400);
  });
});
