import type { DiscussionCommentDto, NoteDiscussionDto } from "@forkleaf/github-client";
import type { NoteFrontmatter } from "@forkleaf/types";
import { dateStamp } from "@/lib/templates";

/**
 * A finished conversation, kept as a note.
 *
 * A discussion is where a decision gets made; a note is where it is found
 * again. This writes the one into the other: the whole exchange, in order,
 * with who said what and when, which message was the answer, and a link back
 * to the discussion — so the note stands on its own if the discussion is ever
 * deleted, and leads back to it while it is not.
 *
 * Plain Markdown and ordinary front matter, like every other note ForkLeaf
 * writes, so it reads the same on github.com and in Obsidian.
 */

/** Where saved conversations go, beside meetings/ and templates/. */
export const CONVERSATION_FOLDER = "conversations";

/** "2026-10-09 14:05", in the reader's time zone, for the transcript. */
function when(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dateStamp(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function who(message: { author: DiscussionCommentDto["author"] }): string {
  return `@${message.author?.login ?? "ghost"}`;
}

/** The note a `[[wikilink]]` names: its path without the extension. */
function linkTarget(path: string): string {
  return path.replace(/\.mdx?$/i, "");
}

/** Prefixes every line, blank ones included, so a reply stays one quote. */
function quoted(text: string): string {
  return text
    .split("\n")
    .map((line) => (line ? `> ${line}` : ">"))
    .join("\n");
}

/** Removes ForkLeaf's own marker from an opening post. */
function withoutMarker(body: string): string {
  return body.replace(/<!-- forkleaf:note \S+ -->/g, "").trim();
}

function heading(message: DiscussionCommentDto): string {
  const answer = message.isAnswer ? " · ✅ Answer" : "";
  return `**${who(message)}** · ${when(message.createdAt)}${answer}`;
}

/** Every person who wrote something, in the order they first spoke. */
export function participants(discussion: NoteDiscussionDto): string[] {
  const seen = new Set<string>();
  const add = (login: string | undefined) => {
    if (login) seen.add(login);
  };
  if (!discussion.notePath) add(discussion.author?.login);
  for (const comment of discussion.comments) {
    add(comment.author?.login);
    for (const reply of comment.replies) add(reply.author?.login);
  }
  return [...seen];
}

export function messageCount(discussion: NoteDiscussionDto): number {
  return discussion.comments.reduce((sum, c) => sum + 1 + c.replies.length, 0);
}

export function threadToNote(
  discussion: NoteDiscussionDto,
  options: { now: Date; summary?: string },
): { title: string; content: string; frontmatter: NoteFrontmatter } {
  const people = participants(discussion);
  const count = messageCount(discussion);
  const lines: string[] = [`# ${discussion.title}`, ""];

  lines.push(
    `> Saved from [discussion #${discussion.number}](${discussion.url}) on ${dateStamp(options.now)} — ${count} ${
      count === 1 ? "message" : "messages"
    }${people.length ? ` from ${people.map((p) => `@${p}`).join(", ")}` : ""}.`,
  );
  if (discussion.notePath) lines.push(">", `> About [[${linkTarget(discussion.notePath)}]].`);
  lines.push("");

  const summary = options.summary?.trim();
  if (summary) lines.push("## Summary", "", summary, "");

  const older = discussion.commentCount - discussion.comments.length;
  lines.push("## Conversation", "");
  if (older > 0) {
    lines.push(
      `_${older} earlier ${older === 1 ? "message is" : "messages are"} only on [GitHub](${discussion.url})._`,
      "",
    );
  }

  // A discussion somebody started on GitHub opens with a real question; one
  // ForkLeaf opened for a note opens with a sentence and a marker, which say
  // nothing the line above does not.
  const opening = discussion.notePath ? "" : withoutMarker(discussion.body);
  if (opening) {
    lines.push(`**${who(discussion)}** · ${when(discussion.createdAt)}`, "", opening, "");
  }

  for (const comment of discussion.comments) {
    lines.push(
      heading(comment),
      "",
      comment.isMinimized ? "_Hidden by a maintainer._" : comment.body.trim(),
      "",
    );
    for (const reply of comment.replies) {
      const text = reply.isMinimized ? "_Hidden by a maintainer._" : reply.body.trim();
      lines.push(quoted(`${heading(reply)}\n\n${text}`), "");
    }
  }

  return {
    title: discussion.title,
    content: `${lines.join("\n").trimEnd()}\n`,
    frontmatter: {
      title: discussion.title,
      tags: ["conversation"],
      source: discussion.url,
      saved: dateStamp(options.now),
    },
  };
}

// ─── A summary, by the reader's own model ──────────────────────────────────

/** The conversation as plain text, for a model to read. */
export function transcriptOf(discussion: NoteDiscussionDto): string {
  const parts: string[] = [`Discussion: ${discussion.title}`];
  const opening = discussion.notePath ? "" : withoutMarker(discussion.body);
  if (opening) parts.push(`${who(discussion)} (opening post): ${opening}`);
  for (const comment of discussion.comments) {
    parts.push(
      `${who(comment)}${comment.isAnswer ? " (marked as the answer)" : ""}: ${comment.body.trim()}`,
    );
    for (const reply of comment.replies) {
      parts.push(`  ${who(reply)} (replying): ${reply.body.trim()}`);
    }
  }
  return parts.join("\n\n");
}

export function summaryRequest(title: string): string {
  return [
    `Summarise the discussion "${title}" for somebody who was not in it.`,
    "Write Markdown with up to three short sections, leaving out any that would be empty:",
    "**Decided** — what was agreed, as bullets.",
    "**To do** — follow-ups as `- [ ]` to-do items, naming the person when the discussion does.",
    "**Still open** — questions nobody answered, as bullets.",
    "Use only what the discussion says. No heading above the sections, and no preamble.",
  ].join("\n");
}
