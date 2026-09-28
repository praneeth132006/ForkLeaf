import "server-only";
import type { NextRequest } from "next/server";
import { ApiError } from "@/lib/api-helpers";
import { resetMemoryStore, sharedStore } from "@/lib/shared-store";

/**
 * A small fixed-window rate limiter.
 *
 * Counted in the shared store (`lib/shared-store`) when one is configured, so
 * every server instance enforces the same budget; otherwise, and whenever the
 * store cannot be reached, in this instance's memory — a brake rather than a
 * guarantee, since serverless hosts run several instances. The routes it
 * guards are already behind a session and GitHub's own limits; what it adds
 * is a ceiling on how much of somebody's GitHub quota, or the server's
 * compute, a runaway or hostile client can spend.
 */

export interface RateLimitOptions {
  /** Distinct bucket name, so different routes do not share a budget. */
  name: string;
  limit: number;
  windowMs: number;
}

/**
 * Best-effort client identity.
 *
 * The client IP is read from the values the hosting proxy sets, not from the
 * ones the client can prepend. `x-real-ip` is written by the platform (Vercel)
 * to the true source address, so it is preferred. `x-forwarded-for` is a chain
 * the *left* of which the caller controls — `X-Forwarded-For: 1.2.3.4` on an
 * incoming request would hand every request a fresh bucket and defeat the
 * limiter entirely — so when it is the only signal, the *rightmost* entry is
 * used: the hop appended by the trusted proxy nearest this server, which the
 * caller cannot forge. A single-value header is unchanged by this.
 */
export function clientKey(request: NextRequest): string {
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const hops = forwarded
      .split(",")
      .map((hop) => hop.trim())
      .filter(Boolean);
    const trusted = hops[hops.length - 1];
    if (trusted) return trusted;
  }

  return "unknown";
}

/** Throws a 429 when the caller is over budget. */
export async function enforceRateLimit(
  request: NextRequest,
  options: RateLimitOptions,
): Promise<void> {
  const { count, resetAt } = await sharedStore().hit(
    `${options.name}:${clientKey(request)}`,
    options.windowMs,
  );
  if (count > options.limit) {
    const seconds = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
    throw new ApiError(
      429,
      "rate-limited",
      `Too many requests. Try again in ${seconds} second${seconds === 1 ? "" : "s"}.`,
    );
  }
}

/** For tests: forget every counter kept in memory. */
export function resetRateLimits(): void {
  resetMemoryStore();
}
