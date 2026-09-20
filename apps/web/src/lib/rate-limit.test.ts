import { describe, it, expect } from "vitest";
import type { NextRequest } from "next/server";
import { clientKey } from "./rate-limit";

/** A minimal stand-in for the header lookup clientKey actually uses. */
function req(headers: Record<string, string>): NextRequest {
  return { headers: new Headers(headers) } as unknown as NextRequest;
}

describe("clientKey", () => {
  it("prefers the platform-set x-real-ip", () => {
    expect(clientKey(req({ "x-real-ip": "203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("uses x-real-ip even when x-forwarded-for is also present and spoofed", () => {
    // The left of x-forwarded-for is attacker-supplied; x-real-ip is not.
    const key = clientKey(
      req({ "x-real-ip": "203.0.113.9", "x-forwarded-for": "1.1.1.1, 203.0.113.9" }),
    );
    expect(key).toBe("203.0.113.9");
  });

  it("takes the last (trusted-proxy) hop of x-forwarded-for, not the spoofable first", () => {
    // Attacker prepends 1.1.1.1 hoping for a fresh bucket every request; the
    // real source appended by the proxy is the rightmost entry.
    const key = clientKey(req({ "x-forwarded-for": "1.1.1.1, 198.51.100.7" }));
    expect(key).toBe("198.51.100.7");
  });

  it("is stable for a single-value x-forwarded-for", () => {
    expect(clientKey(req({ "x-forwarded-for": "198.51.100.7" }))).toBe("198.51.100.7");
  });

  it("falls back to a constant when no address header is present", () => {
    expect(clientKey(req({}))).toBe("unknown");
  });
});
