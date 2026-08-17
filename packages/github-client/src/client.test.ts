import { describe, it, expect, vi } from "vitest";
import { GitHubClient, buildTree } from "./client";
import { GitHubError } from "./errors";
import { encodeBase64, decodeBase64 } from "./base64";
import type { RepoRef } from "@forkleaf/types";

const repo: RepoRef = { owner: "octo", repo: "notes", branch: "main", directory: "" };

/**
 * A tiny fake GitHub. Records every request so tests can assert on the exact
 * sequence of git-data calls, which is what the squashing logic turns on.
 */
function fakeGitHub(overrides: Record<string, unknown> = {}) {
  const calls: { method: string; url: string; body: unknown }[] = [];

  const defaults: Record<string, unknown> = {
    "GET /repos/octo/notes/git/ref/heads/main": { object: { sha: "head-sha" } },
    "GET /repos/octo/notes/git/commits/head-sha": {
      sha: "head-sha",
      tree: { sha: "head-tree" },
      parents: [{ sha: "parent-sha" }],
      message: "someone else's commit",
      committer: { date: new Date().toISOString() },
    },
    "POST /repos/octo/notes/git/blobs": { sha: "new-blob" },
    "POST /repos/octo/notes/git/trees": { sha: "new-tree" },
    "POST /repos/octo/notes/git/commits": { sha: "new-commit" },
    "PATCH /repos/octo/notes/git/refs/heads/main": {},
  };

  const routes = { ...defaults, ...overrides };

  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const path = String(url).replace("https://api.github.com", "");
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, url: path, body });

    const key = `${method} ${path}`;
    const payload = routes[key];

    if (payload === undefined) {
      return new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
    }

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });

  return { calls, fetchImpl: fetchImpl as unknown as typeof globalThis.fetch };
}

describe("base64", () => {
  it("round-trips unicode content that btoa alone would corrupt", () => {
    const text = "# Notes 📓\n\nहिन्दी, 中文, emoji 🎉 — all fine.";
    expect(decodeBase64(encodeBase64(text))).toBe(text);
  });

  it("tolerates the line wrapping GitHub puts in its base64 payloads", () => {
    const encoded = encodeBase64("hello world");
    const wrapped = encoded.replace(/(.{4})/g, "$1\n");
    expect(decodeBase64(wrapped)).toBe("hello world");
  });
});

