import { afterEach, describe, expect, it, vi } from "vitest";

const listBranchSummaries = vi.fn();
const createBranch = vi.fn();
const deleteBranch = vi.fn();

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
      listBranchSummaries = listBranchSummaries;
      createBranch = createBranch;
      deleteBranch = deleteBranch;
    },
  };
});

const { DELETE } = await import("./route");

afterEach(() => vi.clearAllMocks());

async function remove(body: unknown) {
  const response = await DELETE(
    new Request("http://localhost/api/gh/branches", {
      method: "DELETE",
      body: JSON.stringify(body),
    }) as never,
  );
  return { status: response.status, body: await response.json() };
}

describe("DELETE /api/gh/branches", () => {
  it("throws an experiment away", async () => {
    const { status } = await remove({ owner: "me", repo: "notes", name: "try/main/rewrite" });

    expect(status).toBe(200);
    expect(deleteBranch).toHaveBeenCalledWith("me", "notes", "try/main/rewrite");
  });

  /**
   * The narrowness is the point. Nothing in this app needs to delete an
   * ordinary branch, and a route that could is a route that can lose work.
   */
  it("refuses to delete anything that is not an experiment", async () => {
    for (const name of ["main", "release/2026", "feature/search", ""]) {
      expect((await remove({ owner: "me", repo: "notes", name })).status).toBe(400);
    }

    expect(deleteBranch).not.toHaveBeenCalled();
  });

  it("refuses a request with no repository named", async () => {
    expect((await remove({ name: "try/main/x" })).status).toBe(400);
    expect(deleteBranch).not.toHaveBeenCalled();
  });
});
