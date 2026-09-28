/**
 * Notes encrypted for people, not for a passphrase.
 *
 * A passphrase-encrypted note can be shared only by sharing the passphrase,
 * and then it cannot be un-shared. This is the other kind: a note sealed for a
 * list of people, each of whom opens it with their own key, in a repository
 * several people write to — a team folder, a family folder.
 *
 * Each person has a key pair (ECDH on P-256, from the browser's own WebCrypto).
 * Its public half is published in the repository at `.forkleaf/keys/<name>.json`;
 * its private half is kept in the same file sealed under that person's own
 * passphrase (AES-256-GCM, key from PBKDF2-SHA256), so any of their devices can
 * open it and nobody else can.
 *
 * A note gets a fresh random 256-bit key. The note is sealed with it
 * (AES-256-GCM); the key is sealed once per reader, with a key agreed between
 * a one-off key pair made for this note and that reader's public key (ECDH,
 * then HKDF-SHA256). The list of readers is authenticated along with the note,
 * so it cannot be edited without the note failing to open.
 *
 * What it cannot protect against, and says so: anyone who can write to the
 * repository can replace a person's public key with their own. So each
 * device remembers the fingerprint it first saw for every person, and refuses
 * to seal for someone whose key has changed until that is confirmed.
 */

import { PBKDF2_ITERATIONS } from "@/lib/encryption";

export const SHARED_MARKER = "<!-- forkleaf:encrypted v2 -->";
export const KEYS_FOLDER = ".forkleaf/keys";
const FENCE = "forkleaf-shared";
const SALT_BYTES = 16;
const IV_BYTES = 12;
const CURVE = "P-256";

export class NotForYouError extends Error {
  constructor(readers: readonly string[]) {
    super(`This note is encrypted for ${readers.join(", ")} — not for your key.`);
    this.name = "NotForYouError";
  }
}

export class DamagedNoteError extends Error {
  constructor() {
    super("This note's sealed text has been changed or damaged, so it cannot be opened.");
    this.name = "DamagedNoteError";
  }
}

export class WrongKeyPassphraseError extends Error {
  constructor() {
    super("That passphrase does not open your key.");
    this.name = "WrongKeyPassphraseError";
  }
}

// ── Encoding ──────────────────────────────────────────────────────────────

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
  if (!/^[A-Za-z0-9+/=\s]*$/.test(text)) throw new DamagedNoteError();
  const binary = atob(text.replace(/\s+/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const utf8 = (text: string) => new TextEncoder().encode(text);

// ── Identities ────────────────────────────────────────────────────────────

/** A public key as published: only the fields that define it. */
export interface PublicJwk {
  kty: "EC";
  crv: "P-256";
  x: string;
  y: string;
}

export interface KeyFile {
  v: 1;
  name: string;
  publicKey: PublicJwk;
  fingerprint: string;
  /** The private key (PKCS#8), sealed under its owner's passphrase. */
  sealedPrivate: {
    kdf: "PBKDF2-SHA256";
    iterations: number;
    salt: string;
    iv: string;
    data: string;
  };
}

/** A person's key opened on this device. The private half cannot be exported. */
export interface Identity {
  name: string;
  fingerprint: string;
  publicKey: PublicJwk;
  privateKey: CryptoKey;
}

/** Names that can be a file name and a GitHub username, and nothing else. */
const NAME = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;

export function validName(name: string): boolean {
  return NAME.test(name);
}

export function keyPath(name: string): string {
  if (!validName(name)) throw new Error("Not a usable name.");
  return `${KEYS_FOLDER}/${name.toLowerCase()}.json`;
}

function canonicalJwk(jwk: JsonWebKey | PublicJwk): PublicJwk {
  if (
    jwk.kty !== "EC" ||
    jwk.crv !== CURVE ||
    typeof jwk.x !== "string" ||
    typeof jwk.y !== "string"
  )
    throw new DamagedNoteError();
  return { kty: "EC", crv: CURVE, x: jwk.x, y: jwk.y };
}

/** SHA-256 of the public key, as eight groups of four hex digits: easy to read aloud and compare. */
export async function fingerprintOf(jwk: PublicJwk): Promise<string> {
  const canonical = JSON.stringify(canonicalJwk(jwk));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", utf8(canonical)));
  const hex = [...digest.slice(0, 16)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return hex.match(/.{4}/g)!.join(" ");
}

async function passphraseKey(passphrase: string, salt: Uint8Array, iterations: number) {
  const material = await crypto.subtle.importKey(
    "raw",
    utf8(passphrase.normalize("NFC")),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function importPublic(jwk: PublicJwk): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "jwk",
    canonicalJwk(jwk),
    { name: "ECDH", namedCurve: CURVE },
    true,
    [],
  );
}

/**
 * A new key for `name`, sealed under `passphrase`. The file goes into the
 * repository; the identity is this device's open copy of it.
 */
export async function createKey(
  name: string,
  passphrase: string,
  iterations = PBKDF2_ITERATIONS,
): Promise<{ file: KeyFile; identity: Identity }> {
  if (!validName(name)) throw new Error("Not a usable name.");
  if (passphrase.length < 12) throw new Error("Use a passphrase of at least 12 characters.");
  const pair = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: CURVE }, true, [
    "deriveBits",
  ])) as CryptoKeyPair;
  const publicKey = canonicalJwk(await crypto.subtle.exportKey("jwk", pair.publicKey));
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const wrapKey = await passphraseKey(passphrase, salt, iterations);
  const fingerprint = await fingerprintOf(publicKey);
  const data = new Uint8Array(
    await crypto.subtle.encrypt(
      // The name and public key are bound in, so a sealed private key cannot
      // be moved into someone else's file.
      {
        name: "AES-GCM",
        iv: iv as BufferSource,
        additionalData: utf8(`${name.toLowerCase()}|${fingerprint}`),
      },
      wrapKey,
      pkcs8,
    ),
  );
  pkcs8.fill(0);
  const file: KeyFile = {
    v: 1,
    name: name.toLowerCase(),
    publicKey,
    fingerprint,
    sealedPrivate: {
      kdf: "PBKDF2-SHA256",
      iterations,
      salt: toBase64(salt),
      iv: toBase64(iv),
      data: toBase64(data),
    },
  };
  const identity = await openKey(file, passphrase);
  return { file, identity };
}

