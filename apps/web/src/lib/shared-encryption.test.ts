import { describe, expect, it } from "vitest";
import {
  DamagedNoteError,
  NotForYouError,
  WrongKeyPassphraseError,
  checkPin,
  createKey,
  isShared,
  keyPath,
  openKey,
  openShared,
  parseKeyFile,
  readersOf,
  resealShared,
  sealShared,
  validName,
  type Reader,
} from "./shared-encryption";

// The minimum the parser accepts, so the tests stay quick.
const FAST = 100_000;
const reader = (made: Awaited<ReturnType<typeof createKey>>): Reader => ({
  name: made.file.name,
  fingerprint: made.file.fingerprint,
  publicKey: made.file.publicKey,
});

const alice = createKey("alice", "correct horse battery", FAST);
const bob = createKey("Bob", "another long passphrase", FAST);
const eve = createKey("eve", "eve has a passphrase too", FAST);

describe("keys", () => {
  it("round-trips through the file and opens only with its passphrase", async () => {
    const made = await alice;
    const file = await parseKeyFile(JSON.stringify(made.file));
    expect(file.name).toBe("alice");
    expect(made.file.fingerprint).toMatch(/^([0-9a-f]{4} ){7}[0-9a-f]{4}$/);
    const opened = await openKey(file, "correct horse battery");
    expect(opened.fingerprint).toBe(made.file.fingerprint);
    await expect(openKey(file, "wrong passphrase!!")).rejects.toBeInstanceOf(
      WrongKeyPassphraseError,
    );
  });

  it("never trusts a fingerprint written in the file", async () => {
    const made = await alice;
    const forged = { ...made.file, fingerprint: "0000 0000 0000 0000 0000 0000 0000 0000" };
    await expect(parseKeyFile(JSON.stringify(forged))).rejects.toBeInstanceOf(DamagedNoteError);
  });

  it("will not open a private key moved into someone else's file", async () => {
    const a = (await alice).file;
    const b = (await bob).file;
    const swapped = { ...b, sealedPrivate: a.sealedPrivate };
    await expect(
      openKey(await parseKeyFile(JSON.stringify(swapped)), "correct horse battery"),
    ).rejects.toBeInstanceOf(WrongKeyPassphraseError);
  });

  it("refuses short passphrases and names that could be a path", async () => {
    await expect(createKey("carol", "short", FAST)).rejects.toThrow();
    expect(validName("../etc")).toBe(false);
    expect(validName("a/b")).toBe(false);
    expect(() => keyPath("../../x")).toThrow();
    expect(keyPath("Bob")).toBe(".forkleaf/keys/bob.json");
  });
});

describe("shared notes", () => {
  it("opens for every reader and nobody else", async () => {
    const [a, b, e] = await Promise.all([alice, bob, eve]);
    const { envelope } = await sealShared("# Plan\n\nThe secret plan.", [reader(a), reader(b)]);
    expect(isShared(envelope)).toBe(true);
    expect(envelope).not.toContain("secret plan");
    expect(readersOf(envelope)).toEqual(["alice", "bob"]);
    expect((await openShared(envelope, a.identity)).plaintext).toBe("# Plan\n\nThe secret plan.");
    expect((await openShared(envelope, b.identity)).plaintext).toBe("# Plan\n\nThe secret plan.");
    await expect(openShared(envelope, e.identity)).rejects.toBeInstanceOf(NotForYouError);
  });

  it("seals again on save with the same readers and a fresh IV", async () => {
    const [a, b] = await Promise.all([alice, bob]);
    const { envelope, session } = await sealShared("v1", [reader(a), reader(b)]);
    const again = await resealShared(session, "v2");
    expect(again).not.toBe(envelope);
    expect(again.match(/iv=(.*)/)![1]).not.toBe(envelope.match(/iv=(.*)/)![1]);
    expect((await openShared(again, b.identity)).plaintext).toBe("v2");
  });

  it("fails to open if the list of readers is edited", async () => {
    const [a, b, e] = await Promise.all([alice, bob, eve]);
    const { envelope } = await sealShared("private", [reader(a)]);
    // Someone with write access adds a reader entry by hand.
    const tampered = envelope.replace('"name":"alice"', '"name":"mallory"');
    await expect(openShared(tampered, a.identity)).rejects.toBeInstanceOf(DamagedNoteError);
    // Or grafts in a wrapped key for themselves from another note.
    const other = await sealShared("x", [reader(e)]);
    const theirs = JSON.parse(other.envelope.split("\n").find((line) => line.startsWith("{"))!)
      .readers[0];
    const header = JSON.parse(envelope.split("\n").find((line) => line.startsWith("{"))!);
    header.readers.push(theirs);
    const grafted = envelope.replace(/^\{.*$/m, JSON.stringify(header));
    await expect(openShared(grafted, e.identity)).rejects.toBeInstanceOf(DamagedNoteError);
    void b;
  });

  it("fails cleanly on damaged ciphertext or header", async () => {
    const a = await alice;
    const { envelope } = await sealShared("private", [reader(a)]);
    const lines = envelope.split("\n");
    const at = lines.findIndex((line) => line.startsWith("iv=")) + 1;
    lines[at] = lines[at]!.replace(/^./, (c) => (c === "A" ? "B" : "A"));
    await expect(openShared(lines.join("\n"), a.identity)).rejects.toBeInstanceOf(DamagedNoteError);
    await expect(
      openShared(envelope.replace(/^\{.*$/m, "{not json"), a.identity),
    ).rejects.toBeInstanceOf(DamagedNoteError);
  });

  it("refuses to seal for a reader whose fingerprint does not match their key", async () => {
    const [a, b] = await Promise.all([alice, bob]);
    await expect(
      sealShared("x", [{ ...reader(a), fingerprint: reader(b).fingerprint }]),
    ).rejects.toBeInstanceOf(DamagedNoteError);
  });
});

describe("pins", () => {
  it("says whether a person's key is new, the same, or changed", async () => {
    const [a, b] = await Promise.all([alice, bob]);
    expect(checkPin({}, reader(a))).toBe("new");
    expect(checkPin({ alice: reader(a).fingerprint }, reader(a))).toBe("same");
    expect(checkPin({ alice: reader(b).fingerprint }, reader(a))).toBe("changed");
  });
});

describe("folder rules", () => {
  it("reads only valid folders and names, and finds the deepest rule for a note", async () => {
    const { parseFolderRules, folderRuleFor, formatFolderRules } =
      await import("./shared-encryption");
    const rules = parseFolderRules(
      JSON.stringify({
        team: ["alice", "Bob"],
        "team/secret/": ["alice"],
        "../x": ["eve"],
        bad: ["a/b"],
      }),
    );
    expect(rules).toEqual({ team: ["alice", "bob"], "team/secret": ["alice"] });
    expect(folderRuleFor("team/secret/plan.md", rules)).toEqual({
      folder: "team/secret",
      readers: ["alice"],
    });
    expect(folderRuleFor("team/notes.md", rules)?.readers).toEqual(["alice", "bob"]);
    expect(folderRuleFor("teammates/x.md", rules)).toBeNull();
    expect(parseFolderRules("nope")).toEqual({});
    expect(parseFolderRules(formatFolderRules(rules))).toEqual(rules);
  });
});
