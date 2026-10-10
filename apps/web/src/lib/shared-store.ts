import "server-only";

/**
 * Counters and one-time markers that every server instance agrees on.
 *
 * Serverless functions run as many instances at once, each with its own
 * memory, so a limit kept in memory is really "per instance" — five instances
 * let a client through five times as often — and a "this code has been used"
 * marker in memory is forgotten by the next instance. When a Redis-compatible
 * REST store is configured (Upstash, the store Vercel's marketplace provides),
 * both live there instead, and hold across instances.
 *
 * Configured by UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN, or the
 * KV_REST_API_URL / KV_REST_API_TOKEN names the marketplace integration sets.
 * Without them, or if the store cannot be reached, memory is used: a limit
 * that is only per instance is better than an app that refuses every request
 * because a cache is down. The store is spoken to over its REST API with
 * fetch, so there is no client library to trust.
 */

export interface SharedStore {
  /** Adds one to a fixed-window counter, returning the count and when the window ends. */
  hit(key: string, windowMs: number): Promise<{ count: number; resetAt: number }>;
  /** Marks a key as used for `ttlMs`. True the first time, false if it was already marked. */
  once(key: string, ttlMs: number): Promise<boolean>;
  /**
   * Adds an entry to a short log, keeping the newest `max`, and returns the
   * log's new version — one more than before, so a reader that knows the
   * version it last saw knows how many entries are new. The entry is stored
   * as `{ v, ...value }`.
   */
  append(key: string, value: Record<string, unknown>, max: number, ttlMs: number): Promise<number>;
  /** The log's version and its newest `count` entries, newest first. */
  log(key: string, count: number): Promise<{ version: number; entries: Record<string, unknown>[] }>;
}

// ── Memory ────────────────────────────────────────────────────────────────

const MAX_KEYS = 10_000;

export function memoryStore(now: () => number = Date.now): SharedStore & { clear(): void } {
  const counters = new Map<string, { count: number; resetAt: number }>();
  const marks = new Map<string, number>();
  const logs = new Map<
    string,
    { version: number; entries: Record<string, unknown>[]; until: number }
  >();

  const sweep = (time: number) => {
    for (const [key, window] of counters) if (window.resetAt <= time) counters.delete(key);
    for (const [key, until] of marks) if (until <= time) marks.delete(key);
    // Still oversized: every entry is live. Starting over bounds the memory;
    // the cost is a reset budget, never a refused request.
    if (counters.size > MAX_KEYS) counters.clear();
    if (marks.size > MAX_KEYS) marks.clear();
    for (const [key, log] of logs) if (log.until <= time) logs.delete(key);
    if (logs.size > MAX_KEYS) logs.clear();
  };

  return {
    async hit(key, windowMs) {
      const time = now();
      if (counters.size > MAX_KEYS) sweep(time);
      const existing = counters.get(key);
      if (!existing || existing.resetAt <= time) {
        const fresh = { count: 1, resetAt: time + windowMs };
        counters.set(key, fresh);
        return { ...fresh };
      }
      existing.count += 1;
      return { ...existing };
    },
    async once(key, ttlMs) {
      const time = now();
      if (marks.size > MAX_KEYS) sweep(time);
      const until = marks.get(key);
      if (until !== undefined && until > time) return false;
      marks.set(key, time + ttlMs);
      return true;
    },
    async append(key, value, max, ttlMs) {
      const time = now();
      if (logs.size > MAX_KEYS) sweep(time);
      const existing = logs.get(key);
      const live = existing && existing.until > time ? existing : { version: 0, entries: [] };
      const version = live.version + 1;
      logs.set(key, {
        version,
        entries: [{ v: version, ...value }, ...live.entries].slice(0, max),
        until: time + ttlMs,
      });
      return version;
    },
    async log(key, count) {
      const existing = logs.get(key);
      if (!existing || existing.until <= now()) return { version: 0, entries: [] };
      return { version: existing.version, entries: existing.entries.slice(0, count) };
    },
    clear() {
      counters.clear();
      marks.clear();
      logs.clear();
    },
  };
}

// ── Redis over REST ───────────────────────────────────────────────────────

export interface RestConfig {
  url: string;
  token: string;
}

