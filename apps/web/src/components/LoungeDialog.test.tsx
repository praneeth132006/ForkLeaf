// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type {
  DiscussionCommentDto,
  DiscussionRepoDto,
  NoteDiscussionDto,
  ThreadSummaryDto,
} from "@forkleaf/github-client";
import type { Lounge } from "@/hooks/useLounge";
import { LoungeDialog } from "./LoungeDialog";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const general = { id: "C_gen", name: "General", slug: "general", emoji: "💬", answerable: false };
const qa = { id: "C_qa", name: "Q&A", slug: "q-a", emoji: "🙏", answerable: true };
const polls = { id: "C_poll", name: "Polls", slug: "polls", emoji: "🗳️", answerable: false };

const repo: DiscussionRepoDto = {
  id: "R_1",
  url: "https://github.com/me/notes",
  private: true,
  enabled: true,
  canComment: true,
  categories: [general, qa, polls],
};

function summary(number: number, extra: Partial<ThreadSummaryDto> = {}): ThreadSummaryDto {
  return {
    id: `D_${number}`,
    number,
    title: `Thread ${number}`,
    url: "",
    category: general,
    author: null,
    createdAt: "2026-10-01T00:00:00Z",
    lastActivityAt: new Date(Date.now() - 3_600_000).toISOString(),
    lastByViewer: false,
    commentCount: 2,
    answered: false,
    locked: false,
    notePath: null,
    ...extra,
  };
}

function message(id: string, extra: Partial<DiscussionCommentDto> = {}): DiscussionCommentDto {
  return {
    id,
    author: { login: `user-${id}`, avatarUrl: "", url: "" },
    body: `message ${id}`,
    createdAt: "2026-10-01T10:00:00Z",
    url: "",
    isAnswer: false,
    isMinimized: false,
    viewerDidAuthor: false,
    replies: [],
    replyCount: 0,
    canMarkAnswer: false,
    canUnmarkAnswer: false,
    ...extra,
  };
}

function discussion(extra: Partial<NoteDiscussionDto> = {}): NoteDiscussionDto {
  return {
    id: "D_5",
    number: 5,
    title: "Thread 5",
    url: "https://github.com/me/notes/discussions/5",
    locked: false,
    category: "Q&A",
    answerable: true,
    body: "How do we rotate keys?",
    author: { login: "ada", avatarUrl: "", url: "" },
    createdAt: "2026-10-01T09:00:00Z",
    viewerDidAuthor: false,
    notePath: null,
    comments: [message("a", { canMarkAnswer: true })],
    commentCount: 1,
    ...extra,
  };
}

function fakeLounge(extra: Partial<Lounge> = {}): Lounge {
  const threads = [summary(5, { category: qa }), summary(6, { notePath: "ops/runbook.md" })];
  return {
    list: { key: "k", status: "ready", repo, threads, nextCursor: null, error: null },
    threads,
    unread: new Set([6]),
    channel: null,
    setChannel: vi.fn(),
    filter: "all",
    setFilter: vi.fn(),
    selected: null,
    select: vi.fn(),
    thread: { key: null, status: "loading", discussion: null, error: null },
    since: null,
    loadMore: vi.fn().mockResolvedValue(undefined),
    loadingMore: false,
    reply: vi.fn().mockResolvedValue(null),
    setAnswer: vi.fn().mockResolvedValue(null),
    start: vi.fn().mockResolvedValue(null),
    refresh: vi.fn(),
    ...extra,
  } as Lounge;
}

function setup(lounge: Lounge) {
  const onOpenNote = vi.fn();
  const onSaveAsNote = vi.fn();
  const onClose = vi.fn();
  render(
    <LoungeDialog
      lounge={lounge}
      repoName="me/notes"
      onClose={onClose}
      onOpenNote={onOpenNote}
      onSaveAsNote={onSaveAsNote}
    />,
  );
  return { onOpenNote, onSaveAsNote, onClose };
}

const opened = (extra: Partial<NoteDiscussionDto> = {}, lounge: Partial<Lounge> = {}) =>
  fakeLounge({
    selected: 5,
    thread: { key: "t", status: "ready", discussion: discussion(extra), error: null },
    ...lounge,
  });

