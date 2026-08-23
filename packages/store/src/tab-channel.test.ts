import { afterEach, describe, expect, it, vi } from "vitest";
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { TabChannel, resetTabChannel, tabChannel, tabChannelAvailable } from "./tab-channel";
import { IndexedDbDatabase } from "./idb-db";

/**
 * Node has a real `BroadcastChannel`, so these exercise the actual API rather
 * than a stand-in — which matters, because the behaviour being relied on is
 * the one thing a stub would get wrong: a channel never delivers a message
 * back to the tab that sent it.
 */

const channels: TabChannel[] = [];

function open(name: string): TabChannel {
  const channel = new TabChannel(name);
  channels.push(channel);
  return channel;
}

afterEach(() => {
  for (const channel of channels.splice(0)) channel.close();
  resetTabChannel();
  vi.restoreAllMocks();
});

/** A message is delivered asynchronously; this is one turn of that. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("TabChannel", () => {
  it("delivers to other tabs and not to itself", async () => {
    const a = open("test-1");
    const b = open("test-1");

    const heardByA = vi.fn();
    const heardByB = vi.fn();
    a.on(heardByA);
    b.on(heardByB);

    a.post({ type: "workspaces-changed" });
    await settle();

    expect(heardByB).toHaveBeenCalledWith({ type: "workspaces-changed" });
    expect(heardByA).not.toHaveBeenCalled();
  });

  it("stops delivering once unsubscribed or closed", async () => {
    const a = open("test-2");
    const b = open("test-2");

    const listener = vi.fn();
    const off = b.on(listener);
    off();

    a.post({ type: "workspaces-changed" });
    await settle();
    expect(listener).not.toHaveBeenCalled();
  });

  it("waitFor resolves on the message and false on the timeout", async () => {
    const a = open("test-3");
    const b = open("test-3");

    const waiting = b.waitFor("released-db", 500);
    a.post({ type: "released-db" });
    await expect(waiting).resolves.toBe(true);

    await expect(b.waitFor("released-db", 10)).resolves.toBe(false);
  });

  it("is inert rather than broken with no BroadcastChannel", async () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "BroadcastChannel");
    delete (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel;

    try {
      expect(tabChannelAvailable()).toBe(false);

      const channel = new TabChannel("test-4");
      expect(channel.available).toBe(false);
      // None of these may throw — every call site depends on that.
      channel.post({ type: "workspaces-changed" });
      channel.on(() => {});
      await expect(channel.waitFor("released-db", 5)).resolves.toBe(false);
      channel.close();
    } finally {
      if (descriptor) Object.defineProperty(globalThis, "BroadcastChannel", descriptor);
    }
  });

  it("shares one channel per tab", () => {
    expect(tabChannel()).toBe(tabChannel());
  });
});

describe("IndexedDbDatabase, across tabs", () => {
  it("asks the other tabs to let go when an open is blocked", async () => {
    Object.defineProperty(globalThis, "indexedDB", {
      value: new IDBFactory(),
      configurable: true,
      writable: true,
    });

    // A tab already holding the database at an older version, deaf to
    // `versionchange` — the situation that used to stall the loading screen.
    const stale = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("forkleaf", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("notes", { keyPath: "id" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    const other = open("release-test");
    const asked = other.waitFor("release-db", 1_000);

    const db = new IndexedDbDatabase(50, open("release-test"));
    // The open fails — the stale connection never lets go — but it must have
    // asked before giving up.
    await expect(db.ready()).rejects.toThrow();
    await expect(asked).resolves.toBe(true);
    expect(db.blocked).toBe(true);

    db.dispose();
    stale.close();
  });

  it("lets go of its own connection when another tab asks", async () => {
    Object.defineProperty(globalThis, "indexedDB", {
      value: new IDBFactory(),
      configurable: true,
      writable: true,
    });

    const db = new IndexedDbDatabase(500, open("polite-test"));
    await db.ready();
    await db.putWorkspace({
      id: "w",
      name: "W",
      repo: { owner: "o", repo: "r", branch: "main", directory: "" },
      isDefault: false,
      isLocal: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      lastOpenedAt: "2026-01-01T00:00:00.000Z",
    });

    const other = open("polite-test");
    const released = other.waitFor("released-db", 1_000);
    other.post({ type: "release-db", wanted: 3 });

    await expect(released).resolves.toBe(true);
    // Having let go, the next read simply reopens — no data is lost.
    expect(await db.listWorkspaces()).toHaveLength(1);

    db.dispose();
  });
});