/** Reads a key file, checking every field, or throws. */
export async function parseKeyFile(text: string): Promise<KeyFile> {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new DamagedNoteError();
  }
  const file = value as KeyFile;
  if (
    !file ||
    file.v !== 1 ||
    typeof file.name !== "string" ||
    !validName(file.name) ||
    !file.sealedPrivate ||
    file.sealedPrivate.kdf !== "PBKDF2-SHA256" ||
    !Number.isInteger(file.sealedPrivate.iterations) ||
    file.sealedPrivate.iterations < 100_000 ||
    file.sealedPrivate.iterations > 10_000_000
  ) {
    throw new DamagedNoteError();
  }
  const publicKey = canonicalJwk(file.publicKey);
  // The fingerprint written in the file is never trusted; it is recomputed.
  if ((await fingerprintOf(publicKey)) !== file.fingerprint) throw new DamagedNoteError();
  return { ...file, publicKey };
}

/** Opens one's own key with its passphrase. */
export async function openKey(file: KeyFile, passphrase: string): Promise<Identity> {
  const sealed = file.sealedPrivate;
  const wrapKey = await passphraseKey(passphrase, fromBase64(sealed.salt), sealed.iterations);
  let pkcs8: Uint8Array;
  try {
    pkcs8 = new Uint8Array(
      await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: fromBase64(sealed.iv) as BufferSource,
          additionalData: utf8(`${file.name}|${file.fingerprint}`),
        },
        wrapKey,
        fromBase64(sealed.data) as BufferSource,
      ),
    );
  } catch {
    throw new WrongKeyPassphraseError();
  }
  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    pkcs8 as BufferSource,
    { name: "ECDH", namedCurve: CURVE },
    false,
    ["deriveBits"],
  );
  pkcs8.fill(0);
  return { name: file.name, fingerprint: file.fingerprint, publicKey: file.publicKey, privateKey };
}

// ── Notes ─────────────────────────────────────────────────────────────────

export interface Reader {
  name: string;
  fingerprint: string;
  publicKey: PublicJwk;
}

interface Header {
  v: 2;
  cipher: "AES-256-GCM";
  kex: "ECDH-P256-HKDF-SHA256";
  epk: PublicJwk;
  readers: { name: string; fp: string; iv: string; key: string }[];
}

/** An opened shared note's key, kept in memory so it can be sealed again on save. */
export interface SharedSession {
  kind: "shared";
  headerLine: string;
  readers: string[];
  contentKey: CryptoKey;
}

export function isShared(content: string): boolean {
  return content.trimStart().startsWith(SHARED_MARKER);
}

