import { plainText } from "@/lib/mind";

/**
 * Following other people's notebooks.
 *
 * A notebook here is a public GitHub repository of Markdown notes — another
 * ForkLeaf user's, or anybody's. The list of who you follow is an ordinary
 * note, `following.md`, so it syncs, has history, and reads fine on GitHub;
 * remove a line to unfollow. When you last caught up with each is kept on this
 * device instead: it changes every visit, and is a fact about your attention,
 * not your notebook.
 *
 * What they wrote is read paragraph by paragraph, the ones you have not seen
 * before marked new, and any paragraph can be copied into your own note as a
 * quotation with a permanent link back to exactly where it came from.
 */

export const FOLLOWING_PATH = "following.md";

export interface Followed {
  owner: string;
  repo: string;
  /** What you call them, if you named them; the repository otherwise. */
  label: string;
}

const LINE = /^\s*[-*+]\s+\[([^\]]+)\]\(https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/?\)/;

/** The notebooks a `following.md` lists, in its order. */
export function parseFollowing(content: string): Followed[] {
  const seen = new Set<string>();
  const found: Followed[] = [];
  for (const line of content.split("\n")) {
    const match = LINE.exec(line);
    if (!match) continue;
    const key = `${match[2]}/${match[3]}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    found.push({ owner: match[2]!, repo: match[3]!, label: match[1]!.trim() });
  }
  return found;
}

/** A new `following.md`. */
export function followingNote(): string {
  return [
    "---",
    "title: Following",
    "type: following",
    "---",
    "",
    "# Following",
    "",
    "Notebooks I follow in ForkLeaf. Remove a line to stop following one.",
    "",
  ].join("\n");
}

/** The note with one more notebook in it; unchanged if it is already there. */
export function withFollowed(content: string, followed: Followed): string {
  if (
    parseFollowing(content).some(
      (each) =>
        `${each.owner}/${each.repo}`.toLowerCase() ===
        `${followed.owner}/${followed.repo}`.toLowerCase(),
    )
  ) {
    return content;
  }
  const line = `- [${followed.label.replace(/[[\]]/g, "")}](https://github.com/${followed.owner}/${followed.repo})`;
  return `${content.replace(/\s+$/, "")}\n${/\n\s*[-*+]\s+\[/.test(content) ? "" : "\n"}${line}\n`;
}

/** The note without a notebook. */
export function withoutFollowed(
  content: string,
  followed: Pick<Followed, "owner" | "repo">,
): string {
  const key = `${followed.owner}/${followed.repo}`.toLowerCase();
  return content
    .split("\n")
    .filter((line) => {
      const match = LINE.exec(line);
      return !match || `${match[2]}/${match[3]}`.toLowerCase() !== key;
    })
    .join("\n");
}

/** `owner/name`, from that or from a github.com address. */
export function parseRepoInput(value: string): { owner: string; repo: string } | null {
  const match = /^\s*(?:https?:\/\/github\.com\/)?([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?\s*$/i.exec(
    value,
  );
  if (!match || /^\.+$/.test(match[1]!) || /^\.+$/.test(match[2]!)) return null;
  return { owner: match[1]!, repo: match[2]! };
}

// ─── Reading what they wrote ────────────────────────────────────────────────

export interface Paragraph {
  /** As written, for copying. */
  markdown: string;
  /** 1-based line it starts on. */
  line: number;
  /** True when it is not in the version you last saw. */
  isNew: boolean;
}

function normal(text: string): string {
  return plainText(text).replace(/\s+/g, " ").trim().toLowerCase();
}

/** A note's paragraphs (and list items, and quotes), front matter and code fences kept whole. */
export function paragraphsOf(content: string): Array<{ markdown: string; line: number }> {
  const lines = content.split("\n");
  const out: Array<{ markdown: string; line: number }> = [];
  let start = 0;
  if (lines[0]?.trim() === "---") {
    const end = lines.findIndex((line, index) => index > 0 && /^(---|\.\.\.)\s*$/.test(line));
    if (end > 0) start = end + 1;
  }

  let buffer: string[] = [];
  let bufferLine = 0;
  let fence = false;
  const flush = () => {
    const markdown = buffer.join("\n").trim();
    if (markdown) out.push({ markdown, line: bufferLine + 1 });
    buffer = [];
  };

  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (/^\s*(```|~~~)/.test(line)) {
      if (!fence) flush();
      if (buffer.length === 0) bufferLine = index;
      buffer.push(line);
      fence = !fence;
      if (!fence) flush();
      continue;
    }
    if (fence) {
      buffer.push(line);
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    // Each list item and each heading stands on its own.
    if (/^\s*(?:[-*+]|\d+[.)])\s+|^\s*#{1,6}\s/.test(line)) flush();
    if (buffer.length === 0) bufferLine = index;
    buffer.push(line);
    if (/^\s*#{1,6}\s/.test(line)) flush();
  }
  flush();
  return out;
}

/** The note's paragraphs, each marked new or not against the version you last saw. */
export function compareParagraphs(before: string | null, after: string): Paragraph[] {
  const old = new Set(
    before === null ? [] : paragraphsOf(before).map((each) => normal(each.markdown)),
  );
  return paragraphsOf(after).map((each) => ({
    ...each,
    isNew: before === null || !old.has(normal(each.markdown)),
  }));
}

/**
 * A paragraph from somebody else's notebook, ready to go into yours: quoted,
 * with a permanent link to the exact commit and line it came from, so the
 * credit survives them editing or deleting it later.
 */
export function quoteWithCredit(
  paragraph: Pick<Paragraph, "markdown" | "line">,
  source: { owner: string; repo: string; path: string; sha: string; title: string },
): string {
  const body = paragraph.markdown
    .split("\n")
    .map((line) => (line.trim() ? `> ${line}` : ">"))
    .join("\n");
  const url = `https://github.com/${source.owner}/${source.repo}/blob/${source.sha}/${source.path
    .split("/")
    .map(encodeURIComponent)
    .join("/")}#L${paragraph.line}`;
  return `${body}\n>\n> — from [${source.title.replace(/[[\]]/g, "")}](${url}) by @${source.owner}\n`;
}

// ─── When you last caught up ────────────────────────────────────────────────

const seenKey = (workspaceId: string) => `forkleaf:following-seen:${workspaceId}`;

/** Two weeks back: what a first look at a notebook just followed shows. */
export const FIRST_LOOK_DAYS = 14;

export function readSeen(workspaceId: string): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(seenKey(workspaceId)) ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
  } catch {
    return {};
  }
}

export function markSeen(
  workspaceId: string,
  followed: Pick<Followed, "owner" | "repo">,
  when: string,
): void {
  try {
    const seen = readSeen(workspaceId);
    seen[`${followed.owner}/${followed.repo}`.toLowerCase()] = when;
    window.localStorage.setItem(seenKey(workspaceId), JSON.stringify(seen));
  } catch {
    // Blocked storage: the same changes show again next time.
  }
}

export function seenSince(
  seen: Record<string, string>,
  followed: Pick<Followed, "owner" | "repo">,
  now: Date,
): string {
  return (
    seen[`${followed.owner}/${followed.repo}`.toLowerCase()] ??
    new Date(now.getTime() - FIRST_LOOK_DAYS * 86_400_000).toISOString().replace(/\.\d+Z$/, "Z")
  );
}