describe("LoungeDialog — states", () => {
  it("says it is opening before the first read", () => {
    setup(
      fakeLounge({
        list: {
          key: "k",
          status: "loading",
          repo: null,
          threads: [],
          nextCursor: null,
          error: null,
        },
        threads: [],
      }),
    );
    expect(screen.getByText("Opening the Lounge…")).toBeTruthy();
  });

  it("shows a failed first read with a way to try again", () => {
    const lounge = fakeLounge({
      list: {
        key: "k",
        status: "error",
        repo: null,
        threads: [],
        nextCursor: null,
        error: { code: "discussions-forbidden", message: "GitHub did not let ForkLeaf." },
      },
      threads: [],
    });
    setup(lounge);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByText("GitHub did not let ForkLeaf.")).toBeTruthy();
    expect(lounge.refresh).toHaveBeenCalled();
  });

  it("explains how to turn Discussions on", () => {
    setup(
      fakeLounge({
        list: {
          key: "k",
          status: "ready",
          repo: { ...repo, enabled: false },
          threads: [],
          nextCursor: null,
          error: null,
        },
      }),
    );
    expect(screen.getByRole("link", { name: /Open settings/ }).getAttribute("href")).toBe(
      "https://github.com/me/notes/settings",
    );
  });
});

describe("LoungeDialog — channels and threads", () => {
  it("lists channels with their unread counts", () => {
    setup(fakeLounge());
    const channels = screen.getByRole("navigation", { name: "Channels" });
    const names = within(channels)
      .getAllByRole("button")
      .map((b) => b.textContent);
    expect(names).toEqual([
      "#All threads1",
      "?Unanswered",
      "💬General1",
      "🙏Q&A",
      "🗳️Polls",
      "New thread",
    ]);
  });

  it("switches channel, and to unanswered questions", () => {
    const lounge = fakeLounge();
    setup(lounge);

    const channels = screen.getByRole("navigation", { name: "Channels" });
    fireEvent.click(within(channels).getByRole("button", { name: /Q&A/ }));
    expect(lounge.setChannel).toHaveBeenLastCalledWith("C_qa");
    expect(lounge.setFilter).toHaveBeenLastCalledWith("all");

    fireEvent.click(within(channels).getByRole("button", { name: /Unanswered/ }));
    expect(lounge.setChannel).toHaveBeenLastCalledWith(null);
    expect(lounge.setFilter).toHaveBeenLastCalledWith("unanswered");
  });

  it("lists threads, unread ones marked, notes flagged", () => {
    setup(fakeLounge());
    const list = screen.getByRole("region", { name: "Threads" });
    const items = within(list).getAllByRole("button");
    expect(items[0]?.textContent).toContain("Thread 5");
    expect(items[0]?.textContent).not.toContain("(unread)");
    expect(items[1]?.textContent).toContain("Thread 6 (unread)");
    expect(items[1]?.textContent).toContain("📝 Note");
  });

  it("opens a thread", () => {
    const lounge = fakeLounge();
    setup(lounge);
    fireEvent.click(screen.getByRole("button", { name: /Thread 5/ }));
    expect(lounge.select).toHaveBeenCalledWith(5);
  });

  it("loads older threads", () => {
    const lounge = fakeLounge({
      list: { ...fakeLounge().list, nextCursor: "C1" },
    });
    setup(lounge);
    fireEvent.click(screen.getByRole("button", { name: "Older threads" }));
    expect(lounge.loadMore).toHaveBeenCalled();
  });

  it("says when every question has an answer", () => {
    setup(fakeLounge({ filter: "unanswered", threads: [] }));
    expect(screen.getByText("Every question has an answer.")).toBeTruthy();
  });
});

