/**
 * A pull request's review, arranged the way a note reads.
 *
 * Opening a pull request against your own notes already worked; reading the
 * review did not. The comments lived on github.com, anchored to line numbers
 * in a diff, and the whole point of studying something this way — someone
 * marks up the paragraph you got wrong, you argue back, then it merges — meant
 * leaving the app and reading your prose as a unified diff.
 *
 * So this puts the review back into the shape of the document. GitHub anchors
 * a comment to a line; a reader thinks in paragraphs. The mapping between
 * those is the work, and getting it wrong is worse than not doing it: a note
 * quoting the wrong paragraph beside somebody's objection is actively
 * misleading.
 */

/** One comment, flattened from the review-comment endpoint. */
export interface ReviewComment {
  id: number;
  author: string | null;
  body: string;
  createdAt: string;
  path: string;
  /**
   * Line in the file as it stands now, or null once the diff has moved on.
   *
   * GitHub reports this as null for an "outdated" comment — one whose line no
   * longer exists in the head commit. The comment is still worth showing; it
   * just cannot be placed beside anything.
   */
  line: number | null;
  /** Set when this is a reply, naming the comment that started the thread. */
  inReplyTo: number | null;
}

/** A comment and everything said in reply to it. */
export interface ReviewThread {
  /** Id of the opening comment, which is what a reply is addressed to. */
  id: number;
  path: string;
  line: number | null;
  /** Index of the paragraph this is about, or null when it cannot be placed. */
  block: number | null;
  /** The paragraph itself, so the thread can show what is being argued about. */
  quote: string | null;
  /** Opening comment first, replies in the order they were written. */
  comments: ReviewComment[];
  /** True when the line this was written against no longer exists. */
  outdated: boolean;
}

/**
 * Blank-line-separated blocks, with the line each one starts on.
 *
 * The same unit the blame gutter uses, and for the same reason: a line is what
 * git talks about and a paragraph is what a person points at.
 */
function paragraphs(content: string): { start: number; end: number; text: string }[] {
  const lines = content.split("\n");
  const blocks: { start: number; end: number; text: string }[] = [];

  let current: string[] = [];
  let start = 1;

  const flush = (end: number) => {
    if (current.some((line) => line.trim() !== "")) {
      blocks.push({ start, end, text: current.join("\n").trim() });
    }
    current = [];
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;

    if (line.trim() === "") {
      flush(i);
      start = i + 2;
      continue;
    }

    if (current.length === 0) start = i + 1;
    current.push(line);
  }

  flush(lines.length);
  return blocks;
}

/** The paragraph a line falls in, or null when it falls outside every one. */
function blockAt(blocks: readonly { start: number; end: number }[], line: number): number | null {
  const index = blocks.findIndex((block) => line >= block.start && line <= block.end);
  return index === -1 ? null : index;
}

export interface ThreadOptions {
  /** Only comments on this file are threaded; a note is one file. */
  path: string;
  /** The note as the review sees it, for quoting the paragraph. */
  content: string;
}

/**
 * Turns a flat list of review comments into threads against paragraphs.
 *
 * GitHub returns replies as ordinary comments carrying `in_reply_to_id`, in no
 * guaranteed nesting, so the thread has to be reassembled. A reply whose
 * parent is missing from the list — because it was on another file, or
 * deleted — becomes its own thread rather than being dropped: losing somebody's
 * words to a bookkeeping detail is the one outcome worth ruling out.
 */
