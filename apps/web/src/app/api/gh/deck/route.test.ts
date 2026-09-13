import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  session: { token: "t", user: { login: "me" } } as {
    token: string;
    user: { login: string };
  } | null,
  github: {
    getRepo: vi.fn(),
    readFile: vi.fn(),
    readFileAtCommit: vi.fn(),
    getBranchHead: vi.fn(),
    createRepo: vi.fn(),
    commitChanges: vi.fn(),
  },
  tokens: [] as string[],
}));

vi.mock("@/lib/session", () => ({
  getSession: () => Promise.resolve(state.session),
  getLiveSession: () => Promise.resolve(state.session),
  clearSessionCookie: () => Promise.resolve(),
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

const { GET, POST } = await import("./route");
const { resetRateLimits } = await import("@/lib/rate-limit");

const REPO = {
  owner: "me",
  name: "bio-deck",
  private: false,
  canPush: true,
  defaultBranch: "main",
};

async function read(query: string) {
  const response = await GET(new Request(`http://localhost/api/gh/deck?${query}`) as never);
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

async function share(body: unknown) {
  const response = await POST(
    new Request("http://localhost/api/gh/deck", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }) as never,
  );
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

beforeEach(() => {
  resetRateLimits();
  state.session = { token: "t", user: { login: "me" } };
  state.tokens = [];
  for (const mock of Object.values(state.github)) mock.mockReset();
});

describe("reading a shared deck", () => {
  it("returns deck.md and the commit it is at, signed out too", async () => {
    state.session = null;
    state.github.getRepo.mockResolvedValue(REPO);
    state.github.readFile.mockResolvedValue({ content: "# Bio\n\nCell :: life\n" });
    state.github.getBranchHead.mockResolvedValue("abc1234");

    const { status, body } = await read("owner=me&repo=bio-deck");
    expect(status).toBe(200);
    expect(body).toEqual({
      owner: "me",
      repo: "bio-deck",
      sha: "abc1234",
      content: "# Bio\n\nCell :: life\n",
    });
    expect(state.tokens).toEqual([""]);
  });

  it("reads the deck as it was at an earlier version", async () => {
    state.github.getRepo.mockResolvedValue(REPO);
    state.github.readFileAtCommit.mockResolvedValue("# Bio\n\nOld :: card\n");
    const { body } = await read("owner=me&repo=bio-deck&ref=0123abcd");
    expect(body.content).toBe("# Bio\n\nOld :: card\n");
    expect(state.github.readFileAtCommit).toHaveBeenCalledWith(
      { owner: "me", repo: "bio-deck", branch: "main", directory: "" },
      "deck.md",
      "0123abcd",
    );
  });

  it("says when a repository is not a deck, or not there", async () => {
    state.github.getRepo.mockResolvedValue(REPO);
    state.github.readFile.mockResolvedValue(null);
    state.github.getBranchHead.mockResolvedValue("abc1234");
    expect((await read("owner=me&repo=bio-deck")).body).toMatchObject({
      error: { message: expect.stringContaining("has no deck.md") },
    });

    state.github.getRepo.mockResolvedValue(null);
    expect((await read("owner=me&repo=nope")).status).toBe(404);
  });

  it("refuses names and versions that would change the address called", async () => {
    expect((await read("owner=me&repo=..")).status).toBe(400);
    expect((await read("owner=me&repo=deck&ref=main;rm")).status).toBe(400);
  });
});

describe("sharing a deck", () => {
  it("makes a public repository with a README and only the card lines", async () => {
    state.github.getRepo.mockResolvedValue(null);
    state.github.createRepo.mockResolvedValue(REPO);
    state.github.commitChanges.mockResolvedValue({ sha: "fff0000" });

    const { status, body } = await share({
      title: "Bio",
      cards: "# Private heading\n\nSecret paragraph.\nCell :: life\nDNA :: genes\n",
    });

    expect(status).toBe(200);
    expect(body).toEqual({ owner: "me", repo: "bio-deck", sha: "fff0000", cards: 2 });
    expect(state.github.createRepo).toHaveBeenCalledWith(
      expect.objectContaining({ name: "bio-deck", private: false }),
    );
    const [where, changes] = state.github.commitChanges.mock.calls[0]!;
    expect(where).toEqual({ owner: "me", repo: "bio-deck", branch: "main", directory: "" });
    expect(changes).toEqual([
      expect.objectContaining({
        path: "README.md",
        content: expect.stringContaining("me/bio-deck"),
      }),
      {
        op: "upsert",
        path: "deck.md",
        content: "# Bio\n\n## Cards\n\nCell :: life\nDNA :: genes\n",
      },
    ]);
    expect(JSON.stringify(changes)).not.toContain("Secret");
  });

  it("publishes changes into a deck already shared", async () => {
    state.github.getRepo.mockResolvedValue(REPO);
    state.github.commitChanges.mockResolvedValue({ sha: "fff0001" });
    const { body } = await share({ title: "Bio", cards: "Cell :: life", repo: "bio-deck" });
    expect(body.sha).toBe("fff0001");
    expect(state.github.createRepo).not.toHaveBeenCalled();
  });

  it("will not publish into a private repository, or an empty deck", async () => {
    state.github.getRepo.mockResolvedValue({ ...REPO, private: true });
    expect((await share({ title: "Bio", cards: "Cell :: life" })).status).toBe(409);
    expect((await share({ title: "Bio", cards: "no cards here" })).status).toBe(400);
    expect(state.github.commitChanges).not.toHaveBeenCalled();
  });

  it("needs a GitHub sign-in", async () => {
    state.session = null;
    expect((await share({ title: "Bio", cards: "Cell :: life" })).status).toBe(401);
  });
});
