/**
 * UTF-8 safe base64, working identically in Node and the browser.
 *
 * `btoa` only handles Latin-1, so any note containing an emoji or non-Latin
 * script would throw or corrupt on encode. We go through TextEncoder/Decoder to
 * get correct round-tripping for arbitrary Unicode.
 */

export function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);

  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }

  // Chunked to avoid blowing the argument limit on large notes.
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function decodeBase64(base64: string): string {
  // GitHub wraps its base64 payloads at 60 characters; strip all whitespace.
  const clean = base64.replace(/\s/g, "");

  if (typeof Buffer !== "undefined") {
    return Buffer.from(clean, "base64").toString("utf8");
  }

  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}