export function restConfig(
  env: Record<string, string | undefined> = process.env,
): RestConfig | null {
  const url = env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  try {
    // Only https: the token travels with every request.
    if (new URL(url).protocol !== "https:") return null;
  } catch {
    return null;
  }
  return { url: url.replace(/\/+$/, ""), token };
}

/** Keys are namespaced and hashed-free but bounded, so a request cannot choose an arbitrary Redis key. */
const safeKey = (key: string) => `forkleaf:${key.replace(/[^\w:.@-]/g, "_").slice(0, 200)}`;

export function restStore(
  config: RestConfig,
  fetchImpl: typeof fetch = fetch,
  now: () => number = Date.now,
): SharedStore {
  const pipeline = async (commands: (string | number)[][]): Promise<unknown[]> => {
    const response = await fetchImpl(`${config.url}/pipeline`, {
      method: "POST",
      headers: { authorization: `Bearer ${config.token}`, "content-type": "application/json" },
      body: JSON.stringify(commands),
      signal: AbortSignal.timeout(1500),
    });
    if (!response.ok) throw new Error(`Shared store answered ${response.status}.`);
    const results = (await response.json()) as { result?: unknown; error?: string }[];
    return results.map((entry) => {
      if (entry.error) throw new Error(entry.error);
      return entry.result;
    });
  };

  return {
    async hit(key, windowMs) {
      const time = now();
      const bucket = Math.floor(time / windowMs);
      const name = safeKey(`rl:${key}:${bucket}`);
      const [count] = await pipeline([
        ["INCR", name],
        ["PEXPIRE", name, windowMs],
      ]);
      return { count: Number(count), resetAt: (bucket + 1) * windowMs };
    },
    async once(key, ttlMs) {
      const [result] = await pipeline([["SET", safeKey(`once:${key}`), "1", "NX", "PX", ttlMs]]);
      return result === "OK";
    },
    async append(key, value, max, ttlMs) {
      const counter = safeKey(`log:${key}:v`);
      const list = safeKey(`log:${key}`);
      // The version first, so the entry can carry it: two webhooks arriving
      // together get two versions and two entries, in whichever order Redis
      // took them.
      const [version] = await pipeline([
        ["INCR", counter],
        ["PEXPIRE", counter, ttlMs],
      ]);
      const v = Number(version);
      await pipeline([
        ["LPUSH", list, JSON.stringify({ v, ...value })],
        ["LTRIM", list, 0, max - 1],
        ["PEXPIRE", list, ttlMs],
      ]);
      return v;
    },
    async log(key, count) {
      const [version, entries] = await pipeline([
        ["GET", safeKey(`log:${key}:v`)],
        ["LRANGE", safeKey(`log:${key}`), 0, count - 1],
      ]);
      const parsed = (Array.isArray(entries) ? entries : []).flatMap((entry) => {
        try {
          return [JSON.parse(String(entry)) as Record<string, unknown>];
        } catch {
          return [];
        }
      });
      return { version: Number(version ?? 0) || 0, entries: parsed };
    },
  };
}

// ── The store in use ──────────────────────────────────────────────────────

const memory = memoryStore();
let warned = false;

/** The shared store when configured, falling back to memory for any call it cannot answer. */
export function sharedStore(): SharedStore {
  const config = restConfig();
  if (!config) return memory;
  const remote = restStore(config);
  const fallback = <T>(work: () => Promise<T>, local: () => Promise<T>) =>
    work().catch((error: unknown) => {
      if (!warned) {
        warned = true;
        console.warn(
          "[forkleaf] Shared store unreachable; limits fall back to this instance.",
          error instanceof Error ? error.message : error,
        );
      }
      return local();
    });
  return {
    hit: (key, windowMs) =>
      fallback(
        () => remote.hit(key, windowMs),
        () => memory.hit(key, windowMs),
      ),
    once: (key, ttlMs) =>
      fallback(
        () => remote.once(key, ttlMs),
        () => memory.once(key, ttlMs),
      ),
    append: (key, value, max, ttlMs) =>
      fallback(
        () => remote.append(key, value, max, ttlMs),
        () => memory.append(key, value, max, ttlMs),
      ),
    log: (key, count) =>
      fallback(
        () => remote.log(key, count),
        () => memory.log(key, count),
      ),
  };
}

/** For tests: forget every in-memory counter and mark. */
export function resetMemoryStore(): void {
  memory.clear();
}