describe("commitChanges", () => {
  it("writes blob, tree, commit and ref in order for a single file", async () => {
    const { calls, fetchImpl } = fakeGitHub();
    const client = new GitHubClient({ token: "t", fetch: fetchImpl });

    const result = await client.commitChanges(
      repo,
      [{ op: "upsert", path: "a.md", content: "hi" }],
      {
        message: "update a.md",
      },
    );

    expect(result.sha).toBe("new-commit");
    expect(result.squashed).toBe(false);
    expect(result.blobShas).toEqual({ "a.md": "new-blob" });

    const writes = calls.filter((c) => c.method !== "GET").map((c) => c.url);
    expect(writes).toEqual([
      "/repos/octo/notes/git/blobs",
      "/repos/octo/notes/git/trees",
      "/repos/octo/notes/git/commits",
      "/repos/octo/notes/git/refs/heads/main",
    ]);
  });

  it("batches many file changes into exactly one commit", async () => {
    const { calls, fetchImpl } = fakeGitHub();
    const client = new GitHubClient({ token: "t", fetch: fetchImpl });

    await client.commitChanges(
      repo,
      [
        { op: "upsert", path: "a.md", content: "a" },
        { op: "upsert", path: "b.md", content: "b" },
        { op: "delete", path: "c.md" },
      ],
      { message: "batch" },
    );

    const commits = calls.filter((c) => c.url.endsWith("/git/commits") && c.method === "POST");
    expect(commits).toHaveLength(1);

    const tree = calls.find((c) => c.url.endsWith("/git/trees"))?.body as {
      tree: { path: string; sha: string | null }[];
    };
    // Deletions are expressed as a null sha in the tree entry.
    expect(tree.tree).toContainEqual({ path: "c.md", mode: "100644", type: "blob", sha: null });
    expect(tree.tree.filter((e) => e.sha !== null)).toHaveLength(2);
  });

  it("expresses a rename as an add at the new path plus a delete at the old", async () => {
    const { calls, fetchImpl } = fakeGitHub();
    const client = new GitHubClient({ token: "t", fetch: fetchImpl });

    await client.commitChanges(
      repo,
      [{ op: "rename", path: "old.md", toPath: "new.md", content: "body" }],
      { message: "rename" },
    );

    const tree = calls.find((c) => c.url.endsWith("/git/trees"))?.body as {
      tree: { path: string; sha: string | null }[];
    };
    expect(tree.tree).toContainEqual({
      path: "new.md",
      mode: "100644",
      type: "blob",
      sha: "new-blob",
    });
    expect(tree.tree).toContainEqual({ path: "old.md", mode: "100644", type: "blob", sha: null });
  });

  it("refuses to squash a commit that forkleaf did not write", async () => {
    const { calls, fetchImpl } = fakeGitHub();
    const client = new GitHubClient({ token: "t", fetch: fetchImpl });

    const result = await client.commitChanges(
      repo,
      [{ op: "upsert", path: "a.md", content: "x" }],
      {
        message: "edit",
        squashWindowMs: 60_000,
      },
    );

    expect(result.squashed).toBe(false);
    const commit = calls.find((c) => c.url.endsWith("/git/commits") && c.method === "POST")
      ?.body as { parents: string[] };
    // Stacked on HEAD, not on HEAD's parent.
    expect(commit.parents).toEqual(["head-sha"]);

    const ref = calls.find((c) => c.method === "PATCH")?.body as { force: boolean };
    expect(ref.force).toBe(false);
  });

  it("squashes into our own recent commit, keeping its tree so no file is lost", async () => {
    const { calls, fetchImpl } = fakeGitHub({
      "GET /repos/octo/notes/git/commits/head-sha": {
        sha: "head-sha",
        tree: { sha: "head-tree" },
        parents: [{ sha: "parent-sha" }],
        message: "forkleaf: update a.md",
        committer: { date: new Date().toISOString() },
      },
    });
    const client = new GitHubClient({ token: "t", fetch: fetchImpl });

    const result = await client.commitChanges(
      repo,
      [{ op: "upsert", path: "a.md", content: "x" }],
      {
        message: "update a.md",
        squashWindowMs: 60_000,
      },
    );

    expect(result.squashed).toBe(true);

    const commit = calls.find((c) => c.url.endsWith("/git/commits") && c.method === "POST")
      ?.body as { parents: string[] };
    // Reattached to HEAD's parent — the two commits collapse into one.
    expect(commit.parents).toEqual(["parent-sha"]);

    const tree = calls.find((c) => c.url.endsWith("/git/trees"))?.body as { base_tree: string };
    // Crucially based on HEAD's tree, so files HEAD introduced survive the rewrite.
    expect(tree.base_tree).toBe("head-tree");

    const ref = calls.find((c) => c.method === "PATCH")?.body as { force: boolean };
    expect(ref.force).toBe(true);
  });

  it("does not squash a commit older than the window", async () => {
    const { fetchImpl } = fakeGitHub({
      "GET /repos/octo/notes/git/commits/head-sha": {
        sha: "head-sha",
        tree: { sha: "head-tree" },
        parents: [{ sha: "parent-sha" }],
        message: "forkleaf: update a.md",
        committer: { date: new Date(Date.now() - 10 * 60_000).toISOString() },
      },
    });
    const client = new GitHubClient({ token: "t", fetch: fetchImpl });

    const result = await client.commitChanges(
      repo,
      [{ op: "upsert", path: "a.md", content: "x" }],
      {
        message: "edit",
        squashWindowMs: 60_000,
      },
    );

    expect(result.squashed).toBe(false);
  });

  it("never squashes a root commit, which has no parent to reattach to", async () => {
    const { fetchImpl } = fakeGitHub({
      "GET /repos/octo/notes/git/commits/head-sha": {
        sha: "head-sha",
        tree: { sha: "head-tree" },
        parents: [],
        message: "forkleaf: initial",
        committer: { date: new Date().toISOString() },
      },
    });
    const client = new GitHubClient({ token: "t", fetch: fetchImpl });

    const result = await client.commitChanges(
      repo,
      [{ op: "upsert", path: "a.md", content: "x" }],
      {
        message: "edit",
        squashWindowMs: 60_000,
      },
    );

    expect(result.squashed).toBe(false);
  });

  it("abandons the squash if someone else pushed while we were building it", async () => {
    let headReads = 0;
    const calls: string[] = [];

    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const path = String(url).replace("https://api.github.com", "");
      calls.push(`${method} ${path}`);

      if (path === "/repos/octo/notes/git/ref/heads/main") {
        headReads += 1;
        // The second read (the pre-force-push re-check) sees a different head.
        const sha = headReads === 1 ? "head-sha" : "someone-elses-sha";
        return json({ object: { sha } });
      }
      if (path === "/repos/octo/notes/git/commits/head-sha") {
        return json({
          sha: "head-sha",
          tree: { sha: "head-tree" },
          parents: [{ sha: "parent-sha" }],
          message: "forkleaf: update a.md",
          committer: { date: new Date().toISOString() },
        });
      }
      if (path === "/repos/octo/notes/git/commits/someone-elses-sha") {
        return json({
          sha: "someone-elses-sha",
          tree: { sha: "their-tree" },
          parents: [{ sha: "head-sha" }],
          message: "their work",
          committer: { date: new Date().toISOString() },
        });
      }
      if (path.endsWith("/git/blobs")) return json({ sha: "new-blob" });
      if (path.endsWith("/git/trees")) return json({ sha: "new-tree" });
      if (path.endsWith("/git/commits")) return json({ sha: "new-commit" });
      if (path.endsWith("/git/refs/heads/main")) return json({});
      return new Response("{}", { status: 404 });
    });

    const client = new GitHubClient({
      token: "t",
      fetch: fetchImpl as unknown as typeof globalThis.fetch,
    });
    const result = await client.commitChanges(
      repo,
      [{ op: "upsert", path: "a.md", content: "x" }],
      {
        message: "edit",
        squashWindowMs: 60_000,
      },
    );

    // Fell back to a plain commit rather than force-pushing over their work.
    expect(result.squashed).toBe(false);
    expect(calls.filter((c) => c.startsWith("PATCH")).length).toBe(1);
  });

  it("rejects an empty change set instead of making a no-op commit", async () => {
    const { fetchImpl } = fakeGitHub();
    const client = new GitHubClient({ token: "t", fetch: fetchImpl });
    await expect(client.commitChanges(repo, [], { message: "nothing" })).rejects.toThrow(
      GitHubError,
    );
  });
});

