import type { GitHubErrorCode, SerializedError } from "@forkleaf/types";

/**
 * A GitHub API failure with a stable, machine-readable code.
 *
 * The UI branches on `code` (show a re-login prompt, a conflict dialog, a
 * "rate limited, retrying in 40s" toast), so raw status numbers are mapped once
 * here rather than being re-interpreted at each call site.
 */
export class GitHubError extends Error {
  readonly code: GitHubErrorCode;
  readonly status: number;
  /** Unix seconds when a rate limit lifts, if GitHub told us. */
  readonly retryAt: number | undefined;

  constructor(code: GitHubErrorCode, message: string, status = 0, retryAt?: number) {
    super(message);
    this.name = "GitHubError";
    this.code = code;
    this.status = status;
    this.retryAt = retryAt;
  }

  /** Safe to send to the browser — carries no token or header material. */
  toJSON(): SerializedError {
    return {
      code: this.code,
      message: this.message,
      ...(this.retryAt !== undefined ? { retryAt: this.retryAt } : {}),
    };
  }

  /** True for failures that a retry might fix on its own. */
  get retryable(): boolean {
    return this.code === "network" || this.code === "rate-limited" || this.status >= 500;
  }
}

export function errorCodeForStatus(status: number, message: string): GitHubErrorCode {
  switch (status) {
    case 401:
      return "unauthorized";
    case 403:
      // GitHub returns 403 for both permission denials and rate limits.
      return /rate limit|abuse|secondary/i.test(message) ? "rate-limited" : "forbidden";
    case 404:
      return "not-found";
    case 409:
      return "conflict";
    case 422:
      return "validation";
    case 429:
      return "rate-limited";
    default:
      return status >= 500 ? "unknown" : "unknown";
  }
}

/** Narrows an unknown thrown value to a GitHubError, wrapping anything else. */
export function asGitHubError(err: unknown): GitHubError {
  if (err instanceof GitHubError) return err;
  const message = err instanceof Error ? err.message : String(err);
  return new GitHubError("network", message);
}
