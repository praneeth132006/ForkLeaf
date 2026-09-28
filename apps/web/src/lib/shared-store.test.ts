import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const { memoryStore, restConfig, restStore, sharedStore, resetMemoryStore } =
  await import("./shared-store");
const { enforceRateLimit } = await import("./rate-limit");

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  resetMemoryStore();
});

describe("memoryStore", () => {
  it("counts within a window and starts again after it", async () => {
    let time = 1_000;
    const store = memoryStore(() => time);
    expect((await store.hit("a", 100)).count).toBe(1);
    expect((await store.hit("a", 100)).count).toBe(2);
    time = 1_101;
    expect(await store.hit("a", 100)).toEqual({ count: 1, resetAt: 1_201 });
  });

  it("marks a key once, until it expires", async () => {
    let time = 0;
    const store = memoryStore(() => time);
    expect(await store.once("code", 50)).toBe(true);
    expect(await store.once("code", 50)).toBe(false);
    time = 51;
    expect(await store.once("code", 50)).toBe(true);
  });
});

describe("restConfig", () => {
  it("reads either naming, and only over https", () => {
    expect(
      restConfig({
        UPSTASH_REDIS_REST_URL: "https://x.upstash.io/",
        UPSTASH_REDIS_REST_TOKEN: "t",
      }),
    ).toEqual({
      url: "https://x.upstash.io",
      token: "t",
    });
    expect(
      restConfig({ KV_REST_API_URL: "https://kv.example", KV_REST_API_TOKEN: "k" })?.token,
    ).toBe("k");
    expect(
      restConfig({ UPSTASH_REDIS_REST_URL: "http://x", UPSTASH_REDIS_REST_TOKEN: "t" }),
    ).toBeNull();
    expect(restConfig({})).toBeNull();
  });
});

describe("restStore", () => {
  const reply = (results: unknown[]) =>
    new Response(JSON.stringify(results.map((result) => ({ result }))), { status: 200 });

  it("counts with INCR and an expiry, in a namespaced key per window", async () => {
    const fetchMock = vi.fn(async () => reply([3, 1]));
    const store = restStore({ url: "https://r.example", token: "secret" }, fetchMock, () => 250);
    expect(await store.hit("run:1.2.3.4", 100)).toEqual({ count: 3, resetAt: 300 });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://r.example/pipeline");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer secret");
    expect(JSON.parse(init.body as string)).toEqual([
      ["INCR", "forkleaf:rl:run:1.2.3.4:2"],
      ["PEXPIRE", "forkleaf:rl:run:1.2.3.4:2", 100],
    ]);
  });

  it("marks once with SET NX PX", async () => {
    const fetchMock = vi.fn(async () => reply(["OK"])).mockResolvedValueOnce(reply(["OK"]));
    const store = restStore({ url: "https://r.example", token: "t" }, fetchMock);
    expect(await store.once("mcp-code:abc", 300_000)).toBe(true);
    fetchMock.mockResolvedValueOnce(reply([null]));
    expect(await store.once("mcp-code:abc", 300_000)).toBe(false);
    expect(
      JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string),
    ).toEqual([["SET", "forkleaf:once:mcp-code:abc", "1", "NX", "PX", 300_000]]);
  });

  it("keeps a request from choosing an arbitrary key", async () => {
    const fetchMock = vi.fn(async () => reply([1, 1]));
    await restStore({ url: "https://r.example", token: "t" }, fetchMock, () => 0).hit(
      "a b\r\n*x",
      10,
    );
    const body = JSON.parse(
      (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string,
    );
    expect(body[0][1]).toBe("forkleaf:rl:a_b___x:0");
  });
});

describe("sharedStore", () => {
  it("falls back to memory when the configured store cannot be reached", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://down.example");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "t");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("no", { status: 503 })),
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const store = sharedStore();
    expect((await store.hit("k", 60_000)).count).toBe(1);
    expect((await store.hit("k", 60_000)).count).toBe(2);
    expect(await store.once("c", 1000)).toBe(true);
    expect(await store.once("c", 1000)).toBe(false);
  });
});

describe("enforceRateLimit", () => {
  const request = () =>
    new NextRequest("http://localhost/api/x", { headers: { "x-real-ip": "9.9.9.9" } });

  it("lets the limit through and refuses the next with a 429", async () => {
    const options = { name: "t", limit: 2, windowMs: 60_000 };
    await enforceRateLimit(request(), options);
    await enforceRateLimit(request(), options);
    await expect(enforceRateLimit(request(), options)).rejects.toMatchObject({ status: 429 });
  });
});
