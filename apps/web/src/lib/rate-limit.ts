import "server-only";
import type { NextRequest } from "next/server";
import { ApiError } from "@/lib/api-helpers";

/**
 * A small fixed-window rate limiter.
 *
 * Deliberately in-memory and deliberately modest in its claims. On a serverless
 * host each instance keeps its own counters, so this is a brake rather than a
 * guarantee: it stops one client hammering one instance — an accidental retry
 * loop, a script pointed at the sign-in route — and it does not stop a
 * distributed attack. The routes it guards are already behind a session and
 * behind GitHub's own limits; what it adds is a ceiling on how much of
 * somebody's GitHub quota a runaway client can spend.
 *
 * A durable limiter (Upstash Redis, Vercel KV's successor) is the upgrade path
 * if this deployment ever needs a real one; the call sites would not change.
 */

interface Window {
  count: number;
  /** Epoch ms when this window resets. */
  resetAt: number;
}

const windows = new Map<string, Window>();

/** Bound on the map, so a flood of distinct keys cannot grow it forever. */
const MAX_TRACKED_KEYS = 10_000;

export interface RateLimitOptions {
  /** Distinct bucket name, so different routes do not share a budget. */
  name: string;
  limit: number;
  windowMs: number;
}

/**
 * Best-effort client identity.
 *
 * The forwarded headers are spoofable, which is fine for this purpose: the
 * limiter's job is to slow down clients that are not trying to evade it.
 */
export function clientKey(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

/** Throws a 429 when the caller is over budget. */
export function enforceRateLimit(request: NextRequest, options: RateLimitOptions): void {
  const now = Date.now();
  const key = `${options.name}:${clientKey(request)}`;

  if (windows.size > MAX_TRACKED_KEYS) sweep(now);

  const existing = windows.get(key);

  if (!existing || existing.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + options.windowMs });
    return;
  }

  existing.count += 1;

  if (existing.count > options.limit) {
    const seconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    throw new ApiError(
      429,
      "rate-limited",
      `Too many requests. Try again in ${seconds} second${seconds === 1 ? "" : "s"}.`,
    );
  }
}

/** Drops expired windows. Called only when the map has grown large. */
function sweep(now: number): void {
  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key);
  }

  // Still oversized after sweeping — every window is live. Start over rather
  // than let the map grow without bound; the cost is a reset budget.
  if (windows.size > MAX_TRACKED_KEYS) windows.clear();
}

/** Test seam: forgets every window. */
export function resetRateLimits(): void {
  windows.clear();
}
