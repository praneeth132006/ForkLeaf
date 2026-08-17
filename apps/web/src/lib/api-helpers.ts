import "server-only";
import { NextResponse } from "next/server";
import { GitHubClient, GitHubError } from "@mdnotion/github-client";
import type { RepoRef } from "@mdnotion/types";
import { getSession } from "@/lib/session";

/**
 * Shared plumbing for the GitHub proxy routes.
 *
 * Every route follows the same shape: resolve the session, build a client with
 * the server-held token, run the operation, map failures to a stable error
 * body. Doing it once here keeps each route to its actual logic and makes it
 * impossible to forget the auth check.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Builds an authenticated client, or throws a 401. */
export async function requireClient(): Promise<{ client: GitHubClient; login: string }> {
  const session = await getSession();
  if (!session) {
    throw new ApiError(401, "unauthorized", "Sign in with GitHub to continue.");
  }

  return {
    client: new GitHubClient({ token: session.token, userAgent: "mdnotion" }),
    login: session.user.login,
  };
}

/**
 * Reads a workspace's repo reference from the request.
 *
 * These come from the client, which is fine: the session token is what limits
 * what can actually be reached. Validation here is about rejecting malformed
 * input early, not about authorisation.
 */
export function readRepoRef(params: URLSearchParams): RepoRef {
  const owner = params.get("owner")?.trim();
  const repo = params.get("repo")?.trim();
  const branch = params.get("branch")?.trim();
  const directory = params.get("dir")?.trim() ?? "";

  if (!owner || !repo || !branch) {
    throw new ApiError(400, "validation", "owner, repo and branch are required.");
  }

  // GitHub's own rules for these segments. Rejecting here gives a clear error
  // instead of a confusing 404 from the API.
  if (!/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo)) {
    throw new ApiError(400, "validation", "Invalid repository owner or name.");
  }

  return { owner, repo, branch, directory: normalize(directory) };
}

export function readRepoRefFromBody(body: Record<string, unknown>): RepoRef {
  const params = new URLSearchParams();
  for (const key of ["owner", "repo", "branch", "dir"]) {
    const value = body[key];
    if (typeof value === "string") params.set(key, value);
  }
  return readRepoRef(params);
}

/** Strips leading/trailing slashes and refuses to escape the repo root. */
export function normalize(path: string): string {
  return path
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment !== "" && segment !== "." && segment !== "..")
    .join("/");
}

/** Runs a handler, converting known failures into a consistent JSON error. */
export async function handle<T>(fn: () => Promise<T>): Promise<NextResponse> {
  try {
    const data = await fn();
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status, headers: { "Cache-Control": "no-store" } },
      );
    }

    if (error instanceof GitHubError) {
      // Log server-side with full detail; return only the safe projection.
      console.error("[mdnotion] GitHub API error:", error.code, error.message);
      return NextResponse.json(
        { error: error.toJSON() },
        { status: statusFor(error), headers: { "Cache-Control": "no-store" } },
      );
    }

    console.error("[mdnotion] Unhandled API error:", error);
    return NextResponse.json(
      { error: { code: "unknown", message: "Something went wrong. Please try again." } },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

function statusFor(error: GitHubError): number {
  switch (error.code) {
    case "unauthorized":
      return 401;
    case "forbidden":
      return 403;
    case "not-found":
      return 404;
    case "conflict":
      return 409;
    case "validation":
      return 422;
    case "rate-limited":
      return 429;
    default:
      return 502;
  }
}
