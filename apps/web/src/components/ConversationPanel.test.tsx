// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type {
  DiscussionCommentDto,
  DiscussionRepoDto,
  NoteDiscussionDto,
} from "@forkleaf/github-client";
import type { ConversationState } from "@/hooks/useNoteConversation";
import { ConversationPanel, type ConversationPanelProps } from "./ConversationPanel";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const repo: DiscussionRepoDto = {
  id: "R_1",
  url: "https://github.com/me/notes",
  private: true,
  enabled: true,
  canComment: true,
  categories: [],
};

function message(id: string, extra: Partial<DiscussionCommentDto> = {}): DiscussionCommentDto {
  return {
    id,
    author: {
      login: `user-${id}`,
      avatarUrl: "https://avatars/x",
      url: `https://github.com/${id}`,
    },
    body: `message ${id}`,
    createdAt: new Date(Date.now() - 60_000).toISOString(),
    url: `https://github.com/me/notes/discussions/4#${id}`,
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

function discussion(comments: DiscussionCommentDto[], extra: Partial<NoteDiscussionDto> = {}) {
  return {
    id: "D_4",
    number: 4,
    title: "A",
    url: "https://github.com/me/notes/discussions/4",
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
    ...extra,
  };
}

function ready(d: NoteDiscussionDto | null, r: DiscussionRepoDto = repo): ConversationState {
  return { status: "ready", conversation: { repo: r, discussion: d }, error: null };
}

function setup(props: Partial<ConversationPanelProps> = {}) {
  const send = vi.fn().mockResolvedValue(null);
  const refresh = vi.fn();
  const onClose = vi.fn();
  render(
    <ConversationPanel
      repoName="me/notes"
      state={ready(discussion([]))}
      sending={false}
      send={send}
      refresh={refresh}
      onClose={onClose}
      {...props}
    />,
  );
  return { send, refresh, onClose };
}

describe("ConversationPanel — what it shows", () => {
  it("says why there is no conversation, and offers nothing to type into", () => {
    setup({ unavailable: "Connect a GitHub repository to talk about notes." });
    expect(screen.getByText("Connect a GitHub repository to talk about notes.")).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("shows loading before the first read", () => {
    setup({ state: { status: "loading", conversation: null, error: null } });
    expect(screen.getByText("Loading the conversation…")).toBeTruthy();
  });

  it("shows a failed first read with a way to try again", () => {
    const { refresh } = setup({
      state: {
        status: "error",
        conversation: null,
        error: { code: "discussions-forbidden", message: "GitHub did not let ForkLeaf." },
      },
    });
    expect(screen.getByText("GitHub did not let ForkLeaf.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refresh).toHaveBeenCalled();
  });

  it("explains how to turn Discussions on when it is off", () => {
    setup({ state: ready(null, { ...repo, enabled: false, canComment: false }) });
    expect(screen.getByText(/switched off for me\/notes/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Open settings/ }).getAttribute("href")).toBe(
      "https://github.com/me/notes/settings",
    );
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("invites the first message when nobody has started a conversation", () => {
    setup({ state: ready(null) });
    expect(screen.getByText("No messages about this note yet.")).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Message" })).toBeTruthy();
  });

  it("warns that a public repository's conversation is public", () => {
    setup({ state: ready(null, { ...repo, private: false }) });
    expect(screen.getByText(/anyone can read this conversation/)).toBeTruthy();
  });

  it("renders messages and their replies, with a link to the discussion", () => {
    setup({
      state: ready(
        discussion([
          message("a", { replies: [message("a1")], replyCount: 1, isAnswer: true }),
          message("b"),
        ]),
      ),
    });
    expect(screen.getByText("message a")).toBeTruthy();
    expect(screen.getByText("message a1")).toBeTruthy();
    expect(screen.getByText("Answer")).toBeTruthy();
    expect(screen.getByRole("link", { name: "#4 ↗" }).getAttribute("href")).toBe(
      "https://github.com/me/notes/discussions/4",
    );
  });

  it("points at GitHub for messages too old to have been read", () => {
    setup({
      state: ready(
        discussion([message("a", { replies: [message("a9")], replyCount: 5 })], {
          commentCount: 60,
        }),
      ),
    });
    expect(screen.getByText(/59 earlier messages on GitHub/)).toBeTruthy();
    expect(screen.getByText(/4 earlier replies on GitHub/)).toBeTruthy();
  });

  it("renders a message as sanitised Markdown — somebody else's text cannot run script", () => {
    setup({
      state: ready(
        discussion([
          message("x", {
            body: '**bold** <img src=x onerror="window.pwned=1"> <script>window.pwned=1</script>',
          }),
        ]),
      ),
    });
    const article = screen.getByText("bold").closest("article")!;
    expect(article.querySelector("strong")).toBeTruthy();
    expect(article.querySelector("script")).toBeNull();
    expect(article.innerHTML).not.toContain("onerror");
  });

  it("keeps a hidden message folded until asked", () => {
    setup({ state: ready(discussion([message("h", { isMinimized: true })])) });
    expect(screen.queryByText("message h")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Hidden by a maintainer/ }));
    expect(screen.getByText("message h")).toBeTruthy();
  });

  it("does not offer to write in a locked conversation", () => {
    setup({ state: ready(discussion([message("a")], { locked: true })) });
    expect(screen.getByText("This conversation has been locked on GitHub.")).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Reply" })).toBeNull();
  });

  it("does not offer to write to a repository the reader is not part of", () => {
    setup({ state: ready(discussion([message("a")]), { ...repo, canComment: false }) });
    expect(screen.getByText(/Only this repository's collaborators/)).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("keeps the conversation on screen when a later check fails", () => {
    setup({
      state: {
        status: "error",
        conversation: { repo, discussion: discussion([message("a")]) },
        error: { code: "network", message: "No connection to the server." },
      },
    });
    expect(screen.getByText("message a")).toBeTruthy();
    expect(screen.getByText(/Could not check for new messages/)).toBeTruthy();
  });
});

describe("ConversationPanel — writing", () => {
  it("sends with ⌘↵ and clears the box", async () => {
    const { send } = setup();
    const box = screen.getByRole("textbox", { name: "Message" }) as HTMLTextAreaElement;

    fireEvent.change(box, { target: { value: "  Is step 3 right?  " } });
    await act(async () => {
      fireEvent.keyDown(box, { key: "Enter", metaKey: true });
    });

    expect(send).toHaveBeenCalledWith("Is step 3 right?", undefined);
    expect(box.value).toBe("");
  });

  it("treats a plain Enter as a new line", () => {
    const { send } = setup();
    const box = screen.getByRole("textbox", { name: "Message" });
    fireEvent.change(box, { target: { value: "line" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(send).not.toHaveBeenCalled();
  });

  it("will not send an empty message, or one while another is sending", () => {
    setup();
    expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(true);
    cleanup();

    setup({ sending: true });
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "x" } });
    expect((screen.getByRole("button", { name: "Sending…" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("keeps the draft and says why when a message does not send", async () => {
    const { send } = setup();
    send.mockResolvedValue({ code: "locked", message: "This conversation has been locked." });
    const box = screen.getByRole("textbox") as HTMLTextAreaElement;

    fireEvent.change(box, { target: { value: "hello" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Send" }));
    });

    expect(screen.getByRole("alert").textContent).toBe("This conversation has been locked.");
    expect(box.value).toBe("hello");
  });

  it("replies to a message, and can be talked out of it", async () => {
    const { send } = setup({ state: ready(discussion([message("a")])) });

    fireEvent.click(screen.getByRole("button", { name: "Reply" }));
    expect(screen.getByText("Replying to @user-a")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Cancel the reply" }));
    expect(screen.queryByText("Replying to @user-a")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Reply" }));
    const box = screen.getByRole("textbox", { name: "Reply" });
    fireEvent.change(box, { target: { value: "yes" } });
    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: "Reply" }).at(-1)!);
    });

    expect(send).toHaveBeenCalledWith("yes", "a");
    expect(screen.queryByText("Replying to @user-a")).toBeNull();
  });

  it("hides the panel", () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Hide panel" }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe("ConversationPanel — v2 actions", () => {
  it("saves the conversation as a note, and opens the Lounge", () => {
    const onSaveAsNote = vi.fn();
    const onOpenLounge = vi.fn();
    const d = discussion([message("a")]);
    setup({ state: ready(d), onSaveAsNote, onOpenLounge });

    fireEvent.click(screen.getByRole("button", { name: "Save this conversation as a note" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Every conversation in this notebook (the Lounge)" }),
    );

    expect(onSaveAsNote).toHaveBeenCalledWith(d);
    expect(onOpenLounge).toHaveBeenCalled();
  });

  it("does not offer to save a conversation with nothing in it", () => {
    setup({ state: ready(null), onSaveAsNote: vi.fn() });
    expect(screen.queryByRole("button", { name: "Save this conversation as a note" })).toBeNull();
  });

  it("marks an answer through the conversation", async () => {
    const setAnswer = vi.fn().mockResolvedValue(null);
    setup({
      state: ready(discussion([message("a", { canMarkAnswer: true })], { answerable: true })),
      setAnswer,
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Mark as answer" }));
    });
    expect(setAnswer).toHaveBeenCalledWith("a", true);
  });
});

describe("ConversationPanel — passages", () => {
  const passage = (number: number, quote: string, extra: Record<string, unknown> = {}) =>
    ({
      id: `D_${number}`,
      number,
      title: "t",
      url: "",
      category: { id: "C", name: "General", slug: "general" },
      author: null,
      createdAt: "2026-10-01T00:00:00Z",
      lastActivityAt: "2026-10-02T00:00:00Z",
      lastByViewer: false,
      commentCount: 2,
      answered: false,
      locked: false,
      notePath: "a.md",
      quote,
      ...extra,
    }) as never;

  it("lists the passages talked about, new ones marked, rewritten ones said so", () => {
    const onOpenPassage = vi.fn();
    const onShowPassage = vi.fn();
    setup({
      passages: [passage(8, "Rotate keys monthly"), passage(9, "Old wording", { answered: true })],
      passageUnread: new Set([8]),
      passageStatus: (quote) => (quote === "Old wording" ? "changed" : "here"),
      onOpenPassage,
      onShowPassage,
    });

    const list = screen.getByRole("region", { name: "Passages" });
    expect(list.textContent).toContain("Passages · 2");
    expect(list.textContent).toContain("New");
    expect(list.textContent).toContain("Passage changed since");
    // Only a passage still in the note can be shown in it.
    expect(screen.getAllByRole("button", { name: "Show in note" })).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: /Rotate keys monthly/ }));
    fireEvent.click(screen.getByRole("button", { name: "Show in note" }));
    expect((onOpenPassage.mock.calls[0]?.[0] as { number: number }).number).toBe(8);
    expect(onShowPassage).toHaveBeenCalledWith("Rotate keys monthly");
  });

  it("asks about a chosen passage, and starts its own thread", async () => {
    const sendPassage = vi.fn().mockResolvedValue(null);
    const onCancelPassage = vi.fn();
    setup({ pendingPassage: "Rotate keys monthly", sendPassage, onCancelPassage });

    expect(screen.getByText("Rotate keys monthly")).toBeTruthy();
    const box = screen.getByRole("textbox", { name: "Message" });
    expect(document.activeElement).toBe(box);

    fireEvent.change(box, { target: { value: "Still true?" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Send" }));
    });

    expect(sendPassage).toHaveBeenCalledWith("Rotate keys monthly", "Still true?");
    expect(onCancelPassage).toHaveBeenCalled();
  });

  it("lets a passage be talked about even when the note's own thread is locked", () => {
    setup({
      state: ready(discussion([message("a")], { locked: true })),
      pendingPassage: "Rotate keys",
      sendPassage: vi.fn(),
    });
    expect(screen.getByRole("textbox", { name: "Message" })).toBeTruthy();
  });

  it("can be talked out of a passage", () => {
    const onCancelPassage = vi.fn();
    setup({ pendingPassage: "Rotate keys", sendPassage: vi.fn(), onCancelPassage });
    fireEvent.click(screen.getByRole("button", { name: "Cancel the passage" }));
    expect(onCancelPassage).toHaveBeenCalled();
  });
});
