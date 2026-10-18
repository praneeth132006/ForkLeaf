import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/mcp-grants", () => ({
  sealClient: vi.fn(async () => "sealed-client-id"),
}));

const { POST } = await import("./route");
const { resetRateLimits } = await import("@/lib/rate-limit");

const register = (body: unknown, ip = "203.0.113.7") =>
  POST(
    new NextRequest("https://www.forkleaf.in/api/mcp/oauth/register", {
      method: "POST",
      headers: { "content-type": "application/json", "x-real-ip": ip },
      body: JSON.stringify(body),
    }),
  );

describe("POST /api/mcp/oauth/register", () => {
  beforeEach(() => resetRateLimits());

  // The reported request, verbatim: it must not be issued a client.
  it("refuses a registration that would send codes to an unknown web site", async () => {
    const response = await register({
      client_name: "ProbeAlpha",
      redirect_uris: ["https://attacker-alpha.example.com/cb"],
    });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("invalid_client_metadata");
    expect(body.client_id).toBeUndefined();
  });

  it("registers a known assistant and an app on this computer", async () => {
    for (const uri of ["https://claude.ai/api/mcp/auth_callback", "http://localhost:33418/cb"]) {
      const response = await register({ client_name: "Claude", redirect_uris: [uri] });
      expect(response.status).toBe(201);
      expect((await response.json()).client_id).toBe("sealed-client-id");
    }
  });

  it("limits how many registrations one address can make", async () => {
    const good = { redirect_uris: ["http://localhost:1/cb"] };
    for (let i = 0; i < 20; i += 1) expect((await register(good)).status).toBe(201);
    expect((await register(good)).status).toBe(429);
    expect((await register(good, "198.51.100.1")).status).toBe(201);
  });
});
