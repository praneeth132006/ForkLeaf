import { describe, expect, it } from "vitest";
import { destinationOf } from "./McpConsent";

describe("where consent sends access", () => {
  it("names a web destination by its host, which a look-alike name cannot change", () => {
    expect(destinationOf("https://evil.example/callback?x=1")).toBe("evil.example");
    expect(destinationOf("https://claude.ai/api/mcp/auth_callback")).toBe("claude.ai");
  });

  it("names an app on this computer, and a desktop app, by what can be checked", () => {
    expect(destinationOf("http://127.0.0.1:33418/callback")).toBe(
      "an app on this computer (port 33418)",
    );
    expect(destinationOf("cursor://anysphere.cursor-retrieval/oauth")).toBe(
      "the app that opens cursor: links",
    );
    expect(destinationOf("not a url")).toBe("an address ForkLeaf cannot read");
  });
});
