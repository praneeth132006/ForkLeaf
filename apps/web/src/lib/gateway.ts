"use client";

import type { RemoteGateway, RemoteCommitInput, RemoteCommitResult } from "@forkleaf/store";
import type { RepoRef, TreeNode, Workspace } from "@forkleaf/types";

/**
 * The browser's view of GitHub.
 *
 * Everything goes through our own API routes, which hold the OAuth token. That
 * is the whole point: no token in localStorage, no token in a JS variable, no
 * token in a network request the page can read.
 */

export class ApiGatewayError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiGatewayError";
  }

  /** True when the user needs to sign in again. */
  get needsAuth(): boolean {
    return this.code === "unauthorized";
  }
}

async function call<T>(url: string, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
  let response: Response;
  const { timeoutMs, ...rest } = init ?? {};

  try {
    response = await fetch(url, {
      ...rest,
      headers: { "Content-Type": "application/json", ...init?.headers },
      // A `fetch` with no signal waits forever on a server that accepts the
      // connection and then says nothing, which is not a hypothetical: a
      // suspended laptop and a proxy that holds the socket both do it. Only
      // the calls whose duration is bounded in principle opt in — a commit of
      // fifty notes is allowed to take its time.
      ...(timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
    });
  } catch {
    // Genuine network failure — the sync engine treats this as "still offline"
    // and keeps the change queued.
    throw new ApiGatewayError("network", "No connection to the server.", 0);
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { code?: string; message?: string };
    } | null;

    throw new ApiGatewayError(
      body?.error?.code ?? "unknown",
      body?.error?.message ?? `Request failed (${response.status})`,
      response.status,
    );
  }

  return (await response.json()) as T;
}

function repoParams(repo: RepoRef): string {
  const params = new URLSearchParams({
    owner: repo.owner,
    repo: repo.repo,
    branch: repo.branch,
  });
  if (repo.directory) params.set("dir", repo.directory);
  return params.toString();
}

/**
 * Resolves a workspace id back to its repo reference.
 *
 * The sync engine only knows workspace ids, so the gateway keeps the lookup
 * table. Workspaces are registered as they are opened.
 */
export class GitHubGateway implements RemoteGateway {
  private readonly workspaces = new Map<string, RepoRef>();

  register(workspace: Workspace): void {
    this.workspaces.set(workspace.id, workspace.repo);
  }

  unregister(workspaceId: string): void {
    this.workspaces.delete(workspaceId);
  }

  private resolve(workspaceId: string): RepoRef {
    const repo = this.workspaces.get(workspaceId);
    if (!repo) throw new ApiGatewayError("not-found", "That workspace is not connected.", 404);
    return repo;
  }

  async listTree(workspaceId: string): Promise<TreeNode[]> {
    const { tree } = await call<{ tree: TreeNode[] }>(
      `/api/gh/tree?${repoParams(this.resolve(workspaceId))}`,
    );
    return tree;
  }

  async listAllPaths(workspaceId: string): Promise<string[]> {
    const { tree } = await call<{ tree: TreeNode[] }>(
      `/api/gh/tree?${repoParams(this.resolve(workspaceId))}&all=1`,
    );

    const paths: string[] = [];
    const walk = (nodes: TreeNode[]) => {
      for (const node of nodes) {
        if (node.kind === "file") paths.push(node.path);
        if (node.children) walk(node.children);
      }
    };
    walk(tree);
    return paths;
  }

  async readFile(
    workspaceId: string,
    path: string,
  ): Promise<{ content: string; sha: string } | null> {
    const params = `${repoParams(this.resolve(workspaceId))}&path=${encodeURIComponent(path)}`;
    const { file } = await call<{ file: { content: string; sha: string } | null }>(
      `/api/gh/file?${params}`,
    );
    return file;
  }

  async commit(input: RemoteCommitInput): Promise<RemoteCommitResult> {
    const repo = this.resolve(input.workspaceId);

    return call<RemoteCommitResult>("/api/gh/commit", {
      method: "POST",
      body: JSON.stringify({
        owner: repo.owner,
        repo: repo.repo,
        branch: repo.branch,
        dir: repo.directory,
        message: input.message,
        squashWindowMs: input.squashWindowMs,
        changes: input.changes,
      }),
    });
  }
}

