import { afterEach, describe, expect, it, vi } from "vitest";

const lookup = vi.fn();
vi.mock("node:dns/promises", () => ({ lookup: (...args: unknown[]) => lookup(...args) }));

const { fetchPublic, isPrivateAddress, pinnedLookup, resolvePublic, UnsafeUrlError } =
  await import("./safe-fetch");

afterEach(() => {
  vi.unstubAllGlobals();
  lookup.mockReset();
});

describe("isPrivateAddress — IPv4 hidden inside IPv6", () => {
  it("refuses every spelling of an embedded private address", () => {
    for (const ip of [
      "::ffff:7f00:1", // IPv4-mapped loopback, in hex
      "::ffff:a9fe:a9fe", // mapped metadata endpoint, in hex
      "0:0:0:0:0:ffff:127.0.0.1",
      "::127.0.0.1", // IPv4-compatible
      "64:ff9b::a9fe:a9fe", // NAT64 metadata endpoint
      "64:ff9b::10.0.0.1",
      "2002:7f00:1::", // 6to4 of 127.0.0.1
      "2002:c0a8:101::1", // 6to4 of 192.168.1.1
      "fe90::1",
      "2001:db8::1",
      "not:an:address::x",
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });

  it("still allows public addresses in those forms", () => {
    for (const ip of [
      "::ffff:5db8:d822",
      "64:ff9b::5db8:d822",
      "2002:5db8:d822::1",
      "2606:4700::1111",
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });
});

describe("pinning the checked address", () => {
  it("answers every lookup with the address that was checked", () => {
    const answer = pinnedLookup("93.184.216.34", 4);
    const one = vi.fn();
    const all = vi.fn();
    answer("rebind.example", {}, one);
    answer("rebind.example", { all: true }, all);
    expect(one).toHaveBeenCalledWith(null, "93.184.216.34", 4);
    expect(all).toHaveBeenCalledWith(null, [{ address: "93.184.216.34", family: 4 }]);
  });

  it("refuses a name that resolves anywhere private, even once among public answers", async () => {
    lookup.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ]);
    await expect(resolvePublic("http://mixed.example/")).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it("fetches with a pinned dispatcher, never following redirects itself", async () => {
    lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    const fetchMock = vi.fn(async () => new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);
    await fetchPublic("https://example.com/page", { headers: { accept: "text/html" } });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      URL,
      RequestInit & { dispatcher?: unknown },
    ];
    expect(url.toString()).toBe("https://example.com/page");
    expect(init.redirect).toBe("manual");
    expect(init.dispatcher?.constructor.name).toBe("Agent");
  });

  it("does not fetch at all when the address is private", async () => {
    lookup.mockResolvedValue([{ address: "169.254.169.254", family: 4 }]);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchPublic("http://metadata.example/")).rejects.toBeInstanceOf(UnsafeUrlError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
