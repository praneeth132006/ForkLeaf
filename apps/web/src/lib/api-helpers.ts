import "server-only";
import { NextResponse } from "next/server";
import { GitHubClient, GitHubError } from "@forkleaf/github-client";
import type { RepoRef } from "@forkleaf/types";
import { clearSessionCookie, getSession } from "@/lib/session";

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
    client: new GitHubClient({ token: session.token, userAgent: "forkleaf" }),
    login: session.user.login,
  };
}

/**
 * GitHub's own rules for an owner or repository name.
 *
 * Enforced on every route rather than trusted, because these values are
 * interpolated into the upstream API path: a name carrying `/` or `..` would
 * address a different GitHub endpoint than the one the route means to call.
 */
const NAME = /^[\w.-]{1,100}$/;

/**
 * A git ref. Deliberately narrower than git's own rules — no `..`, no leading
 * or trailing slash, no control characters — since the value ends up in a URL.
 */
const REF = /^(?!.*\.\.)[\w][\w./-]{0,254}$/;

/** Validates one path segment destined for the GitHub API URL. */
export function assertName(value: string, label: string): string {
  // `.` and `..` satisfy the character class but are path segments, not names.
  if (!NAME.test(value) || /^\.+$/.test(value)) {
    throw new ApiError(400, "validation", `Invalid ${label}.`);
  }
  return value;
}

export function assertRef(value: string, label = "branch"): string {
  if (!REF.test(value) || value.endsWith("/") || value.endsWith(".lock")) {
    throw new ApiError(400, "validation", `Invalid ${label} name.`);
  }
  return value;
}

/**
 * Reads an `owner`/`repo` pair from a parsed request body.
 *
 * The routes that take a repository but not a full workspace reference — fork,
 * pull request, branches — used to pass these straight through to the GitHub
 * client, which is the one place where an unvalidated name changes which URL
 * gets called.
 */
export function readOwnerRepo(source: { owner?: unknown; repo?: unknown }): {
  owner: string;
  repo: string;
} {
  const owner = typeof source.owner === "string" ? source.owner.trim() : "";
  const repo = typeof source.repo === "string" ? source.repo.trim() : "";

  if (!owner || !repo) {
    throw new ApiError(400, "validation", "owner and repo are required");
  }

  return {
    owner: assertName(owner, "repository owner"),
    repo: assertName(repo, "repository name"),
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

  return {
    owner: assertName(owner, "repository owner"),
    repo: assertName(repo, "repository name"),
    branch: assertRef(branch),
    directory: normalize(directory),
  };
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

/**
 * Turns GitHub's rate-limit refusal into the sentence that helps.
 *
 * "API rate limit exceeded" is GitHub telling the server something. What the
 * reader needs to know is that signing in fixes it: an authenticated call gets
 * 5,000 an hour, where an anonymous one shares 60 with everybody else on the
 * same address. That only applies to a route that answers anonymous callers at
 * all — which is why it takes `signedIn` rather than guessing.
 */
export async function withRateLimitAdvice<T>(run: () => Promise<T>, signedIn: boolean): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof GitHubError && error.code === "rate-limited" && !signedIn) {
      throw new ApiError(
        429,
        "rate-limited",
        "GitHub's rate limit for signed-out requests is used up. Sign in with GitHub to read this pull request — signing in raises the limit from 60 requests an hour to 5,000.",
      );
    }
    throw error;
  }
}

/**
 * Throws away a session GitHub has stopped honouring.
 *
 * A session cookie and a working GitHub token are two different things, and
 * only the first of them is ours. The cookie lasts thirty days; the token
 * inside it can die at any moment — the authorisation is revoked, the same
 * OAuth app is signed into again somewhere else with a different access level,
 * GitHub retires the token. Nothing tells us when that happens. The first we
 * hear of it is a 401 on a call we expected to work.
 *
 * Until this existed, that 401 was all that happened: the cookie stayed, so
 * every page still showed you signed in, every note still said it was syncing,
 * and every image in every note quietly failed to load with no explanation
 * anywhere — because the proxy that fetches them needs the same dead token.
 * The app looked signed in and behaved as though it were signed out.
 *
 * So a token GitHub refuses ends the session on the spot. The next request
 * says "local mode" and the reader gets one banner and one button, instead of
 * a screen full of broken pictures.
 */
export async function forgetDeadSession(error: unknown): Promise<boolean> {
  if (!(error instanceof GitHubError) || error.code !== "unauthorized") return false;

  console.warn("[forkleaf] GitHub rejected the session token; signing out.");
  await clearSessionCookie();
  return true;
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
      console.error("[forkleaf] GitHub API error:", error.code, error.message);

      // A refused token is not this route's problem to report and the next
      // route's problem to hit again — it ends the session for all of them.
      if (await forgetDeadSession(error)) {
        return NextResponse.json(
          {
            error: {
              code: "unauthorized",
              message: "Your GitHub sign-in has expired. Sign in again to reconnect.",
            },
          },
          { status: 401, headers: { "Cache-Control": "no-store" } },
        );
      }

      return NextResponse.json(
        { error: error.toJSON() },
        { status: statusFor(error), headers: { "Cache-Control": "no-store" } },
      );
    }

    console.error("[forkleaf] Unhandled API error:", error);
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
