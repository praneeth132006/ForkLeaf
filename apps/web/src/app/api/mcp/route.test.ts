import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/mcp-grants", () => ({
  openAccess: vi.fn(async (token: string) =>
    token === "good"
      ? {
          token: "gh",
          target: {
            owner: "me",
            repo: "notes",
            branch: "main",
            directory: "",
            readOnly: true,
            login: "me",
          },
        }
      : null,
  ),
}));

const { POST } = await import("./route");

const call = (body: unknown, token?: string) =>
  POST(
    new NextRequest("http://localhost:3000/api/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    }),
  );

describe("POST /api/mcp", () => {
  it("refuses a request with no token, or one it did not seal", async () => {
    expect((await call({ jsonrpc: "2.0", id: 1, method: "ping" })).status).toBe(401);
    expect((await call({ jsonrpc: "2.0", id: 1, method: "ping" }, "forged")).status).toBe(401);
  });

  it("refuses an empty batch, and a batch too large to be one assistant's", async () => {
    expect((await call([], "good")).status).toBe(400);
    const many = Array.from({ length: 21 }, (_, id) => ({ jsonrpc: "2.0", id, method: "ping" }));
    const response = await call(many, "good");
    expect(response.status).toBe(400);
    expect(JSON.stringify(await response.json())).toContain("between 1 and 20");
  });

  it("answers a small batch", async () => {
    const few = [1, 2].map((id) => ({ jsonrpc: "2.0", id, method: "ping" }));
    const response = await call(few, "good");
    expect(response.status).toBe(200);
    expect(await response.json()).toHaveLength(2);
  });
});
