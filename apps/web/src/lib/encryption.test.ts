import { describe, expect, it } from "vitest";
import {
  ENCRYPTED_MARKER,
  NotEncryptedError,
  WrongPassphraseError,
  createSession,
  decryptNote,
  encryptNote,
  isEncrypted,
  parseEnvelope,
  passphraseAdvice,
  seal,
  unlock,
} from "./encryption";

// Fewer iterations than the real default, so the suite stays fast. The format
// records the count, so decryption reads whatever was used.
const FAST = 100_000;
const NOTE =
  "---\ntitle: Diary\ntags: [private]\n---\n\n# Dear diary\n\nToday I learned 🔐 ünïcödé.\n";

describe("encryptNote and decryptNote", () => {
  it("round-trips a whole note, front matter and all", async () => {
    const sealed = await encryptNote(NOTE, "correct horse battery staple", FAST);
    expect(await decryptNote(sealed, "correct horse battery staple")).toBe(NOTE);
  });

  it("leaks none of the note into the file", async () => {
    const sealed = await encryptNote(NOTE, "passphrase-for-test", FAST);
    for (const secret of ["Diary", "private", "Dear diary", "learned"]) {
      expect(sealed).not.toContain(secret);
    }
    expect(sealed.startsWith(ENCRYPTED_MARKER)).toBe(true);
    expect(sealed).toContain("Open it in ForkLeaf");
    expect(sealed).toContain(`iterations=${FAST}`);
  });

  it("gives different sealed text each time, even for the same note and passphrase", async () => {
    const one = await encryptNote(NOTE, "same passphrase here", FAST);
    const two = await encryptNote(NOTE, "same passphrase here", FAST);
    expect(one).not.toBe(two);
  });

  it("refuses the wrong passphrase instead of returning garbage", async () => {
    const sealed = await encryptNote(NOTE, "right passphrase", FAST);
    await expect(decryptNote(sealed, "wrong passphrase")).rejects.toBeInstanceOf(
      WrongPassphraseError,
    );
  });

  it("refuses a file whose sealed text was changed", async () => {
    const sealed = await encryptNote(NOTE, "right passphrase", FAST);
    const lines = sealed.split("\n");
    const index = lines.findIndex((line) => line.startsWith("v=1;")) + 1;
    const line = lines[index]!;
    lines[index] = (line[0] === "A" ? "B" : "A") + line.slice(1);
    await expect(decryptNote(lines.join("\n"), "right passphrase")).rejects.toBeInstanceOf(
      WrongPassphraseError,
    );
  });

  it("normalises the passphrase, so the same word typed two ways still opens it", async () => {
    const composed = "caf" + String.fromCharCode(0xe9) + "-passphrase";
    const decomposed = "cafe" + String.fromCharCode(0x301) + "-passphrase";
    const sealed = await encryptNote(NOTE, composed, FAST);
    expect(await decryptNote(sealed, decomposed)).toBe(NOTE);
  });

  it("will not encrypt with an empty passphrase", async () => {
    await expect(encryptNote(NOTE, "", FAST)).rejects.toThrow("passphrase");
  });
});

describe("sessions: unlock once, seal many times", () => {
  it("seals with a session so the passphrase still opens every version", async () => {
    const session = await createSession("session passphrase", FAST);
    const first = await seal(session, "version one");
    const second = await seal(session, "version two");
    expect(first).not.toBe(second);
    expect(await decryptNote(first, "session passphrase")).toBe("version one");
    expect(await decryptNote(second, "session passphrase")).toBe("version two");
  });

  it("hands back a session from unlocking that seals edits the passphrase can open", async () => {
    const sealed = await encryptNote("original", "unlock me please", FAST);
    const { plaintext, session } = await unlock(sealed, "unlock me please");
    expect(plaintext).toBe("original");
    const edited = await seal(session, "edited after unlocking");
    expect(await decryptNote(edited, "unlock me please")).toBe("edited after unlocking");
    expect(parseEnvelope(edited).salt).toEqual(parseEnvelope(sealed).salt);
  });

  it("uses a fresh IV for every seal", async () => {
    const session = await createSession("iv check passphrase", FAST);
    const ivs = new Set<string>();
    for (let i = 0; i < 5; i += 1) {
      ivs.add(Array.from(parseEnvelope(await seal(session, "same text")).iv).join(","));
    }
    expect(ivs.size).toBe(5);
  });
});

describe("isEncrypted and parseEnvelope", () => {
  it("recognises only the marker at the start", () => {
    expect(isEncrypted(`\n${ENCRYPTED_MARKER}\n`)).toBe(true);
    expect(isEncrypted(`# Note\n${ENCRYPTED_MARKER}`)).toBe(false);
  });

  it("rejects a damaged or weakened envelope", async () => {
    const sealed = await encryptNote(NOTE, "a passphrase", FAST);
    expect(() => parseEnvelope("# plain note")).toThrow(NotEncryptedError);
    expect(() => parseEnvelope(sealed.replace(`iterations=${FAST}`, "iterations=10"))).toThrow(
      NotEncryptedError,
    );
    expect(() => parseEnvelope(sealed.replace("cipher=AES-256-GCM", "cipher=ROT13"))).toThrow(
      NotEncryptedError,
    );
    expect(() => parseEnvelope(sealed.replace(/salt=[^;]+/, "salt=AAAA"))).toThrow(
      NotEncryptedError,
    );
  });
});

describe("passphraseAdvice", () => {
  it("nudges short or repetitive passphrases, and is quiet for a good one", () => {
    expect(passphraseAdvice("short")).toMatch(/12 characters/);
    expect(passphraseAdvice("aaaaaaaaaaaaaaaa")).toMatch(/different/);
    expect(passphraseAdvice("river piano lantern oak")).toBeNull();
  });
});
