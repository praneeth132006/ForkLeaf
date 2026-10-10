import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { POST } = await import("./route");
const { resetMemoryStore, sharedStore } = await import("@/lib/shared-store");
const { activityKey } = await import("@/lib/live-activity");

const SECRET = "webhook-secret";

beforeEach(() => {
  vi.stubEnv("GITHUB_WEBHOOK_SECRET", SECRET);
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
  vi.stubEnv("KV_REST_API_URL", "");
  resetMemoryStore();
});

afterEach(() => vi.unstubAllEnvs());

const comment = {
  action: "created",
  repository: { full_name: "me/notes" },
  sender: { login: "ada" },
  discussion: { number: 12, title: "Rotate keys?", body: "" },
  comment: { body: "Monthly.", parent_id: null },
};

async function deliver(
  payload: unknown,
  options: { event?: string; delivery?: string; signature?: string | null } = {},
) {
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    "x-github-event": options.event ?? "discussion_comment",
    "x-github-delivery": options.delivery ?? crypto.randomUUID(),
  };
  const signature =
    options.signature === undefined
      ? `sha256=${createHmac("sha256", SECRET).update(body).digest("hex")}`
      : options.signature;
  if (signature) headers["x-hub-signature-256"] = signature;
  const response = await POST(
    new Request("http://localhost/api/gh/webhook", { method: "POST", body, headers }) as never,
  );
  return { status: response.status, body: await response.json() };
}

describe("POST /api/gh/webhook", () => {
  it("records a new comment in the repository's activity log", async () => {
    const { status, body } = await deliver(comment);

    expect(status).toBe(200);
    expect(body).toEqual({ ok: true, version: 1 });
    const log = await sharedStore().log(activityKey("me", "notes"), 10);
    expect(log.entries[0]).toMatchObject({
      v: 1,
      n: 12,
      kind: "comment",
      by: "ada",
      excerpt: "Monthly.",
    });
  });

  it("refuses a delivery that is not signed with the secret, and records nothing", async () => {
    expect((await deliver(comment, { signature: null })).status).toBe(401);
    expect((await deliver(comment, { signature: "sha256=" + "0".repeat(64) })).status).toBe(401);
    expect((await sharedStore().log(activityKey("me", "notes"), 10)).version).toBe(0);
  });

  it("records a redelivery once", async () => {
    await deliver(comment, { delivery: "abc" });
    const again = await deliver(comment, { delivery: "abc" });
    expect(again.body).toEqual({ duplicate: true });
    expect((await sharedStore().log(activityKey("me", "notes"), 10)).version).toBe(1);
  });

  it("answers GitHub's ping, and ignores other events", async () => {
    expect((await deliver({ zen: "hi" }, { event: "ping" })).body).toEqual({ ok: true });
    expect((await deliver({ ref: "main" }, { event: "push" })).body).toEqual({ ignored: true });
  });

  it("is off without a secret", async () => {
    vi.stubEnv("GITHUB_WEBHOOK_SECRET", "");
    expect((await deliver(comment)).status).toBe(503);
  });

  it("refuses a body that is not JSON", async () => {
    const body = "not json";
    const response = await POST(
      new Request("http://localhost/api/gh/webhook", {
        method: "POST",
        body,
        headers: {
          "x-github-event": "discussion",
          "x-hub-signature-256": `sha256=${createHmac("sha256", SECRET).update(body).digest("hex")}`,
        },
      }) as never,
    );
    expect(response.status).toBe(400);
  });
});
