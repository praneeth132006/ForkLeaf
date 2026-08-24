import { GitHubError, errorCodeForStatus } from "./errors";

export interface RateLimit {
  limit: number;
  remaining: number;
  /** Unix seconds when the window resets. */
  reset: number;
}

export interface HttpOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  /** Send `If-None-Match` so unchanged responses cost no rate-limit quota. */
  etag?: string;
  /** Override the `Accept` header (used for raw blob reads). */
  accept?: string;
  signal?: AbortSignal;
}

export interface HttpResponse<T> {
  /** `null` when the server replied 304 Not Modified. */
  data: T | null;
  etag: string | null;
  status: number;
  /** Parsed `Link: rel="next"` URL, for paginated endpoints. */
  nextUrl: string | null;
}

export interface TransportConfig {
  token: string;
  baseUrl?: string;
  /** Injectable for tests; defaults to the global fetch. */
  fetch?: typeof globalThis.fetch;
  /** Retries for network blips and 5xx. Rate limits are handled separately. */
  maxRetries?: number;
  userAgent?: string;
}

const DEFAULT_BASE_URL = "https://api.github.com";

/**
 * Minimal GitHub REST transport.
 *
 * Written by hand rather than pulled from Octokit so that the exact behaviour we
 * depend on — conditional requests, secondary-rate-limit backoff, and Link
 * pagination — is explicit and unit-testable with an injected fetch.
 */
export class Transport {
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly maxRetries: number;
  private readonly userAgent: string;

  /** Rate-limit headers from the most recent response, for the status bar. */
  rateLimit: RateLimit | null = null;

  constructor(config: TransportConfig) {
    this.token = config.token;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.fetchImpl = config.fetch ?? globalThis.fetch.bind(globalThis);
    this.maxRetries = config.maxRetries ?? 3;
    this.userAgent = config.userAgent ?? "forkleaf";
  }