async function wrappingKey(
  ownPrivate: CryptoKey,
  otherPublic: CryptoKey,
  readerFingerprint: string,
): Promise<CryptoKey> {
  const secret = await crypto.subtle.deriveBits(
    { name: "ECDH", public: otherPublic },
    ownPrivate,
    256,
  );
  const hkdf = await crypto.subtle.importKey("raw", secret, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(32) as BufferSource,
      info: utf8(`forkleaf v2 key for ${readerFingerprint}`) as BufferSource,
    },
    hkdf,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function formatShared(
  headerLine: string,
  readers: readonly string[],
  iv: Uint8Array,
  data: Uint8Array,
) {
  return [
    SHARED_MARKER,
    "",
    `This note is encrypted for ${readers.join(", ")}. Open it in ForkLeaf with your own key to read it.`,
    "",
    "```" + FENCE,
    headerLine,
    `iv=${toBase64(iv)}`,
    toBase64(data)
      .replace(/(.{76})/g, "$1\n")
      .trim(),
    "```",
    "",
  ].join("\n");
}

/** Seals `plaintext` for `readers`, with a fresh note key. */
export async function sealShared(
  plaintext: string,
  readers: readonly Reader[],
): Promise<{ envelope: string; session: SharedSession }> {
  if (readers.length === 0) throw new Error("A shared note needs at least one reader.");
  const contentKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", contentKey));
  const ephemeral = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: CURVE }, true, [
    "deriveBits",
  ])) as CryptoKeyPair;
  const epk = canonicalJwk(await crypto.subtle.exportKey("jwk", ephemeral.publicKey));

  const header: Header = {
    v: 2,
    cipher: "AES-256-GCM",
    kex: "ECDH-P256-HKDF-SHA256",
    epk,
    readers: [],
  };
  for (const reader of readers) {
    if (!validName(reader.name)) throw new Error("Not a usable name.");
    const fingerprint = await fingerprintOf(reader.publicKey);
    if (fingerprint !== reader.fingerprint) throw new DamagedNoteError();
    const key = await wrappingKey(
      ephemeral.privateKey,
      await importPublic(reader.publicKey),
      fingerprint,
    );
    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const wrapped = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv as BufferSource },
        key,
        raw as BufferSource,
      ),
    );
    header.readers.push({
      name: reader.name.toLowerCase(),
      fp: fingerprint,
      iv: toBase64(iv),
      key: toBase64(wrapped),
    });
  }
  raw.fill(0);

  const session: SharedSession = {
    kind: "shared",
    headerLine: JSON.stringify(header),
    readers: header.readers.map((reader) => reader.name),
    // Re-imported unextractable: from here on it can seal and open, never leave.
    contentKey: await crypto.subtle.importKey(
      "raw",
      new Uint8Array(await crypto.subtle.exportKey("raw", contentKey)) as BufferSource,
      "AES-GCM",
      false,
      ["encrypt", "decrypt"],
    ),
  };
  return { envelope: await resealShared(session, plaintext), session };
}

/** Seals new text for the same readers — an autosave — with a fresh IV. */
export async function resealShared(session: SharedSession, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const data = new Uint8Array(
    await crypto.subtle.encrypt(
      // The header is the additional data: change a reader and the note fails.
      {
        name: "AES-GCM",
        iv: iv as BufferSource,
        additionalData: utf8(session.headerLine) as BufferSource,
      },
      session.contentKey,
      utf8(plaintext) as BufferSource,
    ),
  );
  return formatShared(session.headerLine, session.readers, iv, data);
}

/** The readers a sealed note names, without opening it. */
export function readersOf(content: string): string[] {
  try {
    return parseShared(content).header.readers.map((reader) => reader.name);
  } catch {
    return [];
  }
}

function parseShared(content: string): {
  header: Header;
  headerLine: string;
  iv: Uint8Array;
  data: Uint8Array;
} {
  if (!isShared(content)) throw new DamagedNoteError();
  const block = new RegExp("```" + FENCE + "\\n([^\\n]*)\\niv=([^\\n]*)\\n([\\s\\S]*?)\\n```").exec(
    content,
  );
  if (!block) throw new DamagedNoteError();
  let header: Header;
  try {
    header = JSON.parse(block[1]!) as Header;
  } catch {
    throw new DamagedNoteError();
  }
  if (
    header.v !== 2 ||
    header.cipher !== "AES-256-GCM" ||
    header.kex !== "ECDH-P256-HKDF-SHA256" ||
    !Array.isArray(header.readers) ||
    header.readers.length === 0 ||
    header.readers.length > 64
  ) {
    throw new DamagedNoteError();
  }
  const iv = fromBase64(block[2]!);
  if (iv.length !== IV_BYTES) throw new DamagedNoteError();
  return { header, headerLine: block[1]!, iv, data: fromBase64(block[3]!) };
}

