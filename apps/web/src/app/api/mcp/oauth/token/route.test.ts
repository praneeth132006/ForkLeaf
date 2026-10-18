import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

// RFC 7636 appendix B.
const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

vi.mock("@/lib/mcp-grants", () => ({
  GrantError: class GrantError extends Error {},
  openCode: vi.fn(async (value: string) =>
    value?.startsWith("code")
      ? {
          clientId: "client-a",
          redirectUri: "http://localhost:5000/cb",
          codeChallenge: CHALLENGE,
          grant: { token: "gh" },
          target: {},
        }
      : null,
  ),
  issueTokens: vi.fn(async () => ({ access_token: "a", token_type: "Bearer" })),
  refreshTokens: vi.fn(),
}));

const { POST } = await import("./route");
const { resetRateLimits } = await import("@/lib/rate-limit");

const exchange = (fields: Record<string, string>) =>
  POST(
    new NextRequest("https://www.forkleaf.in/api/mcp/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", ...fields }).toString(),
    }),
  );

describe("POST /api/mcp/oauth/token", () => {
  beforeEach(() => resetRateLimits());

  it("will not redeem a code without the client it was issued to", async () => {
    expect((await exchange({ code: "code-1", code_verifier: VERIFIER })).status).toBe(400);
    expect(
      (await exchange({ code: "code-2", code_verifier: VERIFIER, client_id: "client-b" })).status,
    ).toBe(400);
  });

  it("will not redeem a code without the PKCE verifier", async () => {
    const response = await exchange({
      code: "code-3",
      client_id: "client-a",
      code_verifier: `${VERIFIER.slice(0, -1)}A`,
    });
    expect(response.status).toBe(400);
  });

  it("redeems a code once, for its own client", async () => {
    const fields = { code: "code-4", client_id: "client-a", code_verifier: VERIFIER };
    expect((await exchange(fields)).status).toBe(200);
    const again = await exchange(fields);
    expect(again.status).toBe(400);
    expect((await again.json()).error_description).toContain("already been used");
  });
});