/**
 * Gateway for local-only mode.
 *
 * Every operation is a no-op that succeeds, so the whole app — editor, sync
 * status, conflict handling — runs unchanged with notes living purely in
 * IndexedDB. This is what makes the app usable without a GitHub account, and
 * what makes it possible to run the project locally with no OAuth setup.
 */
export class LocalGateway implements RemoteGateway {
  async listTree(): Promise<TreeNode[]> {
    return [];
  }

  async listAllPaths(): Promise<string[]> {
    // Nothing is ever remote, so there is nothing on GitHub to tidy up.
    return [];
  }

  async readFile(): Promise<null> {
    // Nothing is ever "remote", so there is never a conflict to detect.
    return null;
  }

  async commit(input: RemoteCommitInput): Promise<RemoteCommitResult> {
    // Report success with a synthetic SHA so the store marks notes as clean.
    const blobShas: Record<string, string> = {};
    for (const change of input.changes) {
      const path = change.op === "rename" ? (change.toPath ?? change.path) : change.path;
      if (change.op !== "delete") blobShas[path] = `local-${Date.now()}`;
    }
    return { sha: `local-${Date.now()}`, blobShas, squashed: false };
  }
}

// ─── Session and setup calls ────────────────────────────────────────────────

export interface SessionResponse {
  mode: "github" | "local";
  user: { id: number; login: string; name: string | null; avatarUrl: string } | null;
  githubAvailable: boolean;
  /** The OAuth scopes GitHub granted this session. Never includes the token. */
  scopes?: string[];
}

/**
 * Who the user is, according to the server.
 *
 * Bounded, because both the editor and the dashboard await this before they
 * render anything at all: an unanswered request here is a loading screen with
 * no way out. The callers already treat a failure as "local mode", which is
 * the right answer when the server cannot be reached anyway.
 */
export function fetchSession(): Promise<SessionResponse> {
  return call<SessionResponse>("/api/session", { timeoutMs: SESSION_TIMEOUT_MS });
}

/** Generous — this is a guard against never, not a latency budget. */
const SESSION_TIMEOUT_MS = 10_000;

export function signOut(): Promise<{ ok: boolean }> {
  return call<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
}

export interface RepoSummaryDto {
  owner: string;
  name: string;
  fullName: string;
  private: boolean;
  defaultBranch: string;
  description: string | null;
  updatedAt: string;
}

/** One entry in a note's history. Mirrors `NoteCommit` from the GitHub client. */
export interface NoteCommitDto {
  sha: string;
  message: string;
  authorName: string;
  authorLogin: string | null;
  avatarUrl: string | null;
  date: string;
  byForkLeaf: boolean;
}

/**
 * A note's commit history, newest first.
 *
 * Read through our own proxy like everything else, so the access token stays
 * server-side and the reader never has to leave the app to see it.
 */
/**
 * Commits a set of changes straight to a named branch.
 *
 * The sync engine's own commit path goes through a workspace id, which carries
 * a branch — so it can only ever write to the branch the workspace is on. The
 * propose-changes flow needs the other thing: write *these* changes to *that*
 * branch, without moving the workspace onto it first.
 */
export async function commitToBranch(options: {
  owner: string;
  repo: string;
  branch: string;
  directory: string;
  message: string;
  changes: {
    op: "upsert" | "delete" | "rename" | "move";
    path: string;
    toPath?: string;
    content?: string;
  }[];
}): Promise<{ sha: string }> {
  const { owner, repo, branch, directory, message, changes } = options;

  return call("/api/gh/commit", {
    method: "POST",
    body: JSON.stringify({ owner, repo, branch, dir: directory, message, changes }),
  });
}

/**
 * Publishes a rendered note as a page in the repository's `docs/` folder, and
 * makes sure GitHub Pages is serving it.
 *
 * The page is committed to the user's own repository and served by GitHub, so
 * nothing about a published note depends on ForkLeaf continuing to exist. See
 * `api/gh/publish` for why that shape was chosen.
 */