  async request<T>(path: string, options: HttpOptions = {}): Promise<HttpResponse<T>> {
    const url = this.resolve(path);
    let lastError: GitHubError | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        return await this.attempt<T>(url, options);
      } catch (err) {
        const error = err instanceof GitHubError ? err : new GitHubError("network", String(err));
        lastError = error;

        // Client errors other than rate limits will never succeed on retry.
        if (!error.retryable || attempt === this.maxRetries) throw error;

        await sleep(this.backoffMs(error, attempt), options.signal);
      }
    }

    throw lastError ?? new GitHubError("unknown", "Request failed");
  }

  /**
   * Turns a request path into an absolute URL, refusing anything that would
   * leave the API host or address a different endpoint than it appears to.
   *
   * Repository owners and names are interpolated into these paths by the
   * callers above. Those values originate with the user, and while the routes
   * that accept them validate their shape, this is the single choke point where
   * every path — including the `Link: rel="next"` URLs GitHub sends back — can
   * be checked. A name smuggling `..` would otherwise call a different GitHub
   * endpoint with the caller's token attached.
   */
  private resolve(path: string): string {
    const base = new URL(this.baseUrl);
    const url = path.startsWith("http") ? new URL(path) : new URL(path, base);

    // Covers the pagination URLs from the Link header as much as our own paths.
    if (url.origin !== base.origin) {
      throw new GitHubError("validation", `Refusing to call ${url.origin}`);
    }

    // Checked before `new URL` silently collapses them, and on the decoded form
    // so that a percent-encoded `%2e%2e` does not slip past.
    const segments = path.split(/[?#]/)[0]!.split("/");
    for (const segment of segments) {
      const decoded = safeDecode(segment);
      if (decoded === ".." || decoded === ".") {
        throw new GitHubError("validation", "Refusing a request path that escapes its endpoint");
      }
    }

    return url.toString();
  }

  private async attempt<T>(url: string, options: HttpOptions): Promise<HttpResponse<T>> {
    const headers: Record<string, string> = {
      Accept: options.accept ?? "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": this.userAgent,
    };

    // Anonymous when there is no token, rather than sending `Bearer ` and
    // being refused. GitHub serves public repositories unauthenticated at a
    // lower rate limit, which is what lets a reviewer follow a link from a
    // pull request without signing in first.
    if (this.token !== "") headers["Authorization"] = `Bearer ${this.token}`;

    if (options.etag) headers["If-None-Match"] = options.etag;
    if (options.body !== undefined) headers["Content-Type"] = "application/json";

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: options.method ?? "GET",
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        ...(options.signal ? { signal: options.signal } : {}),
      });
    } catch (err) {
      // fetch only rejects on genuine transport failures.
      throw new GitHubError("network", err instanceof Error ? err.message : String(err));
    }

    this.captureRateLimit(response);

    // Conditional request hit: our cached copy is still current.
    if (response.status === 304) {
      return { data: null, etag: options.etag ?? null, status: 304, nextUrl: null };
    }

    if (!response.ok) {
      throw await this.toError(response);
    }

    // 204 No Content — DELETE and some PUTs.
    const data = response.status === 204 ? (null as T) : ((await response.json()) as T);

    return {
      data,
      etag: response.headers.get("etag"),
      status: response.status,
      nextUrl: parseNextLink(response.headers.get("link")),
    };
  }

  private captureRateLimit(response: Response): void {
    const limit = response.headers.get("x-ratelimit-limit");
    const remaining = response.headers.get("x-ratelimit-remaining");
    const reset = response.headers.get("x-ratelimit-reset");
    if (limit === null || remaining === null || reset === null) return;

    this.rateLimit = {
      limit: Number(limit),
      remaining: Number(remaining),
      reset: Number(reset),
    };
  }

  private async toError(response: Response): Promise<GitHubError> {
    let message = `${response.status} ${response.statusText}`;
    try {
      const body = (await response.json()) as { message?: string; errors?: unknown[] };
      if (body.message) message = body.message;

      // 422s carry a nested errors array that explains what was actually
      // wrong. Its useful part is the `message` on each entry — GitHub writes
      // those as sentences ("No commits between main and my-branch"). The rest
      // is machine detail.
      //
      // This used to be `JSON.stringify(body.errors)`, which put a wall of raw
      // JSON in front of the user: the dialog showed them
      // `[{"resource":"PullRequest","code":"custom","message":"..."}]` when
      // GitHub had, in fact, told us exactly what was wrong in English.
      // Stringifying is kept only for the entries that carry no message, since
      // an unreadable detail still beats no detail at all.
      const detail = describeErrors(body.errors);
      if (detail) message += `: ${detail}`;
    } catch {
      // Non-JSON error body; the status line is all we have.
    }

    const code = errorCodeForStatus(response.status, message);

    // `retry-after` (secondary limits) takes precedence over the reset header.
    const retryAfter = response.headers.get("retry-after");
    const reset = response.headers.get("x-ratelimit-reset");
    const retryAt = retryAfter
      ? Math.floor(Date.now() / 1000) + Number(retryAfter)
      : code === "rate-limited" && reset
        ? Number(reset)
        : undefined;

    return new GitHubError(code, message, response.status, retryAt);
  }

  /** Exponential backoff, except for rate limits where GitHub dictates the wait. */
  private backoffMs(error: GitHubError, attempt: number): number {
    if (error.code === "rate-limited" && error.retryAt) {
      const waitMs = error.retryAt * 1000 - Date.now();
      // Cap the wait: a primary limit can be an hour away, and blocking that
      // long is worse than surfacing the error and letting the queue retry.
      return Math.min(Math.max(waitMs, 0), 60_000);
    }
    return Math.min(1000 * 2 ** attempt, 8000) + Math.random() * 250;
  }

  /** Follows `Link: rel="next"` until every page is collected. */
  async paginate<T>(path: string, options: HttpOptions = {}): Promise<T[]> {
    const items: T[] = [];
    let url: string | null = path;
    // Hard stop so a malformed Link header can never loop forever.
    let pages = 0;

    while (url && pages < 50) {
      const response: HttpResponse<T[]> = await this.request<T[]>(url, options);
      if (response.data) items.push(...response.data);
      url = response.nextUrl;
      pages += 1;
      // ETags apply to the first page only.
      options = { ...options, etag: undefined };
    }

    return items;
  }
}

function parseNextLink(header: string | null): string | null {
  if (!header) return null;
  const match = /<([^>]+)>;\s*rel="next"/.exec(header);
  return match?.[1] ?? null;
}

/** `decodeURIComponent` throws on malformed input; a bad escape is not a `..`. */
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new GitHubError("network", "Aborted"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new GitHubError("network", "Aborted"));
      },
      { once: true },
    );
  });
}

/**
 * The readable part of a GitHub `errors` array.
 *
 * Entries carrying a `message` contribute it — GitHub writes those as English
 * sentences, and they are almost always the actual explanation. Entries that
 * carry none are stringified rather than dropped, so a shape this does not
 * recognise still reaches the logs.
 *
 * Exported for its tests: this runs on every 4xx the app can produce, and the
 * cost of getting it wrong is an error message nobody can act on.
 */
export function describeErrors(errors: unknown[] | undefined): string {
  if (!errors?.length) return "";

  const parts = errors.map((entry) => {
    if (entry && typeof entry === "object" && "message" in entry) {
      const message = (entry as { message?: unknown }).message;
      if (typeof message === "string" && message.trim()) return message.trim();
    }

    // GitHub's other common shape: `{resource, field, code}` with no prose.
    // Rendered as something a person can at least read aloud.
    if (entry && typeof entry === "object" && "code" in entry) {
      const { resource, field, code } = entry as Record<string, unknown>;
      const where = [resource, field].filter((part) => typeof part === "string").join(".");
      return where ? `${where} ${String(code)}` : String(code);
    }

    return JSON.stringify(entry);
  });

  return [...new Set(parts.filter(Boolean))].join("; ");
}
