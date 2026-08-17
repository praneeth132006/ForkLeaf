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
    const url = path.startsWith("http") ? path : `${this.baseUrl}${path}`;
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

  private async attempt<T>(url: string, options: HttpOptions): Promise<HttpResponse<T>> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      Accept: options.accept ?? "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": this.userAgent,
    };

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
      // 422s carry a nested errors array that explains what was actually wrong.
      if (body.errors?.length) message += `: ${JSON.stringify(body.errors)}`;
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