export async function publishNote(options: {
  repo: RepoRef;
  slug: string;
  html: string;
  title: string;
}): Promise<{ url: string; siteUrl: string; status: string | null; path: string }> {
  const { repo, ...rest } = options;

  return call("/api/gh/publish", {
    method: "POST",
    body: JSON.stringify({
      owner: repo.owner,
      repo: repo.repo,
      branch: repo.branch,
      dir: repo.directory,
      ...rest,
    }),
  });
}

/** One page published from a repository's `docs/` folder. */
export interface PublishedPage {
  slug: string;
  path: string;
  size: number;
  sha: string;
  /** The public address, or null while Pages is switched off. */
  url: string | null;
}

export interface PublishedPages {
  pages: PublishedPage[];
  site: { url: string; status: string | null; isPublic: boolean } | null;
}

/**
 * Everything this repository currently has published.
 *
 * Asked for rather than remembered: what is published is exactly what is in
 * `docs/`, and the repository is the only copy of that fact worth trusting.
 * Somebody who deletes a page from GitHub directly has unpublished it, and
 * a record kept here would go on claiming otherwise.
 */
export async function listPublishedPages(repo: RepoRef): Promise<PublishedPages> {
  return call(`/api/gh/publish?${repoParams(repo)}`);
}

/** Deletes a published page. The note itself is left alone. */
export async function unpublishNote(repo: RepoRef, slug: string): Promise<{ path: string }> {
  return call("/api/gh/publish", {
    method: "DELETE",
    body: JSON.stringify({
      owner: repo.owner,
      repo: repo.repo,
      branch: repo.branch,
      dir: repo.directory,
      slug,
    }),
  });
}

export async function listNoteHistory(
  repo: RepoRef,
  path: string,
  limit?: number,
): Promise<NoteCommitDto[]> {
  const { commits } = await call<{ commits: NoteCommitDto[] }>(
    `/api/gh/history?${repoParams(repo)}&path=${encodeURIComponent(path)}` +
      (limit ? `&limit=${limit}` : ""),
  );
  return commits;
}

/** One file a commit touched, beside the note being looked at. */
export interface CommitFileDto {
  path: string;
  status: string;
  previousPath: string | null;
}

/**
 * What else one commit changed.
 *
 * Fetched separately from the commit list, and only for the commit somebody is
 * actually looking at: asking this of every commit in a history would be one
 * request per revision for a detail almost none of them will be asked about.
 */
export async function readCommitFiles(
  repo: RepoRef,
  path: string,
  sha: string,
): Promise<{ files: CommitFileDto[]; truncated: boolean }> {
  return await call<{ files: CommitFileDto[]; truncated: boolean }>(
    `/api/gh/history?${repoParams(repo)}&path=${encodeURIComponent(path)}` +
      `&sha=${encodeURIComponent(sha)}&files=1`,
  );
}

/** The content of a note as of one commit, for previewing an old revision. */
export async function readNoteAtCommit(
  repo: RepoRef,
  path: string,
  sha: string,
): Promise<string | null> {
  const { content } = await call<{ content: string | null }>(
    `/api/gh/history?${repoParams(repo)}&path=${encodeURIComponent(path)}&sha=${encodeURIComponent(sha)}`,
  );
  return content;
}

export async function listRepos(): Promise<RepoSummaryDto[]> {
  const { repos } = await call<{ repos: RepoSummaryDto[] }>("/api/gh/repos");
  return repos;
}

export function bootstrapWorkspace(options?: {
  name?: string;
  directory?: string;
  private?: boolean;
  /** Seed an inbox/notes/projects/archive layout rather than a lone welcome note. */
  scaffold?: boolean;
}): Promise<{ repo: RepoSummaryDto; workspace: RepoRef; seeded: boolean }> {
  return call("/api/gh/bootstrap", {
    method: "POST",
    body: JSON.stringify(options ?? {}),
  });
}

// ─── Branches and pull requests ─────────────────────────────────────────────

export interface BranchSummaryDto {
  name: string;
  sha: string;
  isDefault: boolean;
  protected: boolean;
}

export interface PullRequestDto {
  number: number;
  url: string;
  state: string;
  title: string;
  draft: boolean;
  head: string;
  base: string;
}

