import { afterEach, describe, expect, it, vi } from "vitest";

const listOpenPullRequests = vi.fn();

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
