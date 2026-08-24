// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  DIAGRAM_CHANNEL,
  clearSession,
  diagramPopoutSupported,
  readSession,
  resetDiagramChannel,
  sweepSessions,
  useDiagramPopoutHost,
  useDiagramPopoutSession,
  writeSession,
  type DiagramPopoutMessage,
} from "./popout";

/**
 * The protocol between a note and a diagram window, tested across two real
 * `BroadcastChannel`s.
 *
 * A channel never delivers to the instance that sent the message, which is
 * exactly the behaviour the design leans on — so the test opens its own
 * channel and plays the part of the other tab, rather than stubbing one and
 * quietly testing something easier than the real thing.
 */

/**
 * A working `localStorage`.
 *
 * Node 25 defines its own experimental `localStorage` global, and it shadows
 * jsdom's — with every method missing unless the process was started with a
 * backing file. Nothing about the code under test is at fault; the test just
 * needs the API a browser actually has.
 */
function installStorage(): void {
  const entries = new Map<string, string>();

  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      get length() {
        return entries.size;
      },
      key: (index: number) => [...entries.keys()][index] ?? null,
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => void entries.set(key, String(value)),
      removeItem: (key: string) => void entries.delete(key),
      clear: () => entries.clear(),
    },
  });
}

beforeEach(installStorage);

const channels: BroadcastChannel[] = [];

function otherTab(): {
  post: (message: DiagramPopoutMessage) => void;
  received: DiagramPopoutMessage[];
} {
  const channel = new BroadcastChannel(DIAGRAM_CHANNEL);
  channels.push(channel);

  const received: DiagramPopoutMessage[] = [];
  channel.onmessage = (event: MessageEvent<DiagramPopoutMessage>) => received.push(event.data);

  return { post: (message) => channel.postMessage(message), received };
}

/**
 * Polled rather than a single tick: delivery is a macrotask and how many turns
 * of the loop it takes is not fixed, which is a flaky test rather than a real
 * failure.
 */
async function until(check: () => boolean, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (!check()) {
    if (Date.now() > deadline) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
  }

  // One more turn, so anything sent in reaction has landed too.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
  });
}

