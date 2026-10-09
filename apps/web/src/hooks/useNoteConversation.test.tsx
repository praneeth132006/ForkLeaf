// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { NoteConversationDto } from "@forkleaf/github-client";
import { ApiGatewayError } from "@/lib/gateway";
import {
  POLL_ACTIVE_MS,
  POLL_IDLE_MS,
  useNoteConversation,
  type ConversationTarget,
} from "./useNoteConversation";

const readNoteConversation = vi.fn();
const sendNoteMessage = vi.fn();
const setThreadAnswer = vi.fn();

vi.mock("@/lib/gateway", async () => {
  const actual = await vi.importActual<typeof import("@/lib/gateway")>("@/lib/gateway");
  return {
    ...actual,
    readNoteConversation: (...args: unknown[]) => readNoteConversation(...args),
    sendNoteMessage: (...args: unknown[]) => sendNoteMessage(...args),
    setThreadAnswer: (...args: unknown[]) => setThreadAnswer(...args),
  };
});

const target: ConversationTarget = {
  owner: "me",
  repo: "notes",
  branch: "main",
  path: "a.md",
  title: "A",
};

const repo = {
  id: "R_1",
  url: "https://github.com/me/notes",
  private: true,
  enabled: true,
  canComment: true,
  categories: [],
};

function comment(id: string, createdAt: string, viewerDidAuthor = false) {
  return {
    id,
    author: { login: viewerDidAuthor ? "me" : "ada", avatarUrl: "", url: "" },
    body: id,
    createdAt,
    url: "",
    isAnswer: false,
    isMinimized: false,
    viewerDidAuthor,
    replies: [],
    replyCount: 0,
    canMarkAnswer: false,
    canUnmarkAnswer: false,
  };
}

function conversation(comments: ReturnType<typeof comment>[]): NoteConversationDto {
  return {
    repo,
    discussion: {
      id: "D_4",
      number: 4,
      title: "A",
      url: "",
      locked: false,
      category: "General",
      answerable: false,
      body: "",
      author: null,
      createdAt: "2026-10-01T00:00:00Z",
      viewerDidAuthor: false,
      notePath: null,
      comments,
      commentCount: comments.length,
    },
  };
}

