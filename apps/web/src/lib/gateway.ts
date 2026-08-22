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
export async function listNoteHistory(repo: RepoRef, path: string): Promise<NoteCommitDto[]> {
  const { commits } = await call<{ commits: NoteCommitDto[] }>(
    `/api/gh/history?${repoParams(repo)}&path=${encodeURIComponent(path)}`,
  );
  return commits;
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
