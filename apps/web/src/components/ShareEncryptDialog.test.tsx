// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ShareEncryptDialog } from "./ShareEncryptDialog";
import { PINS_KEY, createKey, openKey } from "@/lib/shared-encryption";

const store = new Map<string, string>();
beforeAll(() => {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, String(value)),
      removeItem: (key: string) => void store.delete(key),
    },
  });
});
afterEach(() => {
  cleanup();
  store.clear();
});

const FAST = 100_000;
const keys = Promise.all([
  createKey("alice", "alice passphrase long", FAST),
  createKey("bob", "bob passphrase is long", FAST),
  createKey("bob", "bob made a new key!!", FAST),
]);

function open(
  files: Record<string, string>,
  over: Partial<React.ComponentProps<typeof ShareEncryptDialog>> = {},
) {
  const props = {
    me: "alice",
    known: Object.keys(files),
    identity: null,
    loadKey: vi.fn(async (name: string) => files[name] ?? null),
    saveKey: vi.fn(async () => true),
    onIdentity: vi.fn(),
    noteTitle: "Plan",
    folder: "team",
    onEncrypt: vi.fn(async () => "note"),
    onClose: vi.fn(),
    ...over,
  };
  render(<ShareEncryptDialog {...props} />);
  return props;
}

describe("ShareEncryptDialog", () => {
  it("opens your key with its passphrase", async () => {
    const [alice] = await keys;
    const props = open({ alice: JSON.stringify(alice.file) });
    fireEvent.change(await screen.findByLabelText("Passphrase for your key"), {
      target: { value: "alice passphrase long" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Open my key" }));
    await waitFor(() => expect(props.onIdentity).toHaveBeenCalled());
  });

  it("asks you to compare fingerprints the first time, then encrypts", async () => {
    const [alice, bob] = await keys;
    const props = open(
      { alice: JSON.stringify(alice.file), bob: JSON.stringify(bob.file) },
      { identity: alice.identity },
    );
    fireEvent.click(await screen.findByLabelText("bob"));
    expect(await screen.findByText(/Compare fingerprints/)).toBeTruthy();
    const encrypt = screen.getByRole("button", {
      name: /Encrypt for 2 people/,
    }) as HTMLButtonElement;
    expect(encrypt.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText("The fingerprints match"));
    fireEvent.click(encrypt);
    await waitFor(() => expect(props.onEncrypt).toHaveBeenCalled());
    const [readers, scope] = vi.mocked(props.onEncrypt).mock.calls[0]! as unknown as [
      { name: string }[],
      string,
    ];
    expect(readers.map((reader) => reader.name).sort()).toEqual(["alice", "bob"]);
    expect(scope).toBe("note");
  });

  it("refuses to encrypt for someone whose key changed, until confirmed", async () => {
    const [alice, bob, newBob] = await keys;
    store.set(PINS_KEY, JSON.stringify({ bob: bob.file.fingerprint }));
    const props = open(
      { alice: JSON.stringify(alice.file), bob: JSON.stringify(newBob.file) },
      { identity: alice.identity, initialReaders: ["bob"] },
    );
    expect(await screen.findByText(/has changed since this device last used it/)).toBeTruthy();
    const encrypt = screen.getByRole("button", {
      name: /Encrypt for 2 people/,
    }) as HTMLButtonElement;
    expect(encrypt.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText("They confirmed it is their new key"));
    expect(encrypt.disabled).toBe(false);
    expect(props.onEncrypt).not.toHaveBeenCalled();
  });

  it("says when someone has no key yet", async () => {
    const [alice] = await keys;
    open(
      { alice: JSON.stringify(alice.file) },
      { identity: alice.identity, initialReaders: ["carol"] },
    );
    expect(await screen.findByText(/carol has not made a key/)).toBeTruthy();
  });

  it("makes a new key, sealed under your passphrase, and saves it", async () => {
    const props = open({}, { me: "dana" });
    const pass = "dana has a long passphrase";
    fireEvent.change(await screen.findByLabelText("New passphrase for your key"), {
      target: { value: pass },
    });
    fireEvent.change(screen.getByLabelText("Passphrase again"), { target: { value: pass } });
    fireEvent.click(screen.getByLabelText(/I understand a forgotten passphrase/));
    fireEvent.click(screen.getByRole("button", { name: "Make my key" }));
    await waitFor(() => expect(props.saveKey).toHaveBeenCalled(), { timeout: 10_000 });
    const [name, file] = vi.mocked(props.saveKey).mock.calls[0]! as unknown as [
      string,
      Parameters<typeof openKey>[0],
    ];
    expect(name).toBe("dana");
    expect(JSON.stringify(file)).not.toContain(pass);
    expect((await openKey(file, pass)).name).toBe("dana");
  }, 20_000);
});
