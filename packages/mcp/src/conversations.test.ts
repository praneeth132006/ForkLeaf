import { describe, expect, it, vi } from "vitest";
import type {
  DiscussionCommentDto,
  NoteDiscussionDto,
  ThreadSummaryDto,
} from "@forkleaf/github-client";
import { MemoryNotebook, type NotebookConversations } from "./notebook";
import type { ToolResult } from "./protocol";
import { notebookTools } from "./tools";
import { describeThread, threadLine } from "./conversations";

const body = (result: ToolResult) => result.content.map((part) => part.text).join("");

const repo = {
  id: "R",
  url: "https://github.com/me/notes",
  private: true,
  enabled: true,
  canComment: true,
  categories: [],
};
const qa = { id: "C_qa", name: "Q&A", slug: "q-a", answerable: true };
const general = { id: "C_gen", name: "General", slug: "general", answerable: false };

function message(id: string, extra: Partial<DiscussionCommentDto> = {}): DiscussionCommentDto {
  return {
    id,
    author: { login: `user-${id}`, avatarUrl: "", url: "" },
    body: `message ${id}`,
    createdAt: "2026-10-01T10:05:00Z",
    url: `https://github.com/me/notes/discussions/12#${id}`,
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
    id: "D_12",
    number: 12,
    title: "How do we rotate keys?",
    url: "https://github.com/me/notes/discussions/12",
    locked: false,
    category: "Q&A",
    answerable: true,
    body: "What is the procedure?\n\n<!-- sha1: abc123 -->",
    author: { login: "ada", avatarUrl: "", url: "" },
    createdAt: "2026-10-01T09:00:00Z",
    viewerDidAuthor: false,
    notePath: null,
    quote: null,
    comments: [
      message("a", {
        isAnswer: true,
        body: "Monthly.",
        replies: [message("r", { body: "Thanks!\nAdding it." })],
        replyCount: 1,
      }),
      message("h", { isMinimized: true, body: "spam" }),
    ],
    commentCount: 2,
    ...extra,
  };
}

function summary(number: number, extra: Partial<ThreadSummaryDto> = {}): ThreadSummaryDto {
  return {
    id: `D_${number}`,
    number,
    title: `Thread ${number}`,
    url: "",
    category: general,
    author: null,
    createdAt: "",
    lastActivityAt: "",
    lastByViewer: false,
    commentCount: 1,
    answered: false,
    locked: false,
    notePath: null,
    quote: null,
    ...extra,
  };
}

type Fake = Record<"forNote" | "list" | "read" | "reply", ReturnType<typeof vi.fn>>;

function fakeConversations(): Fake {
  return {
    forNote: vi.fn().mockResolvedValue({
      conversation: {
        repo,
        discussion: discussion({
          notePath: "ops/keys.md",
          body: "<!-- forkleaf:note ops%2Fkeys.md -->",
        }),
      },
      passages: [summary(20, { notePath: "ops/keys.md", quote: "Rotate monthly" })],
    }),
    list: vi.fn().mockResolvedValue({
      repo,
      threads: [
        summary(1, { category: qa, answered: true }),
        summary(2, { category: qa }),
        summary(3, { notePath: "a.md" }),
      ],
      nextCursor: "C",
    }),
    read: vi.fn().mockResolvedValue({ repo, discussion: discussion() }),
    reply: vi.fn().mockResolvedValue({ url: "https://github.com/me/notes/discussions/12#new" }),
  } as never;
}

function setup(options: { readOnly?: boolean; conversations?: Fake | null } = {}) {
  const conversations =
    options.conversations === undefined ? fakeConversations() : options.conversations;
  const notebook = new MemoryNotebook(
    {
      "ops/keys.md": "# Keys",
      "private/diary.md": "<!-- forkleaf:encrypted v1 -->\n\nsecret",
    },
    (conversations ?? undefined) as NotebookConversations | undefined,
  );
  const tools = notebookTools(notebook, options.readOnly ? { readOnly: true } : {});
  const run = (name: string, args: Record<string, unknown> = {}) =>
    tools.find((tool) => tool.name === name)!.run(args);
  return { run, conversations: conversations as Fake };
}