/** Lets the pending promise chain settle inside fake time. */
async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("useNoteConversation", () => {
  it("does nothing without a note in a repository", async () => {
    renderHook(() => useNoteConversation({ target: null, active: true }));
    await settle();
    expect(readNoteConversation).not.toHaveBeenCalled();
  });

  it("reads the conversation and remembers which discussion it is", async () => {
    readNoteConversation.mockResolvedValue(conversation([]));

    const { result } = renderHook(() => useNoteConversation({ target, active: true }));
    expect(result.current.state.status).toBe("loading");
    await settle();

    expect(result.current.state.status).toBe("ready");
    expect(result.current.state.conversation?.discussion?.number).toBe(4);
    expect(readNoteConversation).toHaveBeenLastCalledWith({
      owner: "me",
      repo: "notes",
      path: "a.md",
      number: undefined,
    });

    // The next read passes the number back, so the server can skip the search.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_ACTIVE_MS);
    });
    expect(readNoteConversation).toHaveBeenLastCalledWith(expect.objectContaining({ number: 4 }));
  });

  it("asks every fifteen seconds on screen, and every minute off it", async () => {
    readNoteConversation.mockResolvedValue(conversation([]));

    const { rerender } = renderHook(({ active }) => useNoteConversation({ target, active }), {
      initialProps: { active: false },
    });
    await settle();
    expect(readNoteConversation).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_ACTIVE_MS);
    });
    expect(readNoteConversation).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_IDLE_MS - POLL_ACTIVE_MS);
    });
    expect(readNoteConversation).toHaveBeenCalledTimes(2);

    // Opening the conversation reads at once, then keeps the faster pace.
    rerender({ active: true });
    await settle();
    expect(readNoteConversation).toHaveBeenCalledTimes(3);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_ACTIVE_MS);
    });
    expect(readNoteConversation).toHaveBeenCalledTimes(4);
  });

  it("stops asking while the tab is hidden, and asks at once on return", async () => {
    readNoteConversation.mockResolvedValue(conversation([]));
    let visibility: DocumentVisibilityState = "visible";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);

    renderHook(() => useNoteConversation({ target, active: true }));
    await settle();
    expect(readNoteConversation).toHaveBeenCalledTimes(1);

    visibility = "hidden";
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_ACTIVE_MS * 4);
    });
    expect(readNoteConversation).toHaveBeenCalledTimes(1);

    visibility = "visible";
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(readNoteConversation).toHaveBeenCalledTimes(2);
  });

  it("gives up on a refusal that asking again will not fix", async () => {
    readNoteConversation.mockRejectedValue(
      new ApiGatewayError("discussions-forbidden", "Not allowed", 403),
    );

    const { result } = renderHook(() => useNoteConversation({ target, active: true }));
    await settle();
    expect(result.current.state).toMatchObject({
      status: "error",
      error: { code: "discussions-forbidden" },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_ACTIVE_MS * 10);
    });
    expect(readNoteConversation).toHaveBeenCalledTimes(1);
  });

  it("keeps what it read on screen when a later read fails", async () => {
    readNoteConversation
      .mockResolvedValueOnce(conversation([comment("c1", "2026-10-01T10:00:00Z")]))
      .mockRejectedValueOnce(new ApiGatewayError("network", "No connection to the server.", 0));

    const { result } = renderHook(() => useNoteConversation({ target, active: true }));
    await settle();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_ACTIVE_MS);
    });

    expect(result.current.state.status).toBe("error");
    expect(result.current.state.conversation?.discussion?.comments).toHaveLength(1);
  });

  it("counts unread messages only while the conversation is off screen", async () => {
    readNoteConversation.mockResolvedValue(
      conversation([
        comment("c1", "2026-10-01T10:00:00Z"),
        comment("c2", "2026-10-01T11:00:00Z", true),
      ]),
    );

    const { result, rerender } = renderHook(
      ({ active }) => useNoteConversation({ target, active }),
      { initialProps: { active: false } },
    );
    await settle();
    expect(result.current.unread).toBe(1);

    // Looking at it marks it read, and the badge stays gone afterwards.
    rerender({ active: true });
    await settle();
    expect(result.current.unread).toBe(0);
    rerender({ active: false });
    await settle();
    expect(result.current.unread).toBe(0);
  });

  it("never shows one note's conversation as another's", async () => {
    readNoteConversation.mockResolvedValueOnce(conversation([comment("c1", "2026-10-01")]));

    const { result, rerender } = renderHook(
      ({ path }) => useNoteConversation({ target: { ...target, path }, active: true }),
      { initialProps: { path: "a.md" } },
    );
    await settle();
    expect(result.current.state.conversation?.discussion).not.toBeNull();

    readNoteConversation.mockReturnValueOnce(new Promise(() => {}));
    rerender({ path: "b.md" });
    expect(result.current.state).toEqual({ status: "loading", conversation: null, error: null });
  });

  it("shows a sent message at once, without waiting for the next read", async () => {
    readNoteConversation.mockResolvedValue(conversation([]));
    sendNoteMessage.mockResolvedValue({
      number: 4,
      comment: comment("mine", "2026-10-02T00:00:00Z", true),
    });

    const { result } = renderHook(() => useNoteConversation({ target, active: true }));
    await settle();

    let failure: unknown = "unset";
    await act(async () => {
      failure = await result.current.send("hello");
    });

    expect(failure).toBeNull();
    expect(sendNoteMessage).toHaveBeenCalledWith({
      owner: "me",
      repo: "notes",
      branch: "main",
      path: "a.md",
      title: "A",
      body: "hello",
      number: 4,
    });
    expect(result.current.state.conversation?.discussion?.comments.map((c) => c.id)).toEqual([
      "mine",
    ]);
    expect(result.current.sending).toBe(false);
  });

  it("reads the new discussion straight after the first message opens it", async () => {
    readNoteConversation.mockResolvedValueOnce({ repo, discussion: null });
    sendNoteMessage.mockResolvedValue({
      number: 4,
      comment: comment("first", "2026-10-02T00:00:00Z", true),
    });

    const { result } = renderHook(() => useNoteConversation({ target, active: true }));
    await settle();
    expect(result.current.state.conversation?.discussion).toBeNull();

    readNoteConversation.mockResolvedValue(
      conversation([comment("first", "2026-10-02T00:00:00Z", true)]),
    );
    await act(async () => {
      await result.current.send("first");
    });
    await settle();

    expect(readNoteConversation).toHaveBeenCalledTimes(2);
    expect(readNoteConversation).toHaveBeenLastCalledWith(expect.objectContaining({ number: 4 }));
    expect(result.current.state.conversation?.discussion?.comments).toHaveLength(1);
  });

  it("hands back the reason a message was not sent", async () => {
    readNoteConversation.mockResolvedValue(conversation([]));
    sendNoteMessage.mockRejectedValue(
      new ApiGatewayError("locked", "This conversation has been locked on GitHub.", 409),
    );

    const { result } = renderHook(() => useNoteConversation({ target, active: true }));
    await settle();

    let failure: unknown = null;
    await act(async () => {
      failure = await result.current.send("hello");
    });
    expect(failure).toEqual({
      code: "locked",
      message: "This conversation has been locked on GitHub.",
    });
  });
});

describe("useNoteConversation — answers", () => {
  it("marks an answer and reads the conversation again", async () => {
    readNoteConversation.mockResolvedValue(conversation([comment("c1", "2026-10-01T10:00:00Z")]));
    setThreadAnswer.mockResolvedValue(undefined);

    const { result } = renderHook(() => useNoteConversation({ target, active: true }));
    await settle();

    let failure: unknown = "unset";
    await act(async () => {
      failure = await result.current.setAnswer("c1", true);
    });
    await settle();

    expect(failure).toBeNull();
    expect(setThreadAnswer).toHaveBeenCalledWith({
      owner: "me",
      repo: "notes",
      commentId: "c1",
      answer: true,
    });
    expect(readNoteConversation).toHaveBeenCalledTimes(2);
  });

  it("hands back why it could not", async () => {
    readNoteConversation.mockResolvedValue(conversation([]));
    setThreadAnswer.mockRejectedValue(new ApiGatewayError("discussions-forbidden", "No.", 403));

    const { result } = renderHook(() => useNoteConversation({ target, active: true }));
    await settle();

    let failure: unknown = null;
    await act(async () => {
      failure = await result.current.setAnswer("c1", true);
    });
    expect(failure).toEqual({ code: "discussions-forbidden", message: "No." });
  });
});
