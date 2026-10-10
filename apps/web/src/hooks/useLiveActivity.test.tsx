// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { latestVersion, useLiveActivity } from "./useLiveActivity";

/** Enough of EventSource to drive from a test. */
class FakeEventSource {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;
  static opened: FakeEventSource[] = [];

  readyState = FakeEventSource.CONNECTING;
  onerror: (() => void) | null = null;
  closed = false;
  private listeners = new Map<string, ((event: MessageEvent<string>) => void)[]>();

  constructor(readonly url: string) {
    FakeEventSource.opened.push(this);
  }

  addEventListener(type: string, listener: (event: MessageEvent<string>) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  close() {
    this.closed = true;
    this.readyState = FakeEventSource.CLOSED;
  }

  emit(type: string, data: unknown) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener({ data: JSON.stringify(data) } as MessageEvent<string>);
    }
  }

  fail(closed: boolean) {
    this.readyState = closed ? FakeEventSource.CLOSED : FakeEventSource.CONNECTING;
    this.onerror?.();
  }
}

let visibility: DocumentVisibilityState = "visible";

beforeEach(() => {
  FakeEventSource.opened = [];
  visibility = "visible";
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const target = { owner: "me", repo: "notes" };
const entry = (v: number, n = 12) => ({
  v,
  n,
  kind: "comment",
  title: "t",
  by: "ada",
  at: "",
  note: null,
  excerpt: "hi",
});

describe("useLiveActivity", () => {
  it("connects to the repository's stream, and is live once it says so", () => {
    const { result } = renderHook(() => useLiveActivity(target));
    const source = FakeEventSource.opened[0]!;

    expect(source.url).toBe("/api/gh/live?owner=me&repo=notes");
    expect(result.current.status).toBe("connecting");

    act(() => source.emit("ready", { version: 3 }));
    expect(result.current.status).toBe("live");
  });

  it("collects what happens, oldest first", () => {
    const { result } = renderHook(() => useLiveActivity(target));
    const source = FakeEventSource.opened[0]!;
    act(() => {
      source.emit("ready", { version: 3 });
      source.emit("activity", entry(4));
      source.emit("activity", entry(5, 13));
    });
    expect(result.current.entries.map((e) => e.v)).toEqual([4, 5]);
  });

  it("does nothing without a repository", () => {
    const { result } = renderHook(() => useLiveActivity(null));
    expect(FakeEventSource.opened).toHaveLength(0);
    expect(result.current.status).toBe("off");
  });

  it("disconnects while the tab is hidden, and resumes from the last version on return", () => {
    renderHook(() => useLiveActivity(target));
    const first = FakeEventSource.opened[0]!;
    act(() => {
      first.emit("ready", { version: 3 });
      first.emit("activity", entry(4));
    });

    visibility = "hidden";
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(first.closed).toBe(true);

    visibility = "visible";
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(FakeEventSource.opened[1]!.url).toBe("/api/gh/live?owner=me&repo=notes&since=4");
  });

  it("gives up when the server will not stream — no webhooks, or no access", () => {
    const { result } = renderHook(() => useLiveActivity(target));
    act(() => FakeEventSource.opened[0]!.fail(true));
    expect(result.current.status).toBe("off");

    // Coming back to the tab does not try again.
    visibility = "hidden";
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    visibility = "visible";
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(FakeEventSource.opened).toHaveLength(1);
  });

  it("shows reconnecting while EventSource retries a dropped connection", () => {
    const { result } = renderHook(() => useLiveActivity(target));
    const source = FakeEventSource.opened[0]!;
    act(() => source.emit("ready", { version: 1 }));
    act(() => source.fail(false));
    expect(result.current.status).toBe("connecting");
  });

  it("closes the stream when the page is done with it", () => {
    const { unmount } = renderHook(() => useLiveActivity(target));
    unmount();
    expect(FakeEventSource.opened[0]!.closed).toBe(true);
  });
});

describe("latestVersion", () => {
  it("finds the newest matching entry", () => {
    const entries = [entry(4, 1), entry(5, 2), entry(6, 1)] as never[];
    expect(latestVersion(entries)).toBe(6);
    expect(latestVersion(entries, (e: { n: number }) => e.n === 2)).toBe(5);
    expect(latestVersion(entries, () => false)).toBe(0);
  });
});
