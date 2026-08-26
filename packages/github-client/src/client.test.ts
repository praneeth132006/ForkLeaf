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

describe("binary content", () => {
  it("hands an already-base64 payload to GitHub untouched", async () => {
    const { calls, fetchImpl } = fakeGitHub();
    const client = new GitHubClient({ token: "t", fetch: fetchImpl });

    // Real PNG bytes: re-encoding these as UTF-8 would corrupt them, which is
    // the whole reason `encoding` exists.
    const png =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

    await client.commitChanges(
      repo,
      [{ op: "upsert", path: "assets/dot.png", content: png, encoding: "base64" }],
      { message: "add an image" },
    );

    const blob = calls.find((call) => call.url === "/repos/octo/notes/git/blobs");
    expect(blob?.body).toEqual({ content: png, encoding: "base64" });
  });

  it("still encodes text content, so notes are unaffected", async () => {
    const { calls, fetchImpl } = fakeGitHub();
    const client = new GitHubClient({ token: "t", fetch: fetchImpl });

    await client.commitChanges(repo, [{ op: "upsert", path: "a.md", content: "# Hi" }], {
      message: "update",
    });

    const blob = calls.find((call) => call.url === "/repos/octo/notes/git/blobs");
    expect(blob?.body).toEqual({ content: encodeBase64("# Hi"), encoding: "base64" });
  });

  it("reads a file's bytes back without decoding them as text", async () => {
    const png = "iVBORw0KGgo=";
    const { fetchImpl } = fakeGitHub({
      "GET /repos/octo/notes/contents/assets/dot.png?ref=main": {
        type: "file",
        // GitHub wraps its base64 at 60 characters.
        content: `${png.slice(0, 4)}\n${png.slice(4)}`,
        sha: "blob-9",
        size: 8,
      },
    });
    const client = new GitHubClient({ token: "t", fetch: fetchImpl });

    expect(await client.readFileBase64(repo, "assets/dot.png")).toEqual({
      base64: png,
      sha: "blob-9",
      size: 8,
    });
  });

  it("returns null for a missing file rather than throwing", async () => {
    const { fetchImpl } = fakeGitHub();
    const client = new GitHubClient({ token: "t", fetch: fetchImpl });
    expect(await client.readFileBase64(repo, "assets/missing.png")).toBeNull();
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

describe("branches", () => {
  const branchRoutes = {
    "GET /repos/octo/notes/branches?per_page=100": [
      { name: "docs-fix", commit: { sha: "b1" }, protected: false },
      { name: "main", commit: { sha: "b2" }, protected: true },
      { name: "another", commit: { sha: "b3" } },
    ],
    "GET /repos/octo/notes": {
      name: "notes",
      full_name: "octo/notes",
      private: false,
      default_branch: "main",
      permissions: { push: true },
      owner: { login: "octo" },
      updated_at: "2026-01-01T00:00:00Z",
      description: null,
    },
  };

  it("puts the default branch first and flags protection", async () => {
    const { fetchImpl } = fakeGitHub(branchRoutes);
    const client = new GitHubClient({ token: "t", fetch: fetchImpl });

    const branches = await client.listBranchSummaries("octo", "notes");

    expect(branches.map((b) => b.name)).toEqual(["main", "another", "docs-fix"]);
    expect(branches[0]).toMatchObject({ isDefault: true, protected: true, sha: "b2" });
    expect(branches[2]).toMatchObject({ isDefault: false, protected: false });
  });

  it("returns an existing branch instead of failing to recreate it", async () => {
    const { calls, fetchImpl } = fakeGitHub({
      "GET /repos/octo/notes/branches/docs-fix": {
        name: "docs-fix",
        commit: { sha: "b1" },
      },
    });
    const client = new GitHubClient({ token: "t", fetch: fetchImpl });

    const branch = await client.createBranch("octo", "notes", "docs-fix", "main");

    expect(branch).toMatchObject({ name: "docs-fix", sha: "b1" });
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("creates a ref at the source branch's head", async () => {
    const { calls, fetchImpl } = fakeGitHub({
      "GET /repos/octo/notes/branches/main": { name: "main", commit: { sha: "head-sha" } },
      "POST /repos/octo/notes/git/refs": {},
    });
    const client = new GitHubClient({ token: "t", fetch: fetchImpl });

    const branch = await client.createBranch("octo", "notes", "new-topic", "main");

    expect(branch).toMatchObject({ name: "new-topic", sha: "head-sha" });
    expect(calls).toContainEqual({
      method: "POST",
      url: "/repos/octo/notes/git/refs",
      body: { ref: "refs/heads/new-topic", sha: "head-sha" },
    });
  });

  it("refuses to branch from something that does not exist", async () => {
    const { fetchImpl } = fakeGitHub();
    const client = new GitHubClient({ token: "t", fetch: fetchImpl });

    await expect(client.createBranch("octo", "notes", "x", "nope")).rejects.toThrow(GitHubError);
  });
});

describe("pull requests", () => {
  const openPr = {
    number: 7,
    html_url: "https://github.com/octo/notes/pull/7",
    state: "open",
    title: "Docs",
    draft: false,
    head: { ref: "docs-fix" },
    base: { ref: "main" },
  };

  it("reuses an already-open pull request rather than duplicating it", async () => {
    const { calls, fetchImpl } = fakeGitHub({
      "GET /repos/octo/notes/pulls?state=open&head=octo%3Adocs-fix&base=main&per_page=10": [openPr],
    });
    const client = new GitHubClient({ token: "t", fetch: fetchImpl });

    const pr = await client.createPullRequest({
      owner: "octo",
      repo: "notes",
      title: "Docs",
      head: "docs-fix",
      base: "main",
    });

    expect(pr).toMatchObject({ number: 7, url: openPr.html_url, head: "docs-fix" });
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("opens one when none exists, carrying title, body and draft", async () => {
    const { calls, fetchImpl } = fakeGitHub({
      "GET /repos/octo/notes/pulls?state=open&head=octo%3Adocs-fix&base=main&per_page=10": [],
      "POST /repos/octo/notes/pulls": { ...openPr, draft: true },
    });
    const client = new GitHubClient({ token: "t", fetch: fetchImpl });

    const pr = await client.createPullRequest({
      owner: "octo",
      repo: "notes",
      title: "Fix the docs",
      body: "Typos.",
      head: "docs-fix",
      base: "main",
      draft: true,
    });

    expect(pr.draft).toBe(true);
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({
      title: "Fix the docs",
      head: "docs-fix",
      base: "main",
      body: "Typos.",
      draft: true,
    });
  });

  it("qualifies a cross-fork head with its owner when searching", async () => {
    const { calls, fetchImpl } = fakeGitHub({
      "GET /repos/upstream/docs/pulls?state=open&head=me%3Atopic&base=main&per_page=10": [],
      "POST /repos/upstream/docs/pulls": openPr,
    });
    const client = new GitHubClient({ token: "t", fetch: fetchImpl });

    await client.createPullRequest({
      owner: "upstream",
      repo: "docs",
      title: "t",
      head: "me:topic",
      base: "main",
    });

    expect(calls[0]!.url).toContain("head=me%3Atopic");
  });
});

/**
 * Deleting something the repository does not have.
 *
 * GitHub does not shrug at a tree entry that removes a path it cannot find: it
 * answers 422 `GitRPC::BadObjectState` and refuses the entire commit. Since a
 * commit here carries every queued change, one stale deletion used to stop a
 * repository syncing altogether — and keep stopping it, on every retry.
 */
describe("deletions of paths that are not in the repository", () => {
  const tree = {
    "GET /repos/octo/notes/git/trees/head-tree?recursive=1": {
      tree: [
        { path: "a.md", type: "blob" },
        { path: "assets/real.png", type: "blob" },
      ],
      truncated: false,
    },
  };

  it("drops the impossible deletion and commits the rest", async () => {
    const { calls, fetchImpl } = fakeGitHub(tree);
    const client = new GitHubClient({ token: "t", fetch: fetchImpl });

    await client.commitChanges(
      repo,
      [
        { op: "upsert", path: "a.md", content: "a" },
        { op: "delete", path: "assets/real.png" },
        { op: "delete", path: "assets/never-pushed.png" },
      ],
      { message: "batch" },
    );

    const body = calls.find((c) => c.url.endsWith("/git/trees") && c.method === "POST")?.body as {
      tree: { path: string; sha: string | null }[];
    };

    expect(body.tree.map((entry) => entry.path)).toEqual(["a.md", "assets/real.png"]);
  });

  it("makes no commit at all when nothing is left to write", async () => {
    const { calls, fetchImpl } = fakeGitHub(tree);
    const client = new GitHubClient({ token: "t", fetch: fetchImpl });

    const result = await client.commitChanges(
      repo,
      [{ op: "delete", path: "assets/never-pushed.png" }],
      { message: "tidy up" },
    );

    // Reporting HEAD: the branch is already in the state that was asked for.
    expect(result.sha).toBe("head-sha");
    expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/git/commits"))).toBe(false);
  });

  it("does not read the tree when there is nothing to delete", async () => {
    const { calls, fetchImpl } = fakeGitHub(tree);
    const client = new GitHubClient({ token: "t", fetch: fetchImpl });

    await client.commitChanges(repo, [{ op: "upsert", path: "a.md", content: "a" }], {
      message: "edit",
    });

    expect(calls.some((c) => c.url.includes("recursive=1"))).toBe(false);
  });

  it("commits as asked when the tree cannot be read", async () => {
    // No tree route: the guard cannot run, and must not become a second way
    // for the commit to fail.
    const { calls, fetchImpl } = fakeGitHub();
    const client = new GitHubClient({ token: "t", fetch: fetchImpl });

    await client.commitChanges(repo, [{ op: "delete", path: "gone.md" }], { message: "delete" });

    const body = calls.find((c) => c.url.endsWith("/git/trees") && c.method === "POST")?.body as {
      tree: { path: string }[];
    };
    expect(body.tree.map((entry) => entry.path)).toEqual(["gone.md"]);
  });
});

/**
 * Moving a file without re-uploading it.
 *
 * A note is renamed by writing its text at the new path, because the text
 * changes — its relative links are rewritten to suit where it now sits. An
 * image has nothing to rewrite, and re-uploading a megabyte of screenshot to
 * change its name is absurd, so a `move` carries the path pair alone and the
 * commit reuses the blob already in the tree. Which is what a rename is in git.
 */
describe("commitChanges: move", () => {
  const withTree = (entries: { path: string; sha: string }[]) => ({
    "GET /repos/octo/notes/git/trees/head-tree?recursive=1": {
      tree: entries.map((entry) => ({ ...entry, type: "blob" })),
    },
  });

  it("reuses the existing blob rather than uploading one", async () => {
    const { calls, fetchImpl } = fakeGitHub(
      withTree([{ path: "Intro/assets/a.png", sha: "png-blob" }]),
    );
    const client = new GitHubClient({ token: "t", fetch: fetchImpl });

    await client.commitChanges(
      repo,
      [{ op: "move", path: "Intro/assets/a.png", toPath: "Python/Intro/assets/a.png" }],
      { message: "move" },
    );

    // The point of the whole op: no bytes went up.
    expect(calls.filter((c) => c.url.endsWith("/git/blobs"))).toHaveLength(0);

    const tree = calls.find((c) => c.url.endsWith("/git/trees") && c.method === "POST")?.body as {
      tree: { path: string; sha: string | null }[];
    };
    expect(tree.tree).toContainEqual({
      path: "Python/Intro/assets/a.png",
      mode: "100644",
      type: "blob",
      sha: "png-blob",
    });
    expect(tree.tree).toContainEqual({
      path: "Intro/assets/a.png",
      mode: "100644",
      type: "blob",
      sha: null,
    });
  });

  it("skips a file the repository does not have", async () => {
    // Already moved from another device, or never pushed. Asking git to delete
    // a path that is not in the tree fails the entire commit, taking down
    // everything batched with it.
    const { calls, fetchImpl } = fakeGitHub(withTree([{ path: "somewhere/else.png", sha: "x" }]));
    const client = new GitHubClient({ token: "t", fetch: fetchImpl });

    const result = await client.commitChanges(
      repo,
      [{ op: "move", path: "Intro/assets/gone.png", toPath: "Python/Intro/assets/gone.png" }],
      { message: "move" },
    );

    // Nothing to write, so nothing is written and HEAD is reported back.
    expect(result.sha).toBe("head-sha");
    expect(calls.filter((c) => c.method === "POST" && c.url.endsWith("/git/commits"))).toHaveLength(
      0,
    );
  });

  it("moves the image in the same commit as the note beside it", async () => {
    const { calls, fetchImpl } = fakeGitHub(
      withTree([
        { path: "Intro/assets/a.png", sha: "png-blob" },
        { path: "Intro/note.md", sha: "md-blob" },
      ]),
    );
    const client = new GitHubClient({ token: "t", fetch: fetchImpl });

    await client.commitChanges(
      repo,
      [
        { op: "rename", path: "Intro/note.md", toPath: "Python/Intro/note.md", content: "# hi" },
        { op: "move", path: "Intro/assets/a.png", toPath: "Python/Intro/assets/a.png" },
      ],
      { message: "move folder" },
    );

    // One commit, so a reader of the repository never sees the note moved and
    // its picture left behind.
    expect(calls.filter((c) => c.method === "POST" && c.url.endsWith("/git/commits"))).toHaveLength(
      1,
    );
    // Only the note's text was uploaded.
    expect(calls.filter((c) => c.url.endsWith("/git/blobs"))).toHaveLength(1);
  });
});

/**
 * Reading an image the browser may already have.
 *
 * The image proxy sends an `ETag` and gets an `If-None-Match` back on the next
 * request. It used to ignore it and fetch every image from GitHub in full on
 * every note open — several megabytes, and one rate-limited API call each, to
 * send back bytes the browser was already holding.
 */
describe("readFileBase64", () => {
  it("passes the caller's etag through as a conditional request", async () => {
    const { calls, fetchImpl } = fakeGitHub({
      "GET /repos/octo/notes/contents/a.png?ref=main": {
        type: "file",
        content: "aGk=",
        sha: "png-sha",
        size: 2,
      },
    });
    const client = new GitHubClient({ token: "t", fetch: fetchImpl });

    await client.readFileBase64(repo, "a.png", { etag: '"png-sha"' });

    const call = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const headers = new Headers((call[1] as RequestInit).headers);
    expect(headers.get("if-none-match")).toBe('"png-sha"');
    expect(calls).toHaveLength(1);
  });

  it("reports an unchanged file without a body to decode", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 304 }));
    const client = new GitHubClient({
      token: "t",
      fetch: fetchImpl as unknown as typeof globalThis.fetch,
    });

    const file = await client.readFileBase64(repo, "a.png", { etag: '"png-sha"' });

    expect(file?.notModified).toBe(true);
    expect(file?.base64).toBe("");
  });

  it("reads normally when no etag is offered", async () => {
    const { fetchImpl } = fakeGitHub({
      "GET /repos/octo/notes/contents/a.png?ref=main": {
        type: "file",
        content: "aGk=",
        sha: "png-sha",
        size: 2,
      },
    });
    const client = new GitHubClient({ token: "t", fetch: fetchImpl });

    const file = await client.readFileBase64(repo, "a.png");

    expect(file?.notModified).toBeUndefined();
    expect(file?.base64).toBe("aGk=");
    expect(file?.sha).toBe("png-sha");
  });
});
