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

  it("lets the assistant reach a model, and nothing else new", () => {
    const sources = directive(policy("abc", false, undefined), "connect-src");
    // Claude, OpenAI and OpenRouter by name; Gemini is under the googleapis
    // wildcard Firebase already needed.
    expect(sources).toContain("https://api.anthropic.com");
    expect(sources).toContain("https://api.openai.com");
    expect(sources).toContain("https://openrouter.ai");
    expect(sources).toContain("https://*.googleapis.com");
    // A model on the reader's own machine, on whichever port it chose.
    expect(sources).toContain("http://localhost:*");
    expect(sources).toContain("http://127.0.0.1:*");
    // The widening is to named hosts only: nothing here allows any https host.
    expect(sources).not.toContain("https:");
    expect(sources).not.toContain("*");
  });

  it("keeps a nonced page strict", () => {
    const script = directive(policy("abc", false, undefined), "script-src");
    expect(script).toContain("'strict-dynamic'");
    expect(script).not.toContain("'unsafe-inline'");
  });
});
