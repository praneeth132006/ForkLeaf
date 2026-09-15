import { describe, expect, it } from "vitest";
import { policy } from "./proxy";

/** One directive's sources, split out of the header. */
function directive(csp: string, name: string): string[] {
  const found = csp
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name} `));
  return found ? found.split(/\s+/).slice(1) : [];
}

describe("the content security policy and PostHog", () => {
  it("lets events reach PostHog, which it used to block on every page", () => {
    const csp = policy("abc", false, undefined);
    expect(directive(csp, "connect-src")).toContain("https://*.i.posthog.com");
  });

  it("lets prerendered pages load PostHog's config, where there is no strict-dynamic", () => {
    expect(directive(policy(null, false, undefined), "script-src")).toContain(
      "https://*.i.posthog.com",
    );
  });

  it("allows a configured host, and nothing that is not https", () => {
    expect(
      directive(policy("abc", false, "https://eu.posthog.example.com/"), "connect-src"),
    ).toContain("https://eu.posthog.example.com");
    const insecure = directive(policy("abc", false, "http://tracker.example.com"), "connect-src");
    expect(insecure.join(" ")).not.toContain("tracker.example.com");
    expect(directive(policy("abc", false, "not a url"), "connect-src")).not.toContain("not");
  });

  it("keeps a nonced page strict", () => {
    const script = directive(policy("abc", false, undefined), "script-src");
    expect(script).toContain("'strict-dynamic'");
    expect(script).not.toContain("'unsafe-inline'");
  });
});