describe("readFile", () => {
  it("decodes base64 content and returns the blob sha", async () => {
    const { fetchImpl } = fakeGitHub({
      "GET /repos/octo/notes/contents/notes/a.md?ref=main": {
        type: "file",
        content: encodeBase64("# Hello"),
        sha: "blob-1",
        size: 7,
      },
    });
    const client = new GitHubClient({ token: "t", fetch: fetchImpl });

    const file = await client.readFile(repo, "notes/a.md");
    expect(file).toEqual({ path: "notes/a.md", content: "# Hello", sha: "blob-1", size: 7 });
  });

  it("returns null rather than throwing when a note does not exist", async () => {
    const { fetchImpl } = fakeGitHub();
    const client = new GitHubClient({ token: "t", fetch: fetchImpl });
    expect(await client.readFile(repo, "missing.md")).toBeNull();
  });
});

describe("error mapping", () => {
  it("classifies a 403 rate limit separately from a 403 permission denial", async () => {
    const rateLimited = vi.fn(
      async () =>
        new Response(JSON.stringify({ message: "API rate limit exceeded" }), {
          status: 403,
          headers: { "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 30) },
        }),
    );
    const client = new GitHubClient({
      token: "t",
      fetch: rateLimited as unknown as typeof globalThis.fetch,
      maxRetries: 0,
    });

    await expect(client.getAuthenticatedUser()).rejects.toMatchObject({ code: "rate-limited" });

    const forbidden = vi.fn(
      async () =>
        new Response(JSON.stringify({ message: "Resource not accessible" }), { status: 403 }),
    );
    const client2 = new GitHubClient({
      token: "t",
      fetch: forbidden as unknown as typeof globalThis.fetch,
      maxRetries: 0,
    });
    await expect(client2.getAuthenticatedUser()).rejects.toMatchObject({ code: "forbidden" });
  });

  it("does not retry a 404, which will never succeed", async () => {
    const notFound = vi.fn(
      async () => new Response(JSON.stringify({ message: "Not Found" }), { status: 404 }),
    );
    const client = new GitHubClient({
      token: "t",
      fetch: notFound as unknown as typeof globalThis.fetch,
      maxRetries: 3,
    });

    await expect(client.getAuthenticatedUser()).rejects.toMatchObject({ code: "not-found" });
    expect(notFound).toHaveBeenCalledTimes(1);
  });
});

describe("buildTree", () => {
  it("nests folders, synthesises intermediate directories and sorts folders first", () => {
    const tree = buildTree([
      { path: "zebra.md", sha: "1" },
      { path: "projects/alpha/deep.md", sha: "2" },
      { path: "apple.md", sha: "3" },
      { path: "projects/beta.md", sha: "4" },
    ]);

    expect(tree.map((n) => n.name)).toEqual(["projects", "apple.md", "zebra.md"]);

    const projects = tree[0]!;
    expect(projects.kind).toBe("folder");
    expect(projects.children!.map((n) => n.name)).toEqual(["alpha", "beta.md"]);
    expect(projects.children![0]!.children![0]!.path).toBe("projects/alpha/deep.md");
  });
});

function json(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
