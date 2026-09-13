import { afterEach, describe, expect, it, vi } from "vitest";

const getRepo = vi.fn();
const getBranchHead = vi.fn();
const listTree = vi.fn();
const readFileAtCommit = vi.fn();
const tokens: string[] = [];
const session = vi.fn();

vi.mock("@/lib/session", () => ({
  getSession: () => session(),
  getLiveSession: () => session(),
}));

vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: vi.fn() }));

vi.mock("@forkleaf/github-client", async () => {
  const actual =
    await vi.importActual<typeof import("@forkleaf/github-client")>("@forkleaf/github-client");
  return {
    ...actual,
    GitHubClient: class {
      constructor(options: { token: string }) {
        tokens.push(options.token);
      }
      getRepo = getRepo;
      getBranchHead = getBranchHead;
      listTree = listTree;
      readFileAtCommit = readFileAtCommit;
    },
  };
});

const { GET, MAX_NOTE_CHARS } = await import("./route");

afterEach(() => {
  vi.clearAllMocks();
  tokens.length = 0;
});

const HEAD = "a".repeat(40);
const file = (path: string) => ({ kind: "file" as const, name: path.split("/").pop()!, path });

function notebook(files: Record<string, string | null>, extra: string[] = []) {
  getRepo.mockResolvedValue({ defaultBranch: "main" });
  getBranchHead.mockResolvedValue(HEAD);
  listTree.mockResolvedValue([...Object.keys(files), ...extra].map(file));
  readFileAtCommit.mockImplementation(async (_repo: unknown, path: string) => files[path] ?? null);
}

async function get(query: string, headers: Record<string, string> = {}) {
  const response = await GET(
    new Request(`http://localhost/api/gh/notebook-check?${query}`, { headers }) as never,
  );
  return { status: response.status, body: await response.json() };
}

describe("GET /api/gh/notebook-check", () => {
  it("checks the default branch at one commit, and reports what is broken", async () => {
    session.mockResolvedValue(null);
    notebook(
      { "notes/runbook.md": "![x](../assets/gone.png)\n\n[[Nowhere]]", "notes/ok.md": "# Fine" },
      ["assets/logo.png"],
    );

    const { status, body } = await get("owner=ada&repo=notes");

    expect(status).toBe(200);
    expect(getBranchHead).toHaveBeenCalledWith(expect.objectContaining({ branch: "main" }));
    expect(listTree).toHaveBeenCalledWith(expect.anything(), { include: "all", ref: HEAD });
    for (const call of readFileAtCommit.mock.calls) expect(call[2]).toBe(HEAD);
    expect(body).toMatchObject({ repository: "ada/notes", ref: HEAD, ok: false, scanned: 2 });
    expect(body.notes[0]).toMatchObject({
      path: "notes/runbook.md",
      missingFiles: ["assets/gone.png"],
      missingLinks: ["Nowhere"],
    });
    expect(body.markdown).toContain("at `aaaaaaa`");
    // Anonymous: no token of anybody's was used.
    expect(tokens).toEqual([""]);
  });

  it("checks a given commit without asking for the branch head", async () => {
    session.mockResolvedValue(null);
    notebook({ "a.md": "# A" });
    const sha = "b".repeat(40);
    const { body } = await get(`owner=ada&repo=notes&ref=${sha}`);
    expect(getRepo).not.toHaveBeenCalled();
    expect(getBranchHead).not.toHaveBeenCalled();
    expect(body).toMatchObject({ ref: sha, ok: true });
  });

  it("uses a bearer token in preference to the session, and rejects any other header", async () => {
    session.mockResolvedValue({ token: "session-token", user: { login: "me" } });
    notebook({ "a.md": "# A" });
    const token = "ghs_" + "x".repeat(36);

    await get("owner=ada&repo=notes", { authorization: `Bearer ${token}` });
    expect(tokens).toEqual([token]);
    expect(session).not.toHaveBeenCalled();

    const { status } = await get("owner=ada&repo=notes", { authorization: "Basic abc" });
    expect(status).toBe(400);
  });

  it("uses the signed-in session when no token is sent", async () => {
    session.mockResolvedValue({ token: "session-token", user: { login: "me" } });
    notebook({ "a.md": "# A" });
    await get("owner=ada&repo=notes");
    expect(tokens).toEqual(["session-token"]);
  });

  it("skips notes too large to read, and says how many", async () => {
    session.mockResolvedValue(null);
    notebook({ "a.md": "# A", "huge.md": "x".repeat(MAX_NOTE_CHARS + 1), "gone.md": null });
    const { body } = await get("owner=ada&repo=notes");
    expect(body.scanned).toBe(1);
    expect(body.skipped).toBe(2);
    expect(body.markdown).toContain("2 files were too large or too many to read");
  });

  it("answers 404 for a repository that cannot be found", async () => {
    session.mockResolvedValue(null);
    getRepo.mockResolvedValue(null);
    const { status, body } = await get("owner=ada&repo=secret");
    expect(status).toBe(404);
    expect(JSON.stringify(body)).toContain("needs a token");
  });

  it("refuses names that are not GitHub names", async () => {
    session.mockResolvedValue(null);
    const { status } = await get("owner=ada/../x&repo=notes");
    expect(status).toBe(400);
    expect(listTree).not.toHaveBeenCalled();
  });
});
