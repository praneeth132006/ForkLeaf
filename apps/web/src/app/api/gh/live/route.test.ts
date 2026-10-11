import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getRepo = vi.fn();
let session: { token: string; user: { login: string } } | null = {
  token: "t",
  user: { login: "me" },
};

vi.mock("@/lib/session", () => ({
  getSession: () => Promise.resolve(session),
  getLiveSession: () => Promise.resolve(session),
  clearSessionCookie: () => Promise.resolve(),
}));

vi.mock("@forkleaf/github-client", async () => {
  const actual =
    await vi.importActual<typeof import("@forkleaf/github-client")>("@forkleaf/github-client");
  return {
    ...actual,
    GitHubClient: class {
      getRepo = getRepo;
    },
  };
});

const { GET } = await import("./route");
const { resetMemoryStore, sharedStore } = await import("@/lib/shared-store");
const { activityKey } = await import("@/lib/live-activity");

beforeEach(() => {
  vi.stubEnv("GITHUB_WEBHOOK_SECRET", "s");
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
  vi.stubEnv("KV_REST_API_URL", "");
  session = { token: "t", user: { login: "me" } };
  getRepo.mockResolvedValue({ fullName: "me/notes" });
  resetMemoryStore();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

const open = (query: string, headers: Record<string, string> = {}) => {
  const controller = new AbortController();
  const request = new Request(`http://localhost/api/gh/live${query}`, {
    headers,
    signal: controller.signal,
  });
  return { response: GET(request as never), controller };
};

async function firstChunk(response: Response): Promise<string> {
  const reader = response.body!.getReader();
  const { value } = await reader.read();
  await reader.cancel();
  return new TextDecoder().decode(value);
}

describe("GET /api/gh/live", () => {
  it("streams server-sent events, starting from the current version", async () => {
    await sharedStore().append(activityKey("me", "notes"), { n: 1 }, 50, 60_000);
    const { response, controller } = open("?owner=me&repo=notes");
    const res = await response;

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream; charset=utf-8");
    expect(res.headers.get("cache-control")).toContain("no-transform");
    expect(await firstChunk(res)).toBe('retry: 3000\nevent: ready\ndata: {"version":1}\n\n');
    expect(getRepo).toHaveBeenCalledWith("me", "notes");
    controller.abort();
  });

  it("resumes from the Last-Event-ID the browser sends back", async () => {
    const store = sharedStore();
    await store.append(activityKey("me", "notes"), { n: 1 }, 50, 60_000);
    await store.append(activityKey("me", "notes"), { n: 2 }, 50, 60_000);
    const { response, controller } = open("?owner=me&repo=notes", { "last-event-id": "1" });

    expect(await firstChunk(await response)).toBe(
      'id: 2\nevent: activity\ndata: {"v":2,"n":2}\n\n',
    );
    controller.abort();
  });

  it("tells the browser to stop trying when this server has no webhooks", async () => {
    vi.stubEnv("GITHUB_WEBHOOK_SECRET", "");
    expect((await open("?owner=me&repo=notes").response).status).toBe(204);
  });

  it("is only for somebody who can read the repository", async () => {
    getRepo.mockResolvedValue(null);
    expect((await open("?owner=me&repo=notes").response).status).toBe(404);

    session = null;
    expect((await open("?owner=me&repo=notes").response).status).toBe(401);
  });

  it("refuses a name that would change the upstream address", async () => {
    expect((await open("?owner=me&repo=..").response).status).toBe(400);
    expect(getRepo).not.toHaveBeenCalled();
  });
});