describe("describeThread", () => {
  it("writes the thread out in reading order, answer marked, markers removed", () => {
    const text = describeThread(discussion());
    expect(text).toContain("#12 How do we rotate keys?");
    expect(text).toContain("@ada · 2026-10-01 09:00 (opening post):\nWhat is the procedure?");
    expect(text).toContain("@user-a · 2026-10-01 10:05 · THE ANSWER:\nMonthly.");
    expect(text).toContain("  ↳ @user-r · 2026-10-01 10:05:\n    Thanks!\n    Adding it.");
    expect(text).toContain("(hidden by a maintainer)");
    expect(text).not.toContain("spam");
    expect(text).not.toContain("sha1");
  });

  it("names the passage a thread is about", () => {
    expect(describeThread(discussion({ notePath: "a.md", quote: "Rotate monthly" }))).toContain(
      "About this passage: “Rotate monthly”",
    );
  });

  it("says when there is nothing in it", () => {
    expect(describeThread(discussion({ comments: [], commentCount: 0, body: "" }))).toContain(
      "No messages yet.",
    );
  });
});

describe("threadLine", () => {
  it("says what a thread is in one line", () => {
    expect(threadLine(summary(2, { category: qa }))).toBe(
      "#2 [Q&A] Thread 2 (1 reply, unanswered)",
    );
    expect(
      threadLine(summary(3, { notePath: "a.md", quote: "q", locked: true, commentCount: 4 })),
    ).toBe("#3 [General] Thread 3 (4 replies, locked, about a.md) — passage: “q”");
  });
});

describe("the conversation tools", () => {
  it("read a note's conversation and its passage threads", async () => {
    const { run, conversations } = setup();
    const text = body(await run("read_note_conversation", { path: "ops/keys.md" }));
    expect(conversations.forNote).toHaveBeenCalledWith("ops/keys.md");
    expect(text).toContain("About the note ops/keys.md.");
    expect(text).toContain("#20 [General] Thread 20");
    expect(text).toContain("passage: “Rotate monthly”");
  });

  it("never look for a conversation about an encrypted note", async () => {
    const { run, conversations } = setup();
    const text = body(await run("read_note_conversation", { path: "private/diary.md" }));
    expect(text).toContain("encrypted notes never have a conversation");
    expect(conversations.forNote).not.toHaveBeenCalled();
  });

  it("list conversations, or only the unanswered questions", async () => {
    const { run } = setup();
    const all = body(await run("list_conversations"));
    expect(all).toContain("3 conversations:");
    expect(all).toContain("(More, older ones are on GitHub.)");
    expect(body(await run("list_conversations", { unanswered: true }))).toBe(
      "1 conversation:\n#2 [Q&A] Thread 2 (1 reply, unanswered)\n(More, older ones are on GitHub.)",
    );
  });

  it("read one conversation by number, and refuse a number that is not one", async () => {
    const { run, conversations } = setup();
    expect(body(await run("read_conversation", { number: 12 }))).toContain("THE ANSWER");
    expect(conversations.read).toHaveBeenCalledWith(12);
    await expect(run("read_conversation", { number: "twelve" })).rejects.toThrow(
      /number is required/,
    );
  });

  it("reply, saying where the message went", async () => {
    const { run, conversations } = setup();
    const text = body(await run("reply_to_conversation", { number: 12, text: "  Done.  " }));
    expect(conversations.reply).toHaveBeenCalledWith(12, "Done.");
    expect(text).toBe("Posted in #12.\nSee it: https://github.com/me/notes/discussions/12#new");
  });

  it("will not reply in a locked conversation", async () => {
    const conversations = fakeConversations();
    conversations.read.mockResolvedValue({ repo, discussion: discussion({ locked: true }) });
    const { run } = setup({ conversations });
    await expect(run("reply_to_conversation", { number: 12, text: "x" })).rejects.toThrow(/locked/);
    expect(conversations.reply).not.toHaveBeenCalled();
  });

  it("do not offer replying on a read-only connection", () => {
    const tools = notebookTools(
      new MemoryNotebook({}, fakeConversations() as unknown as NotebookConversations),
      { readOnly: true },
    );
    expect(tools.map((t) => t.name)).not.toContain("reply_to_conversation");
  });

  it("say why there are none for a notebook that is not a repository", async () => {
    const { run } = setup({ conversations: null });
    await expect(run("list_conversations")).rejects.toThrow(/not a GitHub repository/);
  });

  it("say when Discussions is switched off", async () => {
    const conversations = fakeConversations();
    conversations.list.mockResolvedValue({
      repo: { ...repo, enabled: false },
      threads: [],
      nextCursor: null,
    });
    const { run } = setup({ conversations });
    expect(body(await run("list_conversations"))).toContain("Discussions is switched off");
  });
});
