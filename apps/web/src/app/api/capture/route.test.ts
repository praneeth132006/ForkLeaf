import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session", () => ({
  getSession: () => Promise.resolve({ token: "t", user: { login: "me" } }),
  // What `requireClient` actually calls: the session with a token that has
  // been renewed if it needed renewing.
  getLiveSession: () => Promise.resolve({ token: "t", user: { login: "me" } }),
}));

vi.mock("@forkleaf/github-client", async () => {
  const actual =
    await vi.importActual<typeof import("@forkleaf/github-client")>("@forkleaf/github-client");
  return { ...actual, GitHubClient: class {} };
});

// Every hostname resolves to one public address unless a test says otherwise.
const lookup = vi.fn().mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
vi.mock("node:dns/promises", () => ({ lookup: (...args: unknown[]) => lookup(...args) }));

const { POST } = await import("./route");
const { resetRateLimits } = await import("@/lib/rate-limit");

/** A page response carrying `html` as its body. */
function page(html: string, init: { status?: number; headers?: Record<string, string> } = {}) {
  return new Response(html, {
    status: init.status ?? 200,
    headers: { "content-type": "text/html", ...init.headers },
  });
}

/** The Wayback availability answer. */
function wayback(closest: Record<string, unknown> | null) {
  return new Response(JSON.stringify({ archived_snapshots: closest ? { closest } : {} }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

/** Routes fetches by URL so the page and the archive can answer separately. */
function serve(handlers: { page?: () => Response | Promise<Response>; archive?: () => Response }) {
  const mock = vi.fn().mockImplementation((input: URL | string) => {
    const url = String(input);
    if (url.includes("archive.org")) {
      return Promise.resolve(handlers.archive?.() ?? wayback(null));
    }
    return Promise.resolve(handlers.page?.() ?? page("<title>A page</title>"));
  });

  vi.stubGlobal("fetch", mock);
  return mock;
}

async function post(body: unknown, ip = "capture-test") {
  const response = await POST(
    new Request("http://localhost/api/capture", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }) as never,
  );
  return { status: response.status, body: await response.json() };
}

beforeEach(() => {
  resetRateLimits();
  lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("POST /api/capture — what it refuses to fetch", () => {
  it("refuses a body with no address", async () => {
    expect((await post({})).status).toBe(400);
  });

  it("refuses a body that is not JSON", async () => {
    expect((await post("not json")).status).toBe(400);
  });

  it("refuses a scheme that is not the web", async () => {
    const { status, body } = await post({ url: "file:///etc/passwd" });
    expect(status).toBe(400);
    expect(body.error.message).toMatch(/http and https/i);
  });

  it("refuses an address carrying credentials", async () => {
    const { status } = await post({ url: "https://user:pass@example.com" });
    expect(status).toBe(400);
  });

  it("refuses a hostname resolving into a private network", async () => {
    // The reason this is checked server-side at all.
    lookup.mockResolvedValue([{ address: "169.254.169.254", family: 4 }]);
    const { status, body } = await post({ url: "https://metadata.example.com" });

    expect(status).toBe(400);
    expect(body.error.message).toMatch(/private network/i);
  });

  it("never fetches an address it refused", async () => {
    const fetchMock = serve({});
    lookup.mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
    await post({ url: "https://evil.example.com" });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a name that does not resolve", async () => {
    lookup.mockRejectedValue(new Error("ENOTFOUND"));
    expect((await post({ url: "https://nope.example" })).status).toBe(400);
  });
});

describe("POST /api/capture — reading the page", () => {
  it("returns the page's title", async () => {
    serve({ page: () => page("<html><head><title>The article</title></head>") });
    const { status, body } = await post({ url: "https://example.com/a" });

    expect(status).toBe(200);
    expect(body.title).toBe("The article");
    expect(body.titleFromUrl).toBe(false);
  });

  it("tidies whitespace and entities out of a title", async () => {
    serve({ page: () => page("<title>  A &amp;  B\n  C </title>") });
    expect((await post({ url: "https://example.com/a" })).body.title).toBe("A & B C");
  });

  it("falls back to the address when the page has no title", async () => {
    serve({ page: () => page("<html><head></head><body>hi</body>") });
    const { body } = await post({ url: "https://example.com/a" });

    expect(body.title).toBe("example.com/a");
    expect(body.titleFromUrl).toBe(true);
  });

  it("falls back when the page cannot be read at all", async () => {
    serve({ page: () => Promise.reject(new Error("refused")) });
    const { status, body } = await post({ url: "https://example.com/a" });

    // A capture that cannot reach the page is still worth something.
    expect(status).toBe(200);
    expect(body.titleFromUrl).toBe(true);
  });

  it("ignores a response that is not HTML", async () => {
    serve({
      page: () => new Response("{}", { headers: { "content-type": "application/json" } }),
    });
    expect((await post({ url: "https://example.com/a.json" })).body.titleFromUrl).toBe(true);
  });

  it("stamps when the capture happened", async () => {
    serve({});
    const { body } = await post({ url: "https://example.com/a" });
    expect(Number.isNaN(Date.parse(body.capturedAt))).toBe(false);
  });
});

describe("POST /api/capture — redirects", () => {
  it("re-checks the address at every hop", async () => {
    // A public URL that redirects into the private network must not be
    // followed; letting fetch follow redirects itself would sail past this.
    let hop = 0;
    serve({
      page: () => {
        hop += 1;
        if (hop === 1) {
          return new Response(null, {
            status: 302,
            headers: { location: "http://169.254.169.254/latest/meta-data" },
          });
        }
        return page("<title>Should never be read</title>");
      },
    });

    lookup.mockImplementation((host: string) =>
      host === "169.254.169.254"
        ? Promise.resolve([{ address: "169.254.169.254", family: 4 }])
        : Promise.resolve([{ address: "93.184.216.34", family: 4 }]),
    );

    const { body } = await post({ url: "https://example.com/a" });
    expect(body.title).not.toBe("Should never be read");
    expect(body.titleFromUrl).toBe(true);
  });

  it("follows an ordinary redirect to a public address", async () => {
    let hop = 0;
    serve({
      page: () => {
        hop += 1;
        if (hop === 1) {
          return new Response(null, {
            status: 301,
            headers: { location: "https://example.com/moved" },
          });
        }
        return page("<title>Moved here</title>");
      },
    });

    expect((await post({ url: "https://example.com/a" })).body.title).toBe("Moved here");
  });
});

describe("POST /api/capture — the archived copy", () => {
  it("returns the nearest snapshot the archive holds", async () => {
    serve({
      archive: () =>
        wayback({
          available: true,
          url: "http://web.archive.org/web/20240315120000/https://example.com/a",
          timestamp: "20240315120000",
        }),
    });

    const { body } = await post({ url: "https://example.com/a" });
    expect(body.archiveUrl).toBe(
      "https://web.archive.org/web/20240315120000/https://example.com/a",
    );
    expect(body.archivedAt).toBe("2024-03-15T12:00:00.000Z");
  });

  it("upgrades the archive link to https, which the API does not", async () => {
    serve({
      archive: () => wayback({ available: true, url: "http://web.archive.org/web/1/x" }),
    });
    expect((await post({ url: "https://example.com/a" })).body.archiveUrl).toMatch(/^https:/);
  });

  it("asks for a snapshot to be taken when none exists", async () => {
    // A citation with no archived copy is an address and a timestamp, which is
    // what this feature was supposed to improve on.
    let asked = false;
    const mock = vi.fn().mockImplementation((input: URL | string) => {
      const url = String(input);
      if (url.includes("web.archive.org/save/")) {
        asked = true;
        return Promise.resolve(new Response("", { status: 200 }));
      }
      if (url.includes("archive.org")) {
        return Promise.resolve(
          asked
            ? wayback({ available: true, url: "http://web.archive.org/web/1/x" })
            : wayback(null),
        );
      }
      return Promise.resolve(page("<title>A page</title>"));
    });
    vi.stubGlobal("fetch", mock);

    const { body } = await post({ url: "https://example.com/a" });

    expect(asked).toBe(true);
    expect(body.archiveUrl).toBe("https://web.archive.org/web/1/x");
  });

  it("does not ask for one when the archive already has it", async () => {
    const mock = vi.fn().mockImplementation((input: URL | string) => {
      const url = String(input);
      if (url.includes("archive.org")) {
        return Promise.resolve(wayback({ available: true, url: "http://web.archive.org/web/1/x" }));
      }
      return Promise.resolve(page("<title>A page</title>"));
    });
    vi.stubGlobal("fetch", mock);

    await post({ url: "https://example.com/a" });

    expect(mock.mock.calls.some(([u]) => String(u).includes("/save/"))).toBe(false);
  });

  it("still returns the capture when archiving fails outright", async () => {
    const mock = vi.fn().mockImplementation((input: URL | string) => {
      const url = String(input);
      if (url.includes("/save/")) return Promise.reject(new Error("rate limited"));
      if (url.includes("archive.org")) return Promise.resolve(wayback(null));
      return Promise.resolve(page("<title>A page</title>"));
    });
    vi.stubGlobal("fetch", mock);

    const { status, body } = await post({ url: "https://example.com/a" });

    expect(status).toBe(200);
    expect(body.title).toBe("A page");
    expect(body.archiveUrl).toBeNull();
  });

  it("treats an unavailable snapshot as no snapshot", async () => {
    serve({ archive: () => wayback({ available: false, url: "http://web.archive.org/x" }) });
    expect((await post({ url: "https://example.com/a" })).body.archiveUrl).toBeNull();
  });

  it("survives a timestamp it cannot read", async () => {
    serve({ archive: () => wayback({ available: true, url: "http://x/y", timestamp: "nope" }) });
    const { body } = await post({ url: "https://example.com/a" });

    expect(body.archiveUrl).toBeTruthy();
    expect(body.archivedAt).toBeNull();
  });

  it("does not fail a capture because the archive is down", async () => {
    serve({ archive: () => new Response("nope", { status: 503 }) });
    const { status, body } = await post({ url: "https://example.com/a" });

    expect(status).toBe(200);
    expect(body.archiveUrl).toBeNull();
    expect(body.title).toBeTruthy();
  });
});

describe("POST /api/capture — rate limiting", () => {
  it("stops a client capturing far more than a person would", async () => {
    serve({});
    const statuses: number[] = [];
    for (let i = 0; i < 22; i += 1) {
      statuses.push((await post({ url: "https://example.com/a" }, "flooder")).status);
    }

    expect(statuses.filter((s) => s === 200)).toHaveLength(20);
    expect(statuses.at(-1)).toBe(429);
  });
});
