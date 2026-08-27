import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.fn().mockResolvedValue({ token: "t", user: { login: "me" } });
vi.mock("@/lib/session", () => ({ getSession: () => session() }));

// Every hostname resolves to one public address unless a test says otherwise.
const lookup = vi.fn().mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
vi.mock("node:dns/promises", () => ({ lookup: (...args: unknown[]) => lookup(...args) }));

const { GET } = await import("./route");
const { resetRateLimits } = await import("@/lib/rate-limit");

function page(html: string, init: { status?: number; headers?: Record<string, string> } = {}) {
  return new Response(html, {
    status: init.status ?? 200,
    headers: { "content-type": "text/html", ...init.headers },
  });
}

function serve(respond: () => Response | Promise<Response>) {
  const mock = vi.fn().mockImplementation(() => Promise.resolve(respond()));
  vi.stubGlobal("fetch", mock);
  return mock;
}

async function get(url: string, ip = "preview-test") {
  const response = await GET(
    new Request(`http://localhost/api/link-preview?url=${encodeURIComponent(url)}`, {
      headers: { "x-forwarded-for": ip },
    }) as never,
  );
  return { status: response.status, body: await response.json() };
}

beforeEach(() => {
  resetRateLimits();
  session.mockResolvedValue({ token: "t", user: { login: "me" } });
  lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("GET /api/link-preview — what it refuses to fetch", () => {
  it("refuses an address that resolves inside the network it runs in", async () => {
    // The whole reason this is a server route and not a fetch from the page.
    lookup.mockResolvedValue([{ address: "169.254.169.254", family: 4 }]);
    const fetchMock = serve(() => page("<title>Nope</title>"));

    const { status } = await get("http://metadata.example/latest");

    expect(status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a scheme that is not http", async () => {
    const { status } = await get("file:///etc/passwd");
    expect(status).toBe(400);
  });

  it("asks for a sign-in rather than fetching for anyone who asks", async () => {
    session.mockResolvedValue(null);
    const fetchMock = serve(() => page("<title>A page</title>"));

    const { status } = await get("https://example.com/a");

    expect(status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/link-preview — reading the page", () => {
  it("reads the title and the page's own description", async () => {
    serve(() =>
      page(
        `<html><head><title>breach-parse</title>
         <meta name="description" content="A tool for parsing breached passwords">
         </head><body>ignored</body></html>`,
      ),
    );

    const { body } = await get("https://github.com/hmaverickadams/breach-parse");

    expect(body.title).toBe("breach-parse");
    expect(body.description).toBe("A tool for parsing breached passwords");
    expect(body.host).toBe("github.com");
  });

  it("prefers the OpenGraph title, which is written for exactly this", async () => {
    serve(() =>
      page(
        `<head><title>GitHub - hmaverickadams/breach-parse</title>
         <meta property="og:title" content="breach-parse"></head>`,
      ),
    );

    expect((await get("https://github.com/x")).body.title).toBe("breach-parse");
  });

  it("reads a meta tag whose content comes before its key", async () => {
    // Legal, common, and missed by a pattern that expects the key first.
    serve(() => page(`<head><meta content="Written backwards" property="og:description"></head>`));

    expect((await get("https://example.com/a")).body.description).toBe("Written backwards");
  });

  it("decodes the entities that appear in real titles", async () => {
    serve(() => page("<head><title>Tips &amp; tricks &#8212; part 1</title></head>"));

    expect((await get("https://example.com/a")).body.title).toBe("Tips & tricks — part 1");
  });

  it("still answers with the host when the page cannot be read", async () => {
    // An empty card would read as the feature being broken rather than as the
    // page being unreachable.
    serve(() => Promise.reject(new Error("connection refused")));

    const { status, body } = await get("https://example.com/gone");

    expect(status).toBe(200);
    expect(body).toMatchObject({ title: null, description: null, host: "example.com" });
  });

  it("does not try to read a response that is not html", async () => {
    serve(() => new Response("%PDF-1.7", { headers: { "content-type": "application/pdf" } }));

    expect((await get("https://example.com/a.pdf")).body.title).toBeNull();
  });

  it("never returns an image, so nothing in a card fetches from the page's host", async () => {
    serve(() => page(`<head><meta property="og:image" content="https://tracker.example/px.png">`));

    const { body } = await get("https://example.com/a");
    expect(JSON.stringify(body)).not.toContain("tracker.example");
  });
});

describe("GET /api/link-preview — redirects", () => {
  it("re-checks the address at every hop", async () => {
    // A public URL that redirects inward is the way past a one-shot check.
    lookup
      .mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }])
      .mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);

    serve(
      () => new Response(null, { status: 302, headers: { location: "http://localhost/admin" } }),
    );

    expect((await get("https://example.com/redirect")).body.title).toBeNull();
  });
});

describe("GET /api/link-preview — rate limiting", () => {
  it("stops one client reading pages without end", async () => {
    serve(() => page("<title>A page</title>"));

    let refused = 0;
    for (let attempt = 0; attempt < 125; attempt += 1) {
      const { status } = await get(`https://example.com/${attempt}`, "flooder");
      if (status === 429) refused += 1;
    }

    expect(refused).toBeGreaterThan(0);
  });
});
