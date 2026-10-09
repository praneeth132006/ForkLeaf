// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import type { DiscussionCommentDto, NoteDiscussionDto } from "@forkleaf/github-client";
import {
  countUnread,
  latestMessageAt,
  markSeenUpTo,
  rememberNumber,
  rememberedNumber,
  seenUpTo,
  withMessage,
} from "./conversation";

afterEach(() => window.localStorage.clear());

function message(id: string, createdAt: string, extra: Partial<DiscussionCommentDto> = {}) {
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
    ...extra,
  } satisfies DiscussionCommentDto;
}

function discussion(comments: DiscussionCommentDto[]): NoteDiscussionDto {
  return {
    id: "D_1",
    number: 1,
    title: "t",
    url: "",
    locked: false,
    category: "General",
    comments,
    commentCount: comments.length,
  };
}

const thread = discussion([
  message("a", "2026-10-01T10:00:00Z", {
    replies: [
      message("a1", "2026-10-01T12:00:00Z"),
      message("a2", "2026-10-01T13:00:00Z", { viewerDidAuthor: true }),
    ],
    replyCount: 2,
  }),
  message("b", "2026-10-01T11:00:00Z"),
]);

describe("latestMessageAt", () => {
  it("looks inside replies", () => {
    expect(latestMessageAt(thread)).toBe("2026-10-01T13:00:00Z");
  });

  it("is null for a conversation with nothing in it", () => {
    expect(latestMessageAt(discussion([]))).toBeNull();
  });
});

describe("countUnread", () => {
  it("counts everybody else's messages in a conversation never opened here", () => {
    expect(countUnread(thread, null)).toBe(3);
  });

  it("counts only what came after the last look, replies included", () => {
    expect(countUnread(thread, "2026-10-01T10:30:00Z")).toBe(2);
    expect(countUnread(thread, "2026-10-01T12:00:00Z")).toBe(0);
  });

  it("never counts your own messages", () => {
    const mine = discussion([message("m", "2026-10-02T00:00:00Z", { viewerDidAuthor: true })]);
    expect(countUnread(mine, null)).toBe(0);
  });
});

describe("withMessage", () => {
  it("adds a new top-level message at the end", () => {
    const next = withMessage(thread, message("c", "2026-10-02T00:00:00Z"), undefined);
    expect(next.comments.map((c) => c.id)).toEqual(["a", "b", "c"]);
    expect(next.commentCount).toBe(3);
  });

  it("puts a reply under the message it answers", () => {
    const next = withMessage(thread, message("b1", "2026-10-02T00:00:00Z"), "b");
    expect(next.comments[1]?.replies.map((r) => r.id)).toEqual(["b1"]);
    expect(next.comments[1]?.replyCount).toBe(1);
  });

  it("does not show a message twice when the poll already brought it", () => {
    expect(withMessage(thread, message("a1", "2026-10-01T12:00:00Z"), "a")).toBe(thread);
  });
});

describe("what this device remembers", () => {
  it("remembers which discussion a note's conversation is", () => {
    expect(rememberedNumber("me", "notes", "a.md")).toBeUndefined();
    rememberNumber("me", "notes", "a.md", 7);
    expect(rememberedNumber("me", "notes", "a.md")).toBe(7);
    expect(rememberedNumber("me", "notes", "b.md")).toBeUndefined();
  });

  it("ignores a remembered number that is not one", () => {
    window.localStorage.setItem("forkleaf:conversation:me/notes:a.md", "banana");
    expect(rememberedNumber("me", "notes", "a.md")).toBeUndefined();
  });

  it("only ever moves the seen mark forward", () => {
    markSeenUpTo("me", "notes", 7, "2026-10-01T12:00:00Z");
    markSeenUpTo("me", "notes", 7, "2026-10-01T09:00:00Z");
    expect(seenUpTo("me", "notes", 7)).toBe("2026-10-01T12:00:00Z");
  });
});
