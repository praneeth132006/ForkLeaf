import { describe, expect, it, vi } from "vitest";
import { isPrivateAddress, parsePublicUrl, UnsafeUrlError } from "./safe-fetch";

describe("isPrivateAddress — IPv4", () => {
  it("refuses loopback", () => {
    expect(isPrivateAddress("127.0.0.1")).toBe(true);
    expect(isPrivateAddress("127.255.255.254")).toBe(true);
  });

  it("refuses the cloud metadata endpoint", () => {
    // The single most valuable thing an SSRF reaches.
    expect(isPrivateAddress("169.254.169.254")).toBe(true);
  });

  it("refuses the private ranges", () => {
    for (const ip of ["10.0.0.5", "172.16.0.1", "172.31.255.255", "192.168.1.1"]) {
      expect(isPrivateAddress(ip)).toBe(true);
    }
  });

  it("allows the public addresses that merely look nearby", () => {
    // 172.15 and 172.32 are outside the private block; refusing them would be
    // an off-by-one that quietly breaks real sites.
    for (const ip of ["172.15.0.1", "172.32.0.1", "192.169.0.1", "11.0.0.1"]) {
      expect(isPrivateAddress(ip)).toBe(false);
    }
  });

  it("refuses carrier-grade NAT, this-network, multicast and broadcast", () => {
    for (const ip of ["100.64.0.1", "0.0.0.0", "224.0.0.1", "255.255.255.255"]) {
      expect(isPrivateAddress(ip)).toBe(true);
    }
  });

  it("allows ordinary public addresses", () => {
    for (const ip of ["1.1.1.1", "8.8.8.8", "93.184.216.34"]) {
      expect(isPrivateAddress(ip)).toBe(false);
    }
  });

  it("refuses anything it cannot read as an address", () => {
    for (const ip of ["", "not.an.ip.address", "1.2.3", "999.1.1.1", "1.2.3.4.5"]) {
      expect(isPrivateAddress(ip)).toBe(true);
    }
  });
});

describe("isPrivateAddress — IPv6", () => {
  it("refuses loopback and the unspecified address", () => {
    expect(isPrivateAddress("::1", 6)).toBe(true);
    expect(isPrivateAddress("::", 6)).toBe(true);
  });

  it("refuses loopback wearing an IPv4-mapped hat", () => {
    expect(isPrivateAddress("::ffff:127.0.0.1", 6)).toBe(true);
    expect(isPrivateAddress("::ffff:169.254.169.254", 6)).toBe(true);
  });

  it("allows a public address behind the mapped form", () => {
    expect(isPrivateAddress("::ffff:8.8.8.8", 6)).toBe(false);
  });

  it("refuses link-local, unique-local and multicast", () => {
    for (const ip of ["fe80::1", "fc00::1", "fd12:3456::1", "ff02::1"]) {
      expect(isPrivateAddress(ip, 6)).toBe(true);
    }
  });

  it("ignores a zone index", () => {
    expect(isPrivateAddress("fe80::1%eth0", 6)).toBe(true);
  });

  it("allows an ordinary public IPv6 address", () => {
    expect(isPrivateAddress("2606:4700:4700::1111", 6)).toBe(false);
  });

  it("notices a colon even when no family is given", () => {
    expect(isPrivateAddress("::1")).toBe(true);
  });
});

describe("parsePublicUrl", () => {
  it("accepts ordinary web addresses", () => {
    expect(parsePublicUrl("https://example.com/a").hostname).toBe("example.com");
  });

  it("refuses a scheme that is not the web", () => {
    for (const url of ["file:///etc/passwd", "ftp://example.com", "gopher://example.com"]) {
      expect(() => parsePublicUrl(url)).toThrow(UnsafeUrlError);
    }
  });

  it("refuses credentials, which would be sent and then written down", () => {
    expect(() => parsePublicUrl("https://user:pass@example.com")).toThrow(/username or password/);
  });

  it("refuses something that is not a URL", () => {
    expect(() => parsePublicUrl("not a url")).toThrow(/not a web address/);
  });

  it("tolerates whitespace", () => {
    expect(parsePublicUrl("  https://example.com  ").hostname).toBe("example.com");
  });
});

describe("assertPublicUrl", () => {
  it("refuses a hostname that resolves into a private network", async () => {
    // A public name pointing at 127.0.0.1 is the whole reason addresses are
    // checked rather than names.
    vi.doMock("node:dns/promises", () => ({
      lookup: () => Promise.resolve([{ address: "127.0.0.1", family: 4 }]),
    }));
    vi.resetModules();

    const { assertPublicUrl } = await import("./safe-fetch");
    await expect(assertPublicUrl("https://evil.example.com")).rejects.toThrow(/private network/);
    vi.doUnmock("node:dns/promises");
  });

  it("refuses when any one of several addresses is private", async () => {
    vi.doMock("node:dns/promises", () => ({
      lookup: () =>
        Promise.resolve([
          { address: "93.184.216.34", family: 4 },
          { address: "10.0.0.1", family: 4 },
        ]),
    }));
    vi.resetModules();

    const { assertPublicUrl } = await import("./safe-fetch");
    await expect(assertPublicUrl("https://mixed.example.com")).rejects.toThrow(/private network/);
    vi.doUnmock("node:dns/promises");
  });

  it("allows a host that resolves entirely to public addresses", async () => {
    vi.doMock("node:dns/promises", () => ({
      lookup: () => Promise.resolve([{ address: "93.184.216.34", family: 4 }]),
    }));
    vi.resetModules();

    const { assertPublicUrl } = await import("./safe-fetch");
    await expect(assertPublicUrl("https://example.com/a")).resolves.toBeInstanceOf(URL);
    vi.doUnmock("node:dns/promises");
  });

  it("refuses a name that does not resolve at all", async () => {
    vi.doMock("node:dns/promises", () => ({
      lookup: () => Promise.reject(new Error("ENOTFOUND")),
    }));
    vi.resetModules();

    const { assertPublicUrl } = await import("./safe-fetch");
    await expect(assertPublicUrl("https://nope.example")).rejects.toThrow(/could not be resolved/);
    vi.doUnmock("node:dns/promises");
  });
});
