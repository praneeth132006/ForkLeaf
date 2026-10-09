import type { NoteDiscussionDto, ThreadSummaryDto } from "@forkleaf/github-client";

/**
 * Conversations, written out for an assistant to read.
 *
 * Plain text in reading order: who said what and when, which message is the
 * answer, replies under what they answer, and the thread's address — so an
 * assistant can quote it back accurately and point the person at it.
 */

/** ForkLeaf's and giscus's own markers say nothing to a reader. */
function withoutMarkers(body: string): string {
  return body
    .replace(/<!-- forkleaf:(note|passage) [^>]*-->/g, "")
    .replace(/<!-- sha1: [0-9a-f]+ -->/g, "")
    .trim();
}

function when(iso: string): string {
  return iso ? iso.replace("T", " ").slice(0, 16) : "";
}

const who = (login: string | undefined) => `@${login ?? "ghost"}`;

/** One line for a thread in a list. */
export function threadLine(thread: ThreadSummaryDto): string {
  const facts = [
    `${thread.commentCount} ${thread.commentCount === 1 ? "reply" : "replies"}`,
    thread.answered ? "answered" : thread.category.answerable ? "unanswered" : null,
    thread.locked ? "locked" : null,
    thread.notePath ? `about ${thread.notePath}` : null,
  ].filter(Boolean);
  const passage = thread.quote ? ` — passage: “${thread.quote}”` : "";
  return `#${thread.number} [${thread.category.name}] ${thread.title} (${facts.join(", ")})${passage}`;
}

/** A whole thread. */
export function describeThread(discussion: NoteDiscussionDto): string {
  const lines: string[] = [
    `#${discussion.number} ${discussion.title}`,
    `${discussion.category}${discussion.locked ? " · locked" : ""} · ${discussion.url}`,
  ];
  if (discussion.notePath) lines.push(`About the note ${discussion.notePath}.`);
  if (discussion.quote) lines.push(`About this passage: “${discussion.quote}”`);
  lines.push("");

  const opening = discussion.notePath ? "" : withoutMarkers(discussion.body);
  if (opening) {
    lines.push(`${who(discussion.author?.login)} · ${when(discussion.createdAt)} (opening post):`);
    lines.push(opening, "");
  }

  if (discussion.comments.length === 0 && !opening) lines.push("No messages yet.");

  const older = discussion.commentCount - discussion.comments.length;
  if (older > 0) lines.push(`(${older} earlier messages are only on GitHub.)`, "");

  for (const comment of discussion.comments) {
    const answer = comment.isAnswer ? " · THE ANSWER" : "";
    lines.push(`${who(comment.author?.login)} · ${when(comment.createdAt)}${answer}:`);
    lines.push(comment.isMinimized ? "(hidden by a maintainer)" : comment.body.trim(), "");
    for (const reply of comment.replies) {
      lines.push(`  ↳ ${who(reply.author?.login)} · ${when(reply.createdAt)}:`);
      const text = reply.isMinimized ? "(hidden by a maintainer)" : reply.body.trim();
      lines.push(...text.split("\n").map((line) => `    ${line}`), "");
    }
  }

  return lines.join("\n").trimEnd();
}
