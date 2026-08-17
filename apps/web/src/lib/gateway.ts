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

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
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

export function fetchSession(): Promise<SessionResponse> {
  return call<SessionResponse>("/api/session");
}

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

export async function listRepos(): Promise<RepoSummaryDto[]> {
  const { repos } = await call<{ repos: RepoSummaryDto[] }>("/api/gh/repos");
  return repos;
}

export function bootstrapWorkspace(options?: {
  name?: string;
  directory?: string;
  private?: boolean;
}): Promise<{ repo: RepoSummaryDto; workspace: RepoRef; seeded: boolean }> {
  return call("/api/gh/bootstrap", {
    method: "POST",
    body: JSON.stringify(options ?? {}),
  });
}
