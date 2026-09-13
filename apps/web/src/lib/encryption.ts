/**
 * Notes only their passphrase can read.
 *
 * A notebook is a git repository, and a repository is often public, or shared,
 * or cloned onto machines you do not control. An encrypted note is still one
 * ordinary `.md` file in it — but its words, title and tags are sealed with a
 * key derived from a passphrase that never leaves the browser.
 *
 * The file explains itself on github.com and keeps the sealed text in a fenced
 * block, so a reader who finds it knows what it is and anybody with the
 * passphrase could decrypt it with nothing but the parameters written beside
 * it: AES-256-GCM, with the key from PBKDF2-SHA256.
 *
 * There is no recovery. That is the point, and the app says so before a note
 * is encrypted.
 */

export const ENCRYPTED_MARKER = "<!-- forkleaf:encrypted v1 -->";
const FENCE = "forkleaf-encrypted";

/** OWASP's 2023 figure for PBKDF2-SHA256. Slow on purpose: it is paid once per unlock. */
export const PBKDF2_ITERATIONS = 600_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

export class WrongPassphraseError extends Error {
  constructor() {
    super("That passphrase does not open this note.");
    this.name = "WrongPassphraseError";
  }
}

export class NotEncryptedError extends Error {
  constructor() {
    super("This note is not encrypted, or its sealed text has been damaged.");
    this.name = "NotEncryptedError";
  }
}

export interface Envelope {
  iterations: number;
  salt: Uint8Array;
  iv: Uint8Array;
  ciphertext: Uint8Array;
}

export function isEncrypted(content: string): boolean {
  return content.trimStart().startsWith(ENCRYPTED_MARKER);
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text.replace(/\s+/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveKey(passphrase: string, salt: Uint8Array, iterations: number) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase.normalize("NFC")),
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

export function formatEnvelope(envelope: Envelope): string {
  const sealed = toBase64(envelope.ciphertext)
    .replace(/(.{76})/g, "$1\n")
    .trim();
  return [
    ENCRYPTED_MARKER,
    "",
    "This note is encrypted. Open it in ForkLeaf and enter its passphrase to read it.",
    "",
    "```" + FENCE,
    `v=1;cipher=AES-256-GCM;kdf=PBKDF2-SHA256;iterations=${envelope.iterations};salt=${toBase64(envelope.salt)};iv=${toBase64(envelope.iv)}`,
    sealed,
    "```",
    "",
  ].join("\n");
}

export function parseEnvelope(content: string): Envelope {
  if (!isEncrypted(content)) throw new NotEncryptedError();
  const block = new RegExp("```" + FENCE + "\\n([^\\n]*)\\n([\\s\\S]*?)\\n```").exec(content);
  if (!block) throw new NotEncryptedError();

  const fields = Object.fromEntries(
    block[1]!.split(";").map((pair) => {
      const at = pair.indexOf("=");
      return [pair.slice(0, at), pair.slice(at + 1)];
    }),
  );
  const iterations = Number(fields.iterations);
  if (
    fields.v !== "1" ||
    fields.cipher !== "AES-256-GCM" ||
    fields.kdf !== "PBKDF2-SHA256" ||
    !Number.isInteger(iterations) ||
    iterations < 100_000 ||
    iterations > 10_000_000
  ) {
    throw new NotEncryptedError();
  }

  try {
    const envelope = {
      iterations,
      salt: fromBase64(fields.salt ?? ""),
      iv: fromBase64(fields.iv ?? ""),
      ciphertext: fromBase64(block[2]!),
    };
    if (envelope.salt.length !== SALT_BYTES || envelope.iv.length !== IV_BYTES) {
      throw new NotEncryptedError();
    }
    return envelope;
  } catch {
    throw new NotEncryptedError();
  }
}

/**
 * A key, derived once, that can seal a note over and over.
 *
 * Deriving the key is deliberately slow — that is what makes guessing a
 * passphrase expensive — so it cannot happen on every autosave. The note is
 * unlocked once, and each save after that reuses the key with a fresh random
 * IV, which is how AES-GCM is meant to be used.
 *
 * Held in memory only. It is never written to storage.
 */
export interface SealSession {
  key: CryptoKey;
  salt: Uint8Array;
  iterations: number;
}

export async function createSession(
  passphrase: string,
  iterations = PBKDF2_ITERATIONS,
): Promise<SealSession> {
  if (!passphrase) throw new Error("A passphrase is required.");
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  return { key: await deriveKey(passphrase, salt, iterations), salt, iterations };
}

export async function seal(session: SealSession, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      session.key,
      new TextEncoder().encode(plaintext),
    ),
  );
  return formatEnvelope({
    iterations: session.iterations,
    salt: session.salt,
    iv,
    ciphertext,
  });
}

/**
 * Opens a sealed note, and keeps the key so it can be sealed again.
 *
 * GCM authenticates what it decrypts, so a wrong passphrase and a tampered file
 * fail the same way — and neither ever returns garbage as if it were the note.
 */
export async function unlock(
  content: string,
  passphrase: string,
): Promise<{ plaintext: string; session: SealSession }> {
  const envelope = parseEnvelope(content);
  const key = await deriveKey(passphrase, envelope.salt, envelope.iterations);
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: envelope.iv as BufferSource },
      key,
      envelope.ciphertext as BufferSource,
    );
    return {
      plaintext: new TextDecoder().decode(plain),
      session: { key, salt: envelope.salt, iterations: envelope.iterations },
    };
  } catch {
    throw new WrongPassphraseError();
  }
}

/** Seals a whole note — front matter and body — under a passphrase. */
export async function encryptNote(
  plaintext: string,
  passphrase: string,
  iterations = PBKDF2_ITERATIONS,
): Promise<string> {
  return seal(await createSession(passphrase, iterations), plaintext);
}

export async function decryptNote(content: string, passphrase: string): Promise<string> {
  return (await unlock(content, passphrase)).plaintext;
}

/** How strong a passphrase looks, for the warning under the field. Not a guarantee. */
export function passphraseAdvice(passphrase: string): string | null {
  if (passphrase.length < 12)
    return "Use at least 12 characters — a few unrelated words is easiest.";
  if (new Set(passphrase).size < 6) return "Mix in more different characters.";
  return null;
}