describe("LoungeDialog — a thread", () => {
  it("shows the opening question of a thread started on GitHub, and replies", async () => {
    const lounge = opened();
    setup(lounge);

    expect(screen.getByRole("article", { name: "Opening post" }).textContent).toContain(
      "How do we rotate keys?",
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Message" }), {
      target: { value: "Monthly." },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Send" }));
    });
    expect(lounge.reply).toHaveBeenCalledWith("Monthly.", undefined);
  });

  it("marks an answer", async () => {
    const lounge = opened();
    setup(lounge);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Mark as answer" }));
    });
    expect(lounge.setAnswer).toHaveBeenCalledWith("a", true);
  });

  it("opens the note a thread is about, and saves a thread as a note", () => {
    const lounge = opened({ notePath: "ops/runbook.md" });
    const { onOpenNote, onSaveAsNote } = setup(lounge);

    expect(screen.queryByRole("article", { name: "Opening post" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Open note" }));
    fireEvent.click(screen.getByRole("button", { name: "Save as note" }));

    expect(onOpenNote).toHaveBeenCalledWith("ops/runbook.md");
    expect(onSaveAsNote.mock.calls[0]?.[0].number).toBe(5);
  });

  it("does not offer to write in a locked thread", () => {
    setup(opened({ locked: true }));
    expect(screen.getByText("This thread has been locked on GitHub.")).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("goes back to the list", () => {
    const lounge = opened();
    setup(lounge);
    fireEvent.click(screen.getByRole("button", { name: "Back to threads" }));
    expect(lounge.select).toHaveBeenCalledWith(null);
  });
});

describe("LoungeDialog — a new thread", () => {
  it("starts one in the chosen channel, never offering Polls", async () => {
    const lounge = fakeLounge({ channel: "C_qa" });
    setup(lounge);

    fireEvent.click(screen.getByRole("button", { name: "New thread" }));
    const channel = screen.getByRole("combobox", { name: "Channel" }) as HTMLSelectElement;
    expect([...channel.options].map((o) => o.textContent)).toEqual([
      "💬 General",
      "🙏 Q&A — takes answers",
    ]);
    expect(channel.value).toBe("C_qa");

    fireEvent.change(screen.getByRole("textbox", { name: "Title" }), {
      target: { value: " Rotating keys " },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Message" }), {
      target: { value: "How often?" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Start thread" }));
    });

    expect(lounge.start).toHaveBeenCalledWith({
      categoryId: "C_qa",
      title: "Rotating keys",
      body: "How often?",
    });
  });

  it("will not start one without a title and a message", () => {
    setup(fakeLounge());
    fireEvent.click(screen.getByRole("button", { name: "New thread" }));
    expect(
      (screen.getByRole("button", { name: "Start thread" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("keeps what was written and says why it did not start", async () => {
    const lounge = fakeLounge({
      start: vi
        .fn()
        .mockResolvedValue({ code: "forbidden", message: "Only maintainers post here." }),
    });
    setup(lounge);
    fireEvent.click(screen.getByRole("button", { name: "New thread" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Title" }), { target: { value: "T" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Message" }), { target: { value: "B" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Start thread" }));
    });

    expect(screen.getByRole("alert").textContent).toBe("Only maintainers post here.");
    expect((screen.getByRole("textbox", { name: "Title" }) as HTMLInputElement).value).toBe("T");
  });

  it("is not offered to somebody who cannot write", () => {
    setup(
      fakeLounge({
        list: { ...fakeLounge().list, repo: { ...repo, canComment: false } },
      }),
    );
    expect(screen.queryByRole("button", { name: "New thread" })).toBeNull();
  });
});

describe("LoungeDialog — passages", () => {
  it("marks passage threads in the list", () => {
    const threads = [summary(7, { notePath: "a.md", quote: "Rotate keys" })];
    setup(fakeLounge({ threads, list: { ...fakeLounge().list, threads } }));
    expect(screen.getByRole("region", { name: "Threads" }).textContent).toContain("❝ Passage");
  });

  it("quotes the passage above its thread", () => {
    setup(opened({ notePath: "a.md", quote: "Rotate keys monthly." }));
    expect(screen.getByRole("blockquote", { name: "The passage" }).textContent).toBe(
      "Rotate keys monthly.",
    );
  });
});

describe("LoungeDialog — live", () => {
  it("shows the bell beside New thread, saying it is live", () => {
    const onClose = vi.fn();
    render(
      <LoungeDialog
        lounge={fakeLounge()}
        repoName="me/notes"
        onClose={onClose}
        onOpenNote={vi.fn()}
        onSaveAsNote={vi.fn()}
        notify={{ live: "live", mode: "all", permission: "granted", onChange: vi.fn() }}
      />,
    );
    const channels = screen.getByRole("navigation", { name: "Channels" });
    expect(
      within(channels).getByRole("button", { name: /Notifications and live updates — live/ }),
    ).toBeTruthy();
    expect(channels.textContent).toContain("Live");
  });
});
