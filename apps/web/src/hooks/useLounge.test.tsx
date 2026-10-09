// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import type {
  DiscussionCommentDto,
  NoteDiscussionDto,
  ThreadSummaryDto,
} from "@forkleaf/github-client";
import { ApiGatewayError } from "@/lib/gateway";
import { markSeenUpTo, seenUpTo } from "@/lib/conversation";
import { LIST_POLL_MS, THREAD_POLL_MS, useLounge } from "./useLounge";

const listLounge = vi.fn();
const readLoungeThread = vi.fn();
const replyInThread = vi.fn();
const setThreadAnswer = vi.fn();
const startThread = vi.fn();

vi.mock("@/lib/gateway", async () => {
  const actual = await vi.importActual<typeof import("@/lib/gateway")>("@/lib/gateway");
  return {
    ...actual,
    listLounge: (...a: unknown[]) => listLounge(...a),
    readLoungeThread: (...a: unknown[]) => readLoungeThread(...a),
    replyInThread: (...a: unknown[]) => replyInThread(...a),
    setThreadAnswer: (...a: unknown[]) => setThreadAnswer(...a),
    startThread: (...a: unknown[]) => startThread(...a),
  };
});

const target = { owner: "me", repo: "notes" };
const repo = {
  id: "R_1",
  url: "https://github.com/me/notes",
  private: true,
  enabled: true,
  canComment: true,
  categories: [
    { id: "C_gen", name: "General", slug: "general", emoji: "💬", answerable: false },
    { id: "C_qa", name: "Q&A", slug: "q-a", emoji: "🙏", answerable: true },
  ],
};

function summary(number: number, extra: Partial<ThreadSummaryDto> = {}): ThreadSummaryDto {
  return {
    id: `D_${number}`,
    number,
    title: `Thread ${number}`,
    url: "",
    category: repo.categories[0]!,
    author: null,
    createdAt: "2026-10-01T00:00:00Z",
    lastActivityAt: "2026-10-01T00:00:00Z",
    lastByViewer: false,
    commentCount: 0,
    answered: false,
    locked: false,
    notePath: null,
    ...extra,
  };
}

function comment(id: string, createdAt: string): DiscussionCommentDto {
  return {
    id,
    author: { login: "ada", avatarUrl: "", url: "" },
    body: id,
    createdAt,
    url: "",
    isAnswer: false,
    isMinimized: false,
    viewerDidAuthor: false,
    replies: [],
    replyCount: 0,
    canMarkAnswer: true,
    canUnmarkAnswer: false,
  };
}

function discussion(number: number, comments: DiscussionCommentDto[] = []): NoteDiscussionDto {
  return {
    id: `D_${number}`,
    number,
    title: `Thread ${number}`,
    url: "",
    locked: false,
    category: "General",
    answerable: false,
    body: "Opening",
    author: null,
    createdAt: "2026-10-01T00:00:00Z",
    viewerDidAuthor: false,
    notePath: null,
    comments,
    commentCount: comments.length,
  };
}

async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

async function wait(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-09T12:00:00Z"));
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
  // The visibility spy, which would otherwise leave every later test hidden.
  vi.restoreAllMocks();
});