export function buildThreads(
  comments: readonly ReviewComment[],
  options: ThreadOptions,
): ReviewThread[] {
  const mine = comments.filter((comment) => comment.path === options.path);
  const blocks = paragraphs(options.content);
  const byId = new Map(mine.map((comment) => [comment.id, comment] as const));

  /**
   * Walks up to the comment that started the thread.
   *
   * A reply chain that loops back on itself is malformed and GitHub does not
   * produce one — but it arrives over the network, so it is handled rather
   * than trusted. On a cycle the lowest id in the loop is taken as the root,
   * which terminates, keeps every comment, and groups the whole loop into one
   * conversation instead of splitting it into one thread per participant.
   */
  const rootOf = (comment: ReviewComment): ReviewComment => {
    const seen = new Set<number>([comment.id]);
    let current = comment;

    while (current.inReplyTo !== null) {
      const parent = byId.get(current.inReplyTo);
      if (!parent) break;

      if (seen.has(parent.id)) {
        const lowest = Math.min(...seen);
        return byId.get(lowest) ?? current;
      }

      seen.add(parent.id);
      current = parent;
    }

    return current;
  };

  const grouped = new Map<number, ReviewComment[]>();
  for (const comment of mine) {
    const root = rootOf(comment);
    grouped.set(root.id, [...(grouped.get(root.id) ?? []), comment]);
  }

  const threads = [...grouped.entries()].map<ReviewThread>(([id, group]) => {
    const ordered = [...group].sort((a, b) => {
      // The opening comment leads, whatever its timestamp says.
      if (a.id === id) return -1;
      if (b.id === id) return 1;
      return a.createdAt.localeCompare(b.createdAt) || a.id - b.id;
    });

    const opening = ordered[0]!;
    const block = opening.line === null ? null : blockAt(blocks, opening.line);

    return {
      id,
      path: opening.path,
      line: opening.line,
      block,
      quote: block === null ? null : (blocks[block]?.text ?? null),
      comments: ordered,
      outdated: opening.line === null,
    };
  });

  // Down the document, with unplaceable threads last: they belong to a version
  // of the note that no longer exists, and should not interrupt the reading.
  return threads.sort((a, b) => {
    if (a.line === null && b.line === null) return a.id - b.id;
    if (a.line === null) return 1;
    if (b.line === null) return -1;
    return a.line - b.line || a.id - b.id;
  });
}

/** One submitted review — an approval, a rejection, or a plain remark. */
export interface SubmittedReview {
  id: number;
  author: string | null;
  /** GitHub's own words: APPROVED, CHANGES_REQUESTED, COMMENTED, DISMISSED. */
  state: string;
  body: string;
  submittedAt: string;
}

export type Verdict = "approved" | "changes-requested" | "commented" | "none";

export interface ReviewVerdict {
  verdict: Verdict;
  /** The standing position of each reviewer, most recent first. */
  reviewers: { author: string; state: Verdict; submittedAt: string }[];
}

function verdictOf(state: string): Verdict {
  switch (state.toUpperCase()) {
    case "APPROVED":
      return "approved";
    case "CHANGES_REQUESTED":
      return "changes-requested";
    case "COMMENTED":
      return "commented";
    default:
      return "none";
  }
}

/**
 * Where a review has got to, counting only each person's latest word.
 *
 * Someone who requested changes and then approved has approved. Taking the
 * whole list at face value would leave a request for changes standing against
 * a note whose author already fixed it and got the approval — which reads as
 * "you are blocked" forever.
 *
 * A plain comment never overrides a verdict: on GitHub, commenting after
 * approving does not withdraw the approval, and pretending otherwise would
 * make the state here disagree with the merge button there.
 */
export function summariseReviews(reviews: readonly SubmittedReview[]): ReviewVerdict {
  const latest = new Map<string, { state: Verdict; submittedAt: string }>();

  for (const review of [...reviews].sort((a, b) => a.submittedAt.localeCompare(b.submittedAt))) {
    if (!review.author) continue;

    const state = verdictOf(review.state);
    if (state === "none") continue;

    const standing = latest.get(review.author);
    // A remark does not displace a decision the same person already made.
    if (state === "commented" && standing && standing.state !== "commented") continue;

    latest.set(review.author, { state, submittedAt: review.submittedAt });
  }

  const reviewers = [...latest.entries()]
    .map(([author, entry]) => ({ author, ...entry }))
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt) || a.author.localeCompare(b.author));

  // A single request for changes outranks any number of approvals: it is the
  // one state that means somebody is waiting on you.
  if (reviewers.some((entry) => entry.state === "changes-requested")) {
    return { verdict: "changes-requested", reviewers };
  }
  if (reviewers.some((entry) => entry.state === "approved")) {
    return { verdict: "approved", reviewers };
  }
  if (reviewers.length > 0) return { verdict: "commented", reviewers };

  return { verdict: "none", reviewers };
}