export async function listBranches(owner: string, repo: string): Promise<BranchSummaryDto[]> {
  const { branches } = await call<{ branches: BranchSummaryDto[] }>(
    `/api/gh/branches?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`,
  );
  return branches;
}

export async function createBranch(options: {
  owner: string;
  repo: string;
  name: string;
  from: string;
}): Promise<BranchSummaryDto> {
  const { branch } = await call<{ branch: BranchSummaryDto }>("/api/gh/branches", {
    method: "POST",
    body: JSON.stringify(options),
  });
  return branch;
}

/** Forks a repository so the user can write to a project they cannot push to. */
export async function forkRepo(
  owner: string,
  repo: string,
): Promise<{ repo: RepoSummaryDto; created: boolean }> {
  return call("/api/gh/fork", {
    method: "POST",
    body: JSON.stringify({ owner, repo }),
  });
}

export async function openPullRequest(options: {
  owner: string;
  repo: string;
  base: string;
  head: string;
  title: string;
  description?: string;
  draft?: boolean;
}): Promise<{ pull: PullRequestDto; crossFork: boolean }> {
  return call("/api/gh/pull", {
    method: "POST",
    body: JSON.stringify(options),
  });
}

/** What a captured page returns: its title, when it was read, and a snapshot. */
export interface CaptureResult {
  url: string;
  title: string;
  capturedAt: string;
  archiveUrl: string | null;
  archivedAt: string | null;
  /** True when the page itself could not be read and the title is the address. */
  titleFromUrl: boolean;
}

/**
 * Reads a web page so a note can cite it, and finds a copy that outlives it.
 *
 * The address is resolved and checked server-side before anything is fetched —
 * see `lib/safe-fetch` for why that cannot be done in the browser.
 */
export async function capturePage(
  url: string,
  /**
   * Which half of the work to wait for.
   *
   * `page` is the fast one — a title, in about a second. `archive` is the slow
   * one, because a page the Wayback Machine has never seen has to be archived
   * before it can be linked, and Save Page Now takes as long as it takes. The
   * capture dialog asks for both at once and shows each as it lands, rather
   * than making the reader watch a spinner for the length of the slower one.
   */
  want: "page" | "archive" | "both" = "both",
): Promise<CaptureResult> {
  return call("/api/capture", {
    method: "POST",
    body: JSON.stringify({ url, want }),
    // Longer than the server's own ceiling for the archive step, so a slow
    // snapshot is reported by the server rather than cut off here.
    timeoutMs: want === "page" ? 15_000 : 70_000,
  });
}

/**
 * One file out of a repository, at the revision a `[[repo:…]]` link named.
 *
 * Separate from the gateway class, which answers for workspaces: a repository
 * link can name a file in a repository nobody has connected as a workspace,
 * and in a directory the workspace does not file its notes in. `ref` is passed
 * as the branch parameter because to the contents API a commit and a branch
 * are the same kind of thing — which is what makes a pinned link show the file
 * as it was when it was described, rather than as it is now.
 */
export async function readRepoFile(options: {
  owner: string;
  repo: string;
  ref: string;
  path: string;
}): Promise<{ content: string; sha: string; size?: number } | null> {
  const params = new URLSearchParams({
    owner: options.owner,
    repo: options.repo,
    branch: options.ref,
    path: options.path,
  });

  const { file } = await call<{ file: { content: string; sha: string; size?: number } | null }>(
    `/api/gh/file?${params.toString()}`,
  );
  return file;
}

export interface LinkPreviewResult {
  url: string;
  title: string | null;
  description: string | null;
  host: string;
  /** A same-origin URL for the page's own picture of itself, or null. */
  image: string | null;
}

/**
 * What is on the other end of a link, for a hover card.
 *
 * Given a short timeout of its own: this fires on hover, and a card that
 * arrives after the pointer has moved on is worse than no card — it would pop
 * up over whatever the reader looked at next.
 */
export async function previewLink(url: string): Promise<LinkPreviewResult> {
  return call(`/api/link-preview?url=${encodeURIComponent(url)}`, { timeoutMs: 8_000 });
}
