// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ActivityEntry } from "@/lib/live-activity";
import { markSeenUpTo } from "@/lib/conversation";
import { useConversationAlerts } from "./useConversationAlerts";

class FakeNotification {
  static permission: NotificationPermission = "granted";
  static shown: FakeNotification[] = [];
  static requestPermission = vi.fn(async () => FakeNotification.permission);
  onclick: (() => void) | null = null;
  closed = false;
  constructor(
    readonly title: string,
    readonly options: NotificationOptions,
  ) {
    FakeNotification.shown.push(this);
  }
  close() {
    this.closed = true;
  }
}

let focused = false;

beforeEach(() => {
  FakeNotification.shown = [];
  FakeNotification.permission = "granted";
  FakeNotification.requestPermission.mockClear();
  vi.stubGlobal("Notification", FakeNotification);
  vi.spyOn(document, "hasFocus").mockImplementation(() => focused);
  vi.spyOn(window, "focus").mockImplementation(() => undefined);
  focused = false;
  document.title = "Editor — ForkLeaf";
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const target = { owner: "me", repo: "notes" };
const entry = (v: number, extra: Partial<ActivityEntry> = {}): ActivityEntry => ({
  v,
  n: 12,
  kind: "comment",
  title: "Rotate keys?",
  by: "ada",
  at: "",
  note: null,
  excerpt: "Monthly.",
  ...extra,
});

function setup(mode?: "mine" | "all") {
  if (mode) window.localStorage.setItem("forkleaf:notify:me/notes", mode);
  const onOpen = vi.fn();
  const hook = renderHook(
    ({ entries }) => useConversationAlerts({ target, viewer: "praneeth", entries, onOpen }),
    { initialProps: { entries: [] as ActivityEntry[] } },
  );
  return { ...hook, onOpen };
}

describe("useConversationAlerts", () => {
  it("notifies about a new message while ForkLeaf is not in front, and opens it on click", () => {
    const { rerender, onOpen } = setup("all");
    rerender({ entries: [entry(1)] });

    expect(FakeNotification.shown).toHaveLength(1);
    const shown = FakeNotification.shown[0]!;
    expect(shown.title).toBe("@ada wrote in “Rotate keys?”");
    expect(shown.options).toEqual({ body: "Monthly.", tag: "forkleaf-me/notes#12" });

    shown.onclick!();
    expect(onOpen).toHaveBeenCalledWith(12);
    expect(shown.closed).toBe(true);
  });

  it("stays quiet while the reader is looking at it", () => {
    focused = true;
    const { rerender } = setup("all");
    rerender({ entries: [entry(1)] });
    expect(FakeNotification.shown).toHaveLength(0);
    expect(document.title).toBe("Editor — ForkLeaf");
  });

  it("is off until asked for", () => {
    const { rerender, result } = setup();
    expect(result.current.mode).toBe("off");
    rerender({ entries: [entry(1)] });
    expect(FakeNotification.shown).toHaveLength(0);
  });

  it("notifies each message once, however often the list is handed back", () => {
    const { rerender } = setup("all");
    rerender({ entries: [entry(1)] });
    rerender({ entries: [entry(1)] });
    rerender({ entries: [entry(1), entry(2)] });
    expect(FakeNotification.shown).toHaveLength(2);
  });

  it("only for threads this device has been in, when that is the choice", () => {
    markSeenUpTo("me", "notes", 30, "2026-10-01T00:00:00Z");
    const { rerender } = setup("mine");
    rerender({ entries: [entry(1), entry(2, { n: 30 })] });
    expect(FakeNotification.shown.map((n) => n.options.tag)).toEqual(["forkleaf-me/notes#30"]);
  });

  it("counts in the tab's title, and clears it when the tab is looked at", () => {
    FakeNotification.permission = "denied";
    const { rerender } = setup("all");
    rerender({ entries: [entry(1), entry(2, { n: 13 })] });
    expect(document.title).toBe("(2) Editor — ForkLeaf");
    expect(FakeNotification.shown).toHaveLength(0);

    act(() => window.dispatchEvent(new Event("focus")));
    expect(document.title).toBe("Editor — ForkLeaf");
  });

  it("asks the browser for permission when notifications are turned on, and remembers the choice", async () => {
    FakeNotification.permission = "default";
    FakeNotification.requestPermission.mockResolvedValueOnce("granted");
    const { result } = setup();

    let answer: unknown;
    await act(async () => {
      answer = await result.current.setMode("mine");
    });

    expect(FakeNotification.requestPermission).toHaveBeenCalled();
    expect(answer).toBe("granted");
    expect(result.current.mode).toBe("mine");
    expect(window.localStorage.getItem("forkleaf:notify:me/notes")).toBe("mine");
  });

  it("does not ask the browser anything when turning them off", async () => {
    const { result } = setup("all");
    await act(async () => {
      await result.current.setMode("off");
    });
    expect(FakeNotification.requestPermission).not.toHaveBeenCalled();
    expect(result.current.mode).toBe("off");
  });
});