/** Opens a shared note with this device's identity. */
export async function openShared(
  content: string,
  identity: Identity,
): Promise<{ plaintext: string; session: SharedSession }> {
  const { header, headerLine, iv, data } = parseShared(content);
  const mine = header.readers.find((reader) => reader.fp === identity.fingerprint);
  if (!mine) throw new NotForYouError(header.readers.map((reader) => reader.name));
  let contentKey: CryptoKey;
  try {
    const key = await wrappingKey(
      identity.privateKey,
      await importPublic(header.epk),
      identity.fingerprint,
    );
    const raw = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: fromBase64(mine.iv) as BufferSource },
        key,
        fromBase64(mine.key) as BufferSource,
      ),
    );
    contentKey = await crypto.subtle.importKey("raw", raw as BufferSource, "AES-GCM", false, [
      "encrypt",
      "decrypt",
    ]);
    raw.fill(0);
  } catch {
    throw new DamagedNoteError();
  }
  let plain: ArrayBuffer;
  try {
    plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource, additionalData: utf8(headerLine) as BufferSource },
      contentKey,
      data as BufferSource,
    );
  } catch {
    throw new DamagedNoteError();
  }
  return {
    plaintext: new TextDecoder().decode(plain),
    session: {
      kind: "shared",
      headerLine,
      readers: header.readers.map((reader) => reader.name),
      contentKey,
    },
  };
}

// ── Pinning ───────────────────────────────────────────────────────────────

export type PinCheck = "new" | "same" | "changed";

/**
 * Whether a person's key is the one this device saw before. "changed" is the
 * warning sign: either they made a new key, or someone replaced it.
 */
export function checkPin(pins: Record<string, string>, reader: Reader): PinCheck {
  const seen = pins[reader.name.toLowerCase()];
  if (!seen) return "new";
  return seen === reader.fingerprint ? "same" : "changed";
}

export const PINS_KEY = "forkleaf:key-pins";

export function readPins(): Record<string, string> {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(PINS_KEY) ?? "{}");
    return value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(
          Object.entries(value as Record<string, unknown>).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string",
          ),
        )
      : {};
  } catch {
    return {};
  }
}

export function pin(readers: readonly Reader[]): void {
  try {
    const pins = readPins();
    for (const reader of readers) pins[reader.name.toLowerCase()] = reader.fingerprint;
    window.localStorage.setItem(PINS_KEY, JSON.stringify(pins));
  } catch {
    // Not remembered on this device; the next seal asks again.
  }
}

// ── Folders ───────────────────────────────────────────────────────────────

/** Which folders' notes are to be encrypted, and for whom. Names only: no key material. */
export const ENCRYPTED_FOLDERS_PATH = ".forkleaf/encrypted-folders.json";

const FOLDER = /^(?!.*\.\.)(?!\/)[^\0]{1,200}$/;

export function parseFolderRules(text: string | null): Record<string, string[]> {
  if (!text) return {};
  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const rules: Record<string, string[]> = {};
    for (const [folder, names] of Object.entries(value as Record<string, unknown>)) {
      if (!FOLDER.test(folder) || !Array.isArray(names)) continue;
      const valid = names.filter(
        (name): name is string => typeof name === "string" && validName(name),
      );
      if (valid.length > 0)
        rules[folder.replace(/\/+$/, "")] = valid.map((name) => name.toLowerCase());
    }
    return rules;
  } catch {
    return {};
  }
}

export function formatFolderRules(rules: Record<string, string[]>): string {
  const sorted = Object.fromEntries(Object.entries(rules).sort(([a], [b]) => a.localeCompare(b)));
  return `${JSON.stringify(sorted, null, 2)}\n`;
}

/** The readers a note's folder asks for — the deepest folder with a rule — or null. */
export function folderRuleFor(
  path: string,
  rules: Record<string, string[]>,
): { folder: string; readers: string[] } | null {
  let best: { folder: string; readers: string[] } | null = null;
  for (const [folder, readers] of Object.entries(rules)) {
    if (!path.startsWith(`${folder}/`)) continue;
    if (!best || folder.length > best.folder.length) best = { folder, readers };
  }
  return best;
}
