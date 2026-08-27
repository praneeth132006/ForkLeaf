import { lookup } from "node:dns/promises";

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
function isPrivateIPv6(ip: string): boolean {
  const address = ip.toLowerCase().split("%")[0] ?? "";

  if (address === "::" || address === "::1") return true;

  // `::ffff:127.0.0.1` is loopback wearing a different hat.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(address);
  if (mapped?.[1]) return isPrivateIPv4(mapped[1]);

  if (address.startsWith("fe80")) return true; // link-local
  if (/^f[cd]/.test(address)) return true; // unique local
  if (address.startsWith("ff")) return true; // multicast

  return false;
}

/** True for an address the server should never be asked to fetch. */
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
