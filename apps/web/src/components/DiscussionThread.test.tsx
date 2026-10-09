// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { DiscussionCommentDto, NoteDiscussionDto } from "@forkleaf/github-client";
import { Composer, ThreadMessages } from "./DiscussionThread";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

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

function discussion(
  comments: DiscussionCommentDto[],
  extra: Partial<NoteDiscussionDto> = {},
): NoteDiscussionDto {
  return {
    id: "D_1",
    number: 1,
    title: "t",
    url: "https://github.com/me/notes/discussions/1",
    locked: false,
    category: "Q&A",
    answerable: true,
    body: "How do we rotate keys?\n\n<!-- forkleaf:note a.md -->",
    author: { login: "ada", avatarUrl: "", url: "" },
    createdAt: "2026-10-01T09:00:00Z",
    viewerDidAuthor: false,
    notePath: null,
    comments,
    commentCount: comments.length,
    ...extra,
  };
}

describe("ThreadMessages — answers", () => {
  it("offers to mark an answer only where GitHub allows it", () => {
    const onAnswer = vi.fn().mockResolvedValue(null);
    render(
      <ThreadMessages
        discussion={discussion([message("a", { canMarkAnswer: true }), message("b")])}
        onAnswer={onAnswer}
      />,
    );
    expect(screen.getAllByRole("button", { name: "Mark as answer" })).toHaveLength(1);
  });

  it("offers nothing in a category that takes no answers", () => {
    render(
      <ThreadMessages
        discussion={discussion([message("a", { canMarkAnswer: true })], { answerable: false })}
        onAnswer={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "Mark as answer" })).toBeNull();
  });

  it("marks, and unmarks the current answer", async () => {
    const onAnswer = vi.fn().mockResolvedValue(null);
    render(
      <ThreadMessages
        discussion={discussion([
          message("a", { canMarkAnswer: true }),
          message("b", { isAnswer: true, canUnmarkAnswer: true }),
        ])}
        onAnswer={onAnswer}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Mark as answer" }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Unmark answer" }));
    });

    expect(onAnswer.mock.calls.map(([c, v]) => [c.id, v])).toEqual([
      ["a", true],
      ["b", false],
    ]);
  });

  it("says why an answer could not be marked", async () => {
    render(
      <ThreadMessages
        discussion={discussion([message("a", { canMarkAnswer: true })])}
        onAnswer={vi.fn().mockResolvedValue("Only the author can do that.")}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Mark as answer" }));
    });
    expect(screen.getByRole("alert").textContent).toBe("Only the author can do that.");
  });
});

describe("ThreadMessages — reading", () => {
  it("draws the line above the first message from somebody else since the last visit", () => {
    render(
      <ThreadMessages
        discussion={discussion([
          message("old", { createdAt: "2026-10-01T10:00:00Z" }),
          message("mine", { createdAt: "2026-10-03T10:00:00Z", viewerDidAuthor: true }),
          message("new", {
            createdAt: "2026-10-02T10:00:00Z",
            replies: [message("newer", { createdAt: "2026-10-04T10:00:00Z" })],
          }),
        ])}
        since="2026-10-01T12:00:00Z"
      />,
    );

    const line = screen.getByRole("separator", { name: "New since you were last here" });
    const items = [...document.querySelectorAll("li")];
    const lineAt = items.indexOf(line as HTMLLIElement);
    const newAt = items.findIndex((li) => li.textContent?.includes("message new"));
    expect(lineAt).toBe(newAt - 1);
    expect(screen.getAllByRole("separator")).toHaveLength(1);
  });

  it("draws no line when nothing is new", () => {
    render(<ThreadMessages discussion={discussion([message("a")])} since="2026-10-05T00:00:00Z" />);
    expect(screen.queryByRole("separator")).toBeNull();
  });

  it("shows the opening post of a thread started on GitHub, without ForkLeaf's marker", () => {
    render(<ThreadMessages discussion={discussion([message("a")])} showOpening />);
    const opening = screen.getByRole("article", { name: "Opening post" });
    expect(opening.textContent).toContain("How do we rotate keys?");
    expect(opening.innerHTML).not.toContain("forkleaf:note");
  });

  it("leaves the opening post out when asked to", () => {
    render(<ThreadMessages discussion={discussion([message("a")])} />);
    expect(screen.queryByRole("article", { name: "Opening post" })).toBeNull();
  });
});

describe("Composer", () => {
  it("focuses when Reply is pressed elsewhere", () => {
    const { rerender } = render(
      <Composer onSend={vi.fn()} replyTo={null} onCancelReply={vi.fn()} focusKey={0} />,
    );
    expect(document.activeElement).not.toBe(screen.getByRole("textbox"));
    rerender(
      <Composer onSend={vi.fn()} replyTo={message("a")} onCancelReply={vi.fn()} focusKey={1} />,
    );
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Reply" }));
  });

  it("shows itself as sending while its own send is in flight", async () => {
    let finish: (value: string | null) => void = () => {};
    const onSend = vi.fn(() => new Promise<string | null>((resolve) => (finish = resolve)));
    render(<Composer onSend={onSend} replyTo={null} onCancelReply={vi.fn()} />);

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "hi" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(screen.getByRole("button", { name: "Sending…" })).toBeTruthy();

    await act(async () => finish(null));
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("");
  });
});

describe("ThreadMessages — links to notes", () => {
  const links = {
    resolve: (link: { target: string }) =>
      link.target === "runbook"
        ? { href: "/editor?note=ops/runbook.md", exists: true, title: "ops/runbook.md" }
        : { href: "#missing", exists: false, title: "No note" },
    open: vi.fn(),
  };

  it("opens the note a [[link]] in a message names", () => {
    render(
      <ThreadMessages
        discussion={discussion([message("a", { body: "See [[runbook]] and [[nowhere]]." })])}
        links={links as never}
      />,
    );
    const found = screen.getByRole("link", { name: "runbook" });
    expect(found.getAttribute("href")).toBe("/editor?note=ops/runbook.md");
    expect(found.className).toContain("fl-wikilink-found");
    expect(screen.getByRole("link", { name: "nowhere" }).className).toContain(
      "fl-wikilink-missing",
    );

    fireEvent.click(found);
    expect(links.open).toHaveBeenCalledWith("runbook");
  });

  it("leaves ordinary links alone", () => {
    render(
      <ThreadMessages
        discussion={discussion([message("a", { body: "[docs](https://example.com)" })])}
        links={links as never}
      />,
    );
    fireEvent.click(screen.getByRole("link", { name: "docs" }));
    expect(links.open).not.toHaveBeenCalled();
  });
});
