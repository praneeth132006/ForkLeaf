import { lookup } from "node:dns/promises";
import { Agent } from "undici";

/**
 * Refusing to fetch things on the server's behalf that were meant for it.
 *
 * Capturing a page means this server makes an HTTP request to an address a
 * user typed. That is server-side request forgery waiting to happen: the
 * server sits inside a network the user does not, and `http://169.254.169.254`
 * or `http://10.0.0.5/admin` are addresses only it can reach. A capture
 * feature without this is a proxy into the deployment's private network with a
 * text box on the front.
 *
 * So the hostname is resolved first and the *address* is checked, not the
 * name. Checking names alone is defeated by a DNS record that simply points at
 * 127.0.0.1, which anybody can create.
 */

/** Reserved IPv4 ranges, as [first octet-matching test, why]. */
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    // Not an address we can reason about, so not one we will fetch.
    return true;
  }

  const [a, b] = parts as [number, number, number, number];

  if (a === 0) return true; // "this network"
  if (a === 10) return true; // private
  if (a === 127) return true; // loopback
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  if (a === 169 && b === 254) return true; // link-local, and cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 192 && b === 0) return true; // protocol assignments
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast, reserved, broadcast

  return false;
}

/** Reserved IPv6 ranges, including the mapped-IPv4 form. */
/** The eight 16-bit groups of an IPv6 address, or null when it is not one. */
function hextets(address: string): number[] | null {
  let text = address;
  // A dotted IPv4 tail (`::ffff:1.2.3.4`, `::1.2.3.4`) is two groups.
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(text);
  if (dotted) {
    const parts = dotted[1]!.split(".").map(Number);
    if (parts.some((n) => !Number.isInteger(n) || n > 255)) return null;
    text =
      text.slice(0, dotted.index) +
      `${((parts[0]! << 8) | parts[1]!).toString(16)}:${((parts[2]! << 8) | parts[3]!).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const read = (part: string) => (part ? part.split(":") : []);
  const head = read(halves[0]!);
  const tail = halves.length === 2 ? read(halves[1]!) : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0) return null;
  const groups = [...head, ...Array(fill).fill("0"), ...tail];
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null;
  return groups.map((group) => parseInt(group, 16));
}

function embeddedIPv4(high: number, low: number): string {
  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
}

function isPrivateIPv6(ip: string): boolean {
  const address = ip.toLowerCase().split("%")[0] ?? "";
  const g = hextets(address);
  // Not an address we can reason about, so not one we will fetch.
  if (!g) return true;

  const zeros = (from: number, to: number) => g.slice(from, to).every((group) => group === 0);
  if (zeros(0, 8)) return true; // unspecified
  if (zeros(0, 7) && g[7] === 1) return true; // loopback

  // Addresses that carry an IPv4 address inside them are judged by it, in
  // every spelling: `::ffff:127.0.0.1`, `::ffff:7f00:1`, the deprecated
  // IPv4-compatible `::127.0.0.1`, NAT64 `64:ff9b::/96` and 6to4 `2002::/16`.
  if (zeros(0, 5) && g[5] === 0xffff) return isPrivateIPv4(embeddedIPv4(g[6]!, g[7]!));
  if (zeros(0, 6)) return isPrivateIPv4(embeddedIPv4(g[6]!, g[7]!));
  if (g[0] === 0x64 && g[1] === 0xff9b && zeros(2, 6))
    return isPrivateIPv4(embeddedIPv4(g[6]!, g[7]!));
  if (g[0] === 0x2002) return isPrivateIPv4(embeddedIPv4(g[1]!, g[2]!));

  if ((g[0]! & 0xffc0) === 0xfe80) return true; // link-local
  if ((g[0]! & 0xfe00) === 0xfc00) return true; // unique local
  if ((g[0]! & 0xff00) === 0xff00) return true; // multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true; // documentation

  return false;
}

export function isPrivateAddress(ip: string, family?: number): boolean {
  if (!ip) return true;
  if (family === 6 || ip.includes(":")) return isPrivateIPv6(ip);
  return isPrivateIPv4(ip);
}

export class UnsafeUrlError extends Error {}

/**
 * Checks a URL's shape without touching the network.
 *
 * Separate from the resolution below so the cheap refusals happen first and so
 * this half can be tested without DNS.
 */
export function parsePublicUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new UnsafeUrlError("That is not a web address.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeUrlError("Only http and https addresses can be captured.");
  }

  // Credentials would be sent by this server and then written into a note.
  if (url.username || url.password) {
    throw new UnsafeUrlError("Addresses carrying a username or password cannot be captured.");
  }

  return url;
}

/**
 * Resolves the host and refuses anything that lands inside a private network.
 *
 * `all: true` because a name can resolve to several addresses, and a host that
 * answers with one public and one private address is the interesting case: if
 * any of them is private, the fetch could reach it.
 */
export async function assertPublicUrl(raw: string): Promise<URL> {
  const url = parsePublicUrl(raw);
  const hostname = url.hostname.replace(/^\[|\]$/g, "");

  let addresses: { address: string; family: number }[];
  try {
    addresses = await lookup(hostname, { all: true });
  } catch {
    throw new UnsafeUrlError("That address could not be resolved.");
  }

  if (addresses.length === 0) throw new UnsafeUrlError("That address could not be resolved.");

  for (const { address, family } of addresses) {
    if (isPrivateAddress(address, family)) {
      throw new UnsafeUrlError("That address is inside a private network and will not be fetched.");
    }
  }

  return url;
}

/**
 * A public address, resolved once, with the IP it was checked at.
 *
 * Checking an address and then handing the hostname to `fetch` is not enough:
 * `fetch` resolves the name again, and a DNS server that answers with a public
 * address the first time and `127.0.0.1` the second (TTL 0 — "DNS rebinding")
 * walks straight past the check. So the address that was checked is the one
 * that is connected to.
 */
export async function resolvePublic(
  raw: string,
): Promise<{ url: URL; address: string; family: number }> {
  const url = parsePublicUrl(raw);
  const hostname = url.hostname.replace(/^\[|\]$/g, "");

  let addresses: { address: string; family: number }[];
  try {
    addresses = await lookup(hostname, { all: true });
  } catch {
    throw new UnsafeUrlError("That address could not be resolved.");
  }
  if (addresses.length === 0) throw new UnsafeUrlError("That address could not be resolved.");
  for (const { address, family } of addresses) {
    if (isPrivateAddress(address, family)) {
      throw new UnsafeUrlError("That address is inside a private network and will not be fetched.");
    }
  }
  return { url, address: addresses[0]!.address, family: addresses[0]!.family };
}

/**
 * `fetch`, connecting only to the address `resolvePublic` checked.
 *
 * The URL keeps its hostname, so the Host header and TLS certificate checks
 * are for the name the user asked for; only the connection is pinned. Every
 * call resolves and checks afresh, so each redirect hop is pinned too.
 */
/**
 * A DNS lookup that can only ever answer with the address already checked.
 * Given to the connection as its resolver, so no second, unchecked lookup
 * can happen however the name is asked for.
 */
export function pinnedLookup(address: string, family: number) {
  return (
    _hostname: string,
    options: { all?: boolean },
    callback: (...args: unknown[]) => void,
  ): void => {
    if (options?.all) callback(null, [{ address, family }]);
    else callback(null, address, family);
  };
}

export async function fetchPublic(raw: string | URL, init: RequestInit = {}): Promise<Response> {
  const { url, address, family } = await resolvePublic(raw.toString());
  const dispatcher = new Agent({ connect: { lookup: pinnedLookup(address, family) as never } });
  try {
    // The platform fetch takes an undici dispatcher; the type does not say so.
    return await fetch(url, { ...init, redirect: "manual", dispatcher } as RequestInit);
  } finally {
    // Closed gracefully once the response has been read; never reused, so
    // the next request — the next redirect hop — is resolved and checked again.
    void dispatcher.close().catch(() => undefined);
  }
}