describe("useLounge — the list", () => {
  it("reads nothing while closed", async () => {
    renderHook(() => useLounge({ target, open: false }));
    await settle();
    expect(listLounge).not.toHaveBeenCalled();
  });

  it("lists threads, and sets the first-visit baseline", async () => {
    listLounge.mockResolvedValue({ repo, threads: [summary(1)], nextCursor: null });

    const { result } = renderHook(() => useLounge({ target, open: true }));
    expect(result.current.list.status).toBe("loading");
    await settle();

    expect(result.current.list.status).toBe("ready");
    expect(result.current.threads.map((t) => t.number)).toEqual([1]);
    expect(window.localStorage.getItem("forkleaf:lounge-since:me/notes")).toBe(
      "2026-10-09T12:00:00.000Z",
    );
  });

  it("does not call threads from before the first visit unread — only what came after", async () => {
    listLounge.mockResolvedValueOnce({ repo, threads: [summary(1)], nextCursor: null });

    const { result } = renderHook(() => useLounge({ target, open: true }));
    await settle();
    expect(result.current.unread.size).toBe(0);

    listLounge.mockResolvedValueOnce({
      repo,
      threads: [summary(2, { lastActivityAt: "2026-10-09T12:00:10Z" }), summary(1)],
      nextCursor: null,
    });
    await wait(LIST_POLL_MS);
    expect([...result.current.unread]).toEqual([2]);
  });

  it("reads one channel when asked", async () => {
    listLounge.mockResolvedValue({ repo, threads: [], nextCursor: null });

    const { result } = renderHook(() => useLounge({ target, open: true }));
    await settle();
    act(() => result.current.setChannel("C_qa"));
    await settle();

    expect(listLounge).toHaveBeenLastCalledWith({ owner: "me", repo: "notes", category: "C_qa" });
  });

  it("loads older pages and keeps them through the next poll", async () => {
    listLounge.mockResolvedValueOnce({ repo, threads: [summary(3), summary(2)], nextCursor: "C1" });

    const { result } = renderHook(() => useLounge({ target, open: true }));
    await settle();

    listLounge.mockResolvedValueOnce({ repo, threads: [summary(1)], nextCursor: null });
    await act(async () => {
      await result.current.loadMore();
    });
    expect(listLounge).toHaveBeenLastCalledWith({ owner: "me", repo: "notes", after: "C1" });
    expect(result.current.threads.map((t) => t.number)).toEqual([3, 2, 1]);
    expect(result.current.list.nextCursor).toBeNull();

    // A new thread arrives on top; the older page stays.
    listLounge.mockResolvedValueOnce({ repo, threads: [summary(4), summary(3)], nextCursor: "C9" });
    await wait(LIST_POLL_MS);
    expect(result.current.threads.map((t) => t.number)).toEqual([4, 3, 2, 1]);
  });

  it("shows only unanswered questions when asked", async () => {
    listLounge.mockResolvedValue({
      repo,
      threads: [
        summary(1),
        summary(2, { category: repo.categories[1]!, answered: true }),
        summary(3, { category: repo.categories[1]! }),
      ],
      nextCursor: null,
    });

    const { result } = renderHook(() => useLounge({ target, open: true }));
    await settle();
    act(() => result.current.setFilter("unanswered"));

    expect(result.current.threads.map((t) => t.number)).toEqual([3]);
  });

  it("stops asking after a refusal that will not change", async () => {
    listLounge.mockRejectedValue(new ApiGatewayError("discussions-forbidden", "No.", 403));

    const { result } = renderHook(() => useLounge({ target, open: true }));
    await settle();
    expect(result.current.list.error?.code).toBe("discussions-forbidden");

    await wait(LIST_POLL_MS * 5);
    expect(listLounge).toHaveBeenCalledTimes(1);
  });

  it("pauses while the tab is hidden", async () => {
    listLounge.mockResolvedValue({ repo, threads: [], nextCursor: null });
    let visibility: DocumentVisibilityState = "visible";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);

    renderHook(() => useLounge({ target, open: true }));
    await settle();
    visibility = "hidden";
    await wait(LIST_POLL_MS * 3);
    // The checks that came due while hidden asked GitHub nothing.
    expect(listLounge).toHaveBeenCalledTimes(1);

    visibility = "visible";
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(listLounge).toHaveBeenCalledTimes(2);
  });
});

