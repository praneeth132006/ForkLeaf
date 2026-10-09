import { describe, expect, it } from "vitest";
import type { DiscussionCommentDto, NoteDiscussionDto } from "@forkleaf/github-client";
import {
  messageCount,
  participants,
  summaryRequest,
  threadToNote,
  transcriptOf,
} from "./thread-note";

function message(
  id: string,
  login: string,
  body: string,
  extra: Partial<DiscussionCommentDto> = {},
): DiscussionCommentDto {
  return {
    id,
    author: { login, avatarUrl: "", url: "" },
    body,
    createdAt: "2026-10-01T10:05:00",
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
    id: "D_1",
    number: 12,
    title: "How do we rotate keys?",
    url: "https://github.com/me/notes/discussions/12",
    locked: false,
    category: "Q&A",
    answerable: true,
    body: "We never wrote this down.\n\nWhat's the procedure?",
    author: { login: "ada", avatarUrl: "", url: "" },
    createdAt: "2026-10-01T09:00:00",
    viewerDidAuthor: false,
    notePath: null,
    comments: [
      message("c1", "grace", "Monthly, with the script.\nSee `rotate.sh`.", {
        isAnswer: true,
        replies: [message("r1", "ada", "Thanks!\n\nAdding it to the runbook.")],
        replyCount: 1,
      }),
      message("c2", "linus", "Spam", { isMinimized: true }),
    ],
    commentCount: 2,
    ...extra,
  };
}

const now = new Date("2026-10-09T12:00:00");

describe("threadToNote", () => {
  it("writes the whole exchange in order, with who and when", () => {
    const { content } = threadToNote(discussion(), { now });

    expect(content).toContain("# How do we rotate keys?");
    expect(content).toContain(
      "> Saved from [discussion #12](https://github.com/me/notes/discussions/12) on 2026-10-09 — 3 messages from @ada, @grace, @linus.",
    );
    // The opening question comes first, then the answer, then the reply.
    const order = ["We never wrote this down.", "Monthly, with the script.", "Thanks!"].map((s) =>
      content.indexOf(s),
    );
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(content).toContain("**@ada** · 2026-10-01 09:00");
    expect(content).toContain("**@grace** · 2026-10-01 10:05 · ✅ Answer");
  });

  it("keeps a reply one blockquote, blank lines and all", () => {
    const { content } = threadToNote(discussion(), { now });
    expect(content).toContain(
      "> **@ada** · 2026-10-01 10:05\n>\n> Thanks!\n>\n> Adding it to the runbook.",
    );
  });

  it("does not copy a message a maintainer hid", () => {
    const { content } = threadToNote(discussion(), { now });
    expect(content).not.toContain("Spam");
    expect(content).toContain("_Hidden by a maintainer._");
  });

  it("links the note a conversation was about, and drops ForkLeaf's own opening post", () => {
    const { content } = threadToNote(
      discussion({
        notePath: "ops/runbook.md",
        body: "Conversation about the note `ops/runbook.md`.\n\n<!-- forkleaf:note ops%2Frunbook.md -->",
        author: { login: "praneeth", avatarUrl: "", url: "" },
      }),
      { now },
    );
    expect(content).toContain("> About [[ops/runbook]].");
    expect(content).not.toContain("forkleaf:note");
    expect(content).not.toContain("Conversation about the note");
    // The person who opened it only clicked a button; they are not a participant.
    expect(content).not.toContain("@praneeth");
  });

  it("puts a summary first when there is one", () => {
    const { content } = threadToNote(discussion(), {
      now,
      summary: "**Decided**\n- Rotate monthly.",
    });
    expect(content.indexOf("## Summary")).toBeLessThan(content.indexOf("## Conversation"));
    expect(content).toContain("**Decided**\n- Rotate monthly.");
  });

  it("says when older messages were not part of what was read", () => {
    const { content } = threadToNote(discussion({ commentCount: 60 }), { now });
    expect(content).toContain("_58 earlier messages are only on [GitHub](");
  });

  it("gives the note front matter that says where it came from", () => {
    expect(threadToNote(discussion(), { now }).frontmatter).toEqual({
      title: "How do we rotate keys?",
      tags: ["conversation"],
      source: "https://github.com/me/notes/discussions/12",
      saved: "2026-10-09",
    });
  });

  it("counts one message correctly", () => {
    const one = discussion({ comments: [message("c1", "grace", "hi")], body: "" });
    expect(threadToNote(one, { now }).content).toContain("— 1 message from");
  });
});

describe("participants and messageCount", () => {
  it("lists everyone who wrote, once, in the order they first spoke", () => {
    expect(participants(discussion())).toEqual(["ada", "grace", "linus"]);
    expect(messageCount(discussion())).toBe(3);
  });
});

describe("the summary request", () => {
  it("gives the model the whole exchange as text", () => {
    const text = transcriptOf(discussion());
    expect(text).toContain("@ada (opening post): We never wrote this down.");
    expect(text).toContain("@grace (marked as the answer): Monthly");
    expect(text).toContain("  @ada (replying): Thanks!");
  });

  it("asks for decisions, to-dos and open questions, and nothing invented", () => {
    const request = summaryRequest("Keys");
    expect(request).toContain('"Keys"');
    expect(request).toMatch(/Decided/);
    expect(request).toMatch(/- \[ \]/);
    expect(request).toMatch(/Use only what the discussion says/);
  });
});