afterEach(() => {
  for (const channel of channels.splice(0)) channel.close();
  resetDiagramChannel();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("the stored copy", () => {
  it("round-trips a session", () => {
    writeSession("abc", { code: "flowchart TD\n  A-->B", title: "Flow" });

    const session = readSession("abc");
    expect(session?.code).toBe("flowchart TD\n  A-->B");
    expect(session?.title).toBe("Flow");
    expect(session?.updatedAt).toBeGreaterThan(0);
  });

  it("ignores a half-written or foreign entry", () => {
    window.localStorage.setItem("forkleaf.diagram.broken", "{not json");
    expect(readSession("broken")).toBeNull();
  });

  it("sweeps sessions whose windows are long gone, and keeps the live ones", () => {
    writeSession("fresh", { code: "graph TD", title: "Fresh" });
    window.localStorage.setItem(
      "forkleaf.diagram.old",
      JSON.stringify({
        code: "graph TD",
        title: "Old",
        updatedAt: Date.now() - 48 * 60 * 60 * 1000,
      }),
    );

    sweepSessions();

    expect(readSession("fresh")).not.toBeNull();
    expect(readSession("old")).toBeNull();
  });

  it("clears one on request", () => {
    writeSession("abc", { code: "graph TD", title: "T" });
    clearSession("abc");
    expect(readSession("abc")).toBeNull();
  });
});

describe("the note's side", () => {
  function openHost(code = "flowchart TD\n  A-->B") {
    const onChange = vi.fn();
    const opened = { focus: vi.fn(), close: vi.fn() } as unknown as Window;
    vi.spyOn(window, "open").mockReturnValue(opened);

    const view = renderHook(
      (props: { code: string }) => useDiagramPopoutHost({ ...props, onChange }),
      {
        initialProps: { code },
      },
    );

    return { view, onChange, opened };
  }

  it("stays inert until a window is asked for", () => {
    const { view } = openHost();
    expect(view.result.current.active).toBe(false);
    expect(readSession(view.result.current.sessionId)).toBeNull();
  });

  it("seeds the session and opens a named window", () => {
    const { view } = openHost("flowchart TD\n  A-->B");

    act(() => view.result.current.open());

    const { sessionId } = view.result.current;
    expect(readSession(sessionId)?.code).toBe("flowchart TD\n  A-->B");
    expect(view.result.current.active).toBe(true);
    expect(window.open).toHaveBeenCalledWith(
      `/diagram?s=${sessionId}`,
      `forkleaf-diagram-${sessionId}`,
    );
  });

  it("does not claim a session a pop-up blocker refused", () => {
    const { view } = openHost();
    vi.spyOn(window, "open").mockReturnValue(null);

    act(() => view.result.current.open());

    expect(view.result.current.active).toBe(false);
    expect(readSession(view.result.current.sessionId)).toBeNull();
  });

  it("answers a window's hello with the current source", async () => {
    const { view } = openHost("flowchart TD\n  A-->B");
    const { sessionId } = view.result.current;
    const tab = otherTab();

    tab.post({ type: "hello", sessionId });
    await until(() => tab.received.some((message) => message.type === "state"));

    const state = tab.received.find((message) => message.type === "state");
    expect(state).toMatchObject({ code: "flowchart TD\n  A-->B" });
    expect(view.result.current.active).toBe(true);
  });

  it("applies an edit to the note and acknowledges it", async () => {
    const { view, onChange } = openHost();
    const { sessionId } = view.result.current;
    const tab = otherTab();

    tab.post({ type: "edit", sessionId, code: "flowchart LR\n  A-->C" });
    await until(() => onChange.mock.calls.length > 0);

    expect(onChange).toHaveBeenCalledWith("flowchart LR\n  A-->C");
    // The stored copy moves with the note, so a refreshed window recovers the
    // edit rather than the text it was opened on.
    expect(readSession(sessionId)?.code).toBe("flowchart LR\n  A-->C");
    expect(tab.received.some((message) => message.type === "saved")).toBe(true);
  });

  it("ignores an edit meant for another diagram", async () => {
    const { onChange } = openHost();
    const tab = otherTab();

    tab.post({ type: "edit", sessionId: "someone-else", code: "graph TD" });
    await until(() => false, 60);

    expect(onChange).not.toHaveBeenCalled();
  });

  it("pushes a change made in the note out to the window", async () => {
    const { view } = openHost("flowchart TD\n  A-->B");
    const tab = otherTab();

    act(() => view.result.current.open());
    view.rerender({ code: "flowchart TD\n  A-->B\n  B-->C" });

    await until(() => tab.received.some((message) => message.type === "state"));
    expect(tab.received.find((message) => message.type === "state")).toMatchObject({
      code: "flowchart TD\n  A-->B\n  B-->C",
    });
  });

  it("does not echo an edit back to the window that made it", async () => {
    const { view, onChange } = openHost("flowchart TD");
    const { sessionId } = view.result.current;
    const tab = otherTab();

    act(() => view.result.current.open());
    tab.post({ type: "edit", sessionId, code: "flowchart LR" });
    await until(() => onChange.mock.calls.length > 0);

    // The note applies the edit, so the source prop now matches what the
    // window already has. Sending it back would fight the caret.
    const before = tab.received.filter((message) => message.type === "state").length;
    view.rerender({ code: "flowchart LR" });
    await until(() => false, 60);

    expect(tab.received.filter((message) => message.type === "state").length).toBe(before);
  });

  it("ends the session when editing is brought back", async () => {
    const { view, opened } = openHost();
    const { sessionId } = view.result.current;
    const tab = otherTab();

    act(() => view.result.current.open());
    act(() => view.result.current.bringBack());

    await until(() => tab.received.some((message) => message.type === "close"));

    expect(view.result.current.active).toBe(false);
    expect(readSession(sessionId)).toBeNull();
    expect(opened.close).toHaveBeenCalled();
    expect(tab.received.find((message) => message.type === "close")).toMatchObject({
      reason: "brought-back",
    });
  });

  it("stays closed when a window that was sent home keeps heartbeating", async () => {
    const { view } = openHost();
    const { sessionId } = view.result.current;
    const tab = otherTab();

    act(() => view.result.current.open());
    act(() => view.result.current.bringBack());

    // A window takes a moment to notice, and its next heartbeat used to put
    // the "editing in another tab" badge straight back on the block — with
    // the inline dialog refusing to open behind it.
    tab.post({ type: "alive", sessionId });
    await until(() => false, 80);

    expect(view.result.current.active).toBe(false);
  });

  it("ignores an edit from a window it has taken the diagram back from", async () => {
    const { view, onChange } = openHost();
    const { sessionId } = view.result.current;
    const tab = otherTab();

    act(() => view.result.current.open());
    act(() => view.result.current.bringBack());

    tab.post({ type: "edit", sessionId, code: "flowchart LR" });
    await until(() => false, 80);

    expect(onChange).not.toHaveBeenCalled();
  });

  it("says nothing when a diagram that never opened a window unmounts", async () => {
    const { view } = openHost();
    const tab = otherTab();

    // A note holding forty diagrams unmounts forty blocks when it closes.
    // None of them has a window, so none of them has anything to announce.
    view.unmount();
    await until(() => false, 80);

    expect(tab.received).toHaveLength(0);
  });

  it("tells the window when the diagram itself goes away", async () => {
    const { view } = openHost();
    const { sessionId } = view.result.current;
    const tab = otherTab();

    act(() => view.result.current.open());
    view.unmount();

    await until(() => tab.received.some((message) => message.type === "close"));
    expect(tab.received.find((message) => message.type === "close")).toMatchObject({
      sessionId,
      reason: "gone",
    });
  });
});

describe("a browser that cannot pair two windows", () => {
  /**
   * Some privacy modes expose `BroadcastChannel` and then refuse to construct
   * one. The feature cannot work there, so it must not be offered — and a
   * window opened by hand must not sit on "connecting" while it saves nowhere.
   */
  function withoutChannel(run: () => void): void {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "BroadcastChannel");
    delete (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel;
    resetDiagramChannel();

    try {
      run();
    } finally {
      if (descriptor) Object.defineProperty(globalThis, "BroadcastChannel", descriptor);
      resetDiagramChannel();
    }
  }

  it("withdraws the offer", () => {
    withoutChannel(() => {
      expect(diagramPopoutSupported()).toBe(false);

      const view = renderHook(() => useDiagramPopoutHost({ code: "graph TD", onChange: () => {} }));
      expect(view.result.current.supported).toBe(false);
    });
  });

  it("tells a window opened anyway that there is nothing to save to", () => {
    withoutChannel(() => {
      writeSession("s1", { code: "graph TD", title: "T" });

      const view = renderHook(() => useDiagramPopoutSession("s1"));

      expect(view.result.current.status).toBe("finished");
      expect(view.result.current.ready).toBe(true);
      // The stored copy still opens, so the source is not lost.
      expect(view.result.current.code).toBe("graph TD");
    });
  });
});

describe("the window's side", () => {
  it("shows the stored source before anyone answers", () => {
    writeSession("s1", { code: "flowchart TD\n  A-->B", title: "Flow" });

    const view = renderHook(() => useDiagramPopoutSession("s1"));

    expect(view.result.current.code).toBe("flowchart TD\n  A-->B");
    expect(view.result.current.title).toBe("Flow");
    expect(view.result.current.status).toBe("connecting");
  });

  it("is not ready before the session id resolves", async () => {
    writeSession("s1", { code: "flowchart TD\n  A-->B", title: "Flow" });

    // The route reads the id from the query string, which is empty on the
    // first client pass. Reporting readiness there mounted the studio on an
    // empty source — and an empty source means "new diagram", so it opened
    // the type picker over a diagram that already existed.
    const view = renderHook(({ id }: { id: string | null }) => useDiagramPopoutSession(id), {
      initialProps: { id: null as string | null },
    });

    expect(view.result.current.ready).toBe(false);

    view.rerender({ id: "s1" });

    expect(view.result.current.ready).toBe(true);
    expect(view.result.current.code).toBe("flowchart TD\n  A-->B");
  });

  it("announces itself and adopts the note's source", async () => {
    const tab = otherTab();
    const view = renderHook(() => useDiagramPopoutSession("s1"));

    await until(() => tab.received.some((message) => message.type === "hello"));

    tab.post({ type: "state", sessionId: "s1", code: "sequenceDiagram", title: "Seq" });
    await until(() => view.result.current.status === "linked");

    expect(view.result.current.code).toBe("sequenceDiagram");
    expect(view.result.current.title).toBe("Seq");
  });

  it("posts each edit and stores it before it leaves", async () => {
    const tab = otherTab();
    const view = renderHook(() => useDiagramPopoutSession("s1"));

    act(() => view.result.current.setCode("flowchart LR\n  A-->B"));
    await until(() => tab.received.some((message) => message.type === "edit"));

    expect(tab.received.find((message) => message.type === "edit")).toMatchObject({
      code: "flowchart LR\n  A-->B",
    });
    expect(readSession("s1")?.code).toBe("flowchart LR\n  A-->B");
    // Unsaved until the note says otherwise — the indicator never claims a
    // save that has not been acknowledged.
    expect(view.result.current.dirty).toBe(true);
  });

  it("reports a save only once the note confirms it", async () => {
    const tab = otherTab();
    const view = renderHook(() => useDiagramPopoutSession("s1"));

    act(() => view.result.current.setCode("graph TD"));
    tab.post({ type: "saved", sessionId: "s1", at: 1_700_000_000_000 });
    await until(() => view.result.current.dirty === false);

    expect(view.result.current.savedAt).toBe(1_700_000_000_000);
  });

  it("gives the note longer than one heartbeat to answer", async () => {
    vi.useFakeTimers();

    try {
      const view = renderHook(() => useDiagramPopoutSession("s1"));

      act(() => {
        vi.advanceTimersByTime(4_000);
      });

      // Two heartbeats in, silence is not yet evidence of anything.
      expect(view.result.current.status).toBe("connecting");
      expect(view.result.current.ready).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("gives up waiting once the note is declared silent", async () => {
    // No stored copy and no answer: the window has to become usable eventually,
    // and the honest thing to show is an empty canvas that says it is not
    // saving anywhere — not a spinner that never resolves.
    vi.useFakeTimers();

    try {
      const view = renderHook(() => useDiagramPopoutSession("s1"));
      expect(view.result.current.ready).toBe(false);

      act(() => {
        vi.advanceTimersByTime(10_000);
      });

      expect(view.result.current.ready).toBe(true);
      expect(view.result.current.status).toBe("detached");
    } finally {
      vi.useRealTimers();
    }
  });

  it("finishes when the note takes editing back", async () => {
    const tab = otherTab();
    const view = renderHook(() => useDiagramPopoutSession("s1"));

    tab.post({ type: "close", sessionId: "s1", reason: "brought-back" });
    await until(() => view.result.current.status === "finished");

    expect(view.result.current.reason).toBe("brought-back");
  });

  it("keeps a keystroke typed while the note's state was in flight", async () => {
    writeSession("s1", { code: "graph TD", title: "T" });
    const tab = otherTab();
    const view = renderHook(() => useDiagramPopoutSession("s1"));

    act(() => view.result.current.setCode("graph TD\n  A-->B"));
    // The note answering the initial hello with what it had a moment ago must
    // not undo what has been typed since.
    tab.post({ type: "state", sessionId: "s1", code: "graph TD\n  A-->B", title: "T" });
    await until(() => view.result.current.status === "linked");

    expect(view.result.current.code).toBe("graph TD\n  A-->B");
  });
});