describe("useLounge — a thread", () => {
  beforeEach(() => {
    listLounge.mockResolvedValue({
      repo,
      threads: [summary(5, { lastActivityAt: "2026-10-09T13:00:00Z" })],
      nextCursor: null,
    });
  });

  it("opens a thread, marks it read, and remembers where the news started", async () => {
    markSeenUpTo("me", "notes", 5, "2026-10-05T00:00:00Z");
    readLoungeThread.mockResolvedValue({
      repo,
      discussion: discussion(5, [comment("c1", "2026-10-09T13:00:00Z")]),
    });

    const { result } = renderHook(() => useLounge({ target, open: true }));
    await settle();
    act(() => result.current.select(5));
    await settle();

    expect(result.current.thread.discussion?.number).toBe(5);
    expect(result.current.since).toBe("2026-10-05T00:00:00Z");
    expect(seenUpTo("me", "notes", 5)).toBe("2026-10-09T13:00:00Z");
    expect(result.current.unread.has(5)).toBe(false);
  });

  it("re-reads the open thread every fifteen seconds", async () => {
    readLoungeThread.mockResolvedValue({ repo, discussion: discussion(5) });

    const { result } = renderHook(() => useLounge({ target, open: true }));
    await settle();
    act(() => result.current.select(5));
    await settle();
    expect(readLoungeThread).toHaveBeenCalledTimes(1);

    await wait(THREAD_POLL_MS);
    expect(readLoungeThread).toHaveBeenCalledTimes(2);
  });

  it("shows a reply at once", async () => {
    readLoungeThread.mockResolvedValue({ repo, discussion: discussion(5) });
    replyInThread.mockResolvedValue({ comment: comment("mine", "2026-10-09T14:00:00Z") });

    const { result } = renderHook(() => useLounge({ target, open: true }));
    await settle();
    act(() => result.current.select(5));
    await settle();

    let failure: unknown = "unset";
    await act(async () => {
      failure = await result.current.reply("hello");
    });

    expect(failure).toBeNull();
    expect(replyInThread).toHaveBeenCalledWith({
      owner: "me",
      repo: "notes",
      discussionId: "D_5",
      body: "hello",
    });
    expect(result.current.thread.discussion?.comments.map((c) => c.id)).toEqual(["mine"]);
  });

  it("marks an answer, then reads the thread and the list again", async () => {
    readLoungeThread.mockResolvedValue({ repo, discussion: discussion(5, [comment("c1", "x")]) });
    setThreadAnswer.mockResolvedValue(undefined);

    const { result } = renderHook(() => useLounge({ target, open: true }));
    await settle();
    act(() => result.current.select(5));
    await settle();
    const reads = readLoungeThread.mock.calls.length;
    const lists = listLounge.mock.calls.length;

    await act(async () => {
      await result.current.setAnswer("c1", true);
    });
    await settle();

    expect(setThreadAnswer).toHaveBeenCalledWith({
      owner: "me",
      repo: "notes",
      commentId: "c1",
      answer: true,
    });
    expect(readLoungeThread.mock.calls.length).toBe(reads + 1);
    expect(listLounge.mock.calls.length).toBe(lists + 1);
  });

  it("starts a thread and opens it", async () => {
    startThread.mockResolvedValue({ number: 9 });
    readLoungeThread.mockResolvedValue({ repo, discussion: discussion(9) });

    const { result } = renderHook(() => useLounge({ target, open: true }));
    await settle();

    let failure: unknown = "unset";
    await act(async () => {
      failure = await result.current.start({ categoryId: "C_qa", title: "Keys?", body: "How?" });
    });
    await settle();

    expect(failure).toBeNull();
    expect(startThread).toHaveBeenCalledWith({
      owner: "me",
      repo: "notes",
      repositoryId: "R_1",
      categoryId: "C_qa",
      title: "Keys?",
      body: "How?",
    });
    expect(result.current.selected).toBe(9);
    expect(result.current.thread.discussion?.number).toBe(9);
  });

  it("hands back why a reply did not go", async () => {
    readLoungeThread.mockResolvedValue({ repo, discussion: discussion(5) });
    replyInThread.mockRejectedValue(new ApiGatewayError("locked", "Locked.", 409));

    const { result } = renderHook(() => useLounge({ target, open: true }));
    await settle();
    act(() => result.current.select(5));
    await settle();

    let failure: unknown = null;
    await act(async () => {
      failure = await result.current.reply("hello");
    });
    expect(failure).toEqual({ code: "locked", message: "Locked." });
  });
});
