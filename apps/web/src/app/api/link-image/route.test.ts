import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.fn().mockResolvedValue({ token: "t", user: { login: "me" } });
vi.mock("@/lib/session", () => ({
  getSession: () => session(),
  getLiveSession: () => session(),
}));

// Every hostname resolves to one public address unless a test says otherwise.
const lookup = vi.fn().mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
vi.mock("node:dns/promises", () => ({ lookup: (...args: unknown[]) => lookup(...args) }));

const { GET } = await import("./route");
const { resetRateLimits } = await import("@/lib/rate-limit");

/** A response carrying `bytes` as an image of the given type. */
function image(type = "image/png", bytes = new Uint8Array([1, 2, 3, 4])) {
  return new Response(bytes, {
    headers: { "content-type": type, "content-length": String(bytes.byteLength) },
  });
}

function serve(respond: () => Response | Promise<Response>) {
  const mock = vi.fn().mockImplementation(() => Promise.resolve(respond()));
  vi.stubGlobal("fetch", mock);
  return mock;
}

async function get(url: string, ip = "image-test") {
  const response = await GET(
    new Request(`http://localhost/api/link-image?url=${encodeURIComponent(url)}`, {
      headers: { "x-forwarded-for": ip },
    }) as never,
  );
  return response;
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

describe("GET /api/link-image", () => {
  it("serves the bytes from our own origin", async () => {
    serve(() => image());

    const response = await get("https://cdn.example/cover.png");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("refuses an address inside the network the server runs in", async () => {
    lookup.mockResolvedValue([{ address: "10.0.0.5", family: 4 }]);
    const fetchMock = serve(() => image());

    expect((await get("http://internal.example/secret.png")).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("re-checks the address at every redirect", async () => {
    lookup
      .mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }])
      .mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);

    serve(() => new Response(null, { status: 302, headers: { location: "http://localhost/x" } }));

    expect((await get("https://cdn.example/cover.png")).status).toBe(400);
  });

  it("refuses to serve an SVG, which is a document that can carry script", async () => {
    serve(() => image("image/svg+xml"));

    expect((await get("https://cdn.example/cover.svg")).status).toBe(415);
  });

  it("refuses anything that is not an image at all", async () => {
    serve(() => new Response("<html>", { headers: { "content-type": "text/html" } }));

    expect((await get("https://cdn.example/page")).status).toBe(415);
  });

  it("refuses an image that declares itself too large", async () => {
    serve(
      () =>
        new Response(new Uint8Array([1]), {
          headers: { "content-type": "image/png", "content-length": String(9 * 1024 * 1024) },
        }),
    );

    expect((await get("https://cdn.example/huge.png")).status).toBe(413);
  });

  it("stops reading an image that lied about its size", async () => {
    // No content-length, and more bytes than the cap allows.
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let chunk = 0; chunk < 5; chunk += 1) {
          controller.enqueue(new Uint8Array(600 * 1024));
        }
        controller.close();
      },
    });

    serve(() => new Response(body, { headers: { "content-type": "image/png" } }));

    expect((await get("https://cdn.example/liar.png")).status).toBe(413);
  });

  it("does not fetch for someone who is not signed in", async () => {
    session.mockResolvedValue(null);
    const fetchMock = serve(() => image());

    expect((await get("https://cdn.example/cover.png")).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers a page that has gone with a 404 rather than an error page", async () => {
    serve(() => new Response("gone", { status: 404 }));

    expect((await get("https://cdn.example/missing.png")).status).toBe(404);
  });
});
