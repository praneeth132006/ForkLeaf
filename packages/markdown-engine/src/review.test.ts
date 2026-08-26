import { describe, expect, it } from "vitest";
import { buildThreads, summariseReviews, type ReviewComment, type SubmittedReview } from "./review";

const NOTE = [
  "# Recon",
  "",
  "SMB signing is disabled.",
  "Two weeks, no phishing.",
  "",
  "## Foothold",
  "",
  "Kerberoasted svc-sql.",
].join("\n");

let nextId = 0;

function comment(overrides: Partial<ReviewComment> = {}): ReviewComment {
  nextId += 1;
  return {
    id: nextId,
    author: "reviewer",
    body: "a remark",
    createdAt: `2026-08-27T10:0${nextId % 10}:00.000Z`,
    path: "notes/recon.md",
    line: 1,
    inReplyTo: null,
    ...overrides,
  };
}

const threads = (comments: ReviewComment[], content = NOTE) =>
  buildThreads(comments, { path: "notes/recon.md", content });

/** The first thread, for the many cases that build exactly one. */
const firstOf = (comments: ReviewComment[], content = NOTE) => threads(comments, content)[0]!;

describe("buildThreads — anchoring to paragraphs", () => {
  it("quotes the paragraph a comment was written against", () => {
    const thread = firstOf([comment({ line: 3 })]);
    expect(thread.quote).toBe("SMB signing is disabled.\nTwo weeks, no phishing.");
    expect(thread.block).toBe(1);
  });

  it("anchors a comment on a heading to that heading", () => {
    const thread = firstOf([comment({ line: 1 })]);
    expect(thread.quote).toBe("# Recon");
  });

  it("puts every line of a paragraph on the same paragraph", () => {
    const third = firstOf([comment({ line: 3 })]);
    const fourth = firstOf([comment({ line: 4 })]);
    expect(fourth.block).toBe(third.block);
  });

  it("places a comment further down the note correctly", () => {
    const thread = firstOf([comment({ line: 8 })]);
    expect(thread.quote).toBe("Kerberoasted svc-sql.");
  });

  it("cannot place a comment whose line no longer exists", () => {
    const thread = firstOf([comment({ line: null })]);
    expect(thread.block).toBeNull();
    expect(thread.quote).toBeNull();
    expect(thread.outdated).toBe(true);
  });

  it("cannot place a comment pointing past the end of the note", () => {
    const thread = firstOf([comment({ line: 999 })]);
    expect(thread.block).toBeNull();
    expect(thread.quote).toBeNull();
  });

  it("cannot place a comment on a blank line between paragraphs", () => {
    expect(firstOf([comment({ line: 2 })]).block).toBeNull();
  });

  it("ignores comments left on another file", () => {
    expect(threads([comment({ path: "notes/other.md" })])).toEqual([]);
  });

  it("handles a note that is empty", () => {
    expect(firstOf([comment({ line: 1 })], "").quote).toBeNull();
  });
});

describe("buildThreads — assembling replies", () => {
  it("gathers a reply under the comment it answers", () => {
    const opening = comment({ id: 100, line: 3, body: "is this right?" });
    const reply = comment({ id: 101, inReplyTo: 100, body: "yes, checked twice" });

    const built = threads([opening, reply]);
    expect(built).toHaveLength(1);
    expect(built[0]!.comments.map((c) => c.body)).toEqual(["is this right?", "yes, checked twice"]);
  });

  it("keeps the opening comment first whatever its timestamp says", () => {
    const opening = comment({ id: 200, createdAt: "2026-08-27T12:00:00.000Z" });
    const reply = comment({ id: 201, inReplyTo: 200, createdAt: "2026-08-27T09:00:00.000Z" });

    expect(firstOf([opening, reply]).comments[0]!.id).toBe(200);
  });

  it("orders several replies by when they were written", () => {
    const opening = comment({ id: 300 });
    const later = comment({ id: 301, inReplyTo: 300, createdAt: "2026-08-27T13:00:00.000Z" });
    const sooner = comment({ id: 302, inReplyTo: 300, createdAt: "2026-08-27T11:00:00.000Z" });

    expect(firstOf([opening, later, sooner]).comments.map((c) => c.id)).toEqual([300, 302, 301]);
  });

  it("gathers a reply to a reply into the same thread", () => {
    const opening = comment({ id: 400 });
    const reply = comment({ id: 401, inReplyTo: 400 });
    const deeper = comment({ id: 402, inReplyTo: 401 });

    const built = threads([opening, reply, deeper]);
    expect(built).toHaveLength(1);
    expect(built[0]!.comments).toHaveLength(3);
  });

  it("keeps a reply whose parent is missing rather than dropping it", () => {
    // The parent may have been deleted, or left on a file we did not ask for.
    // Losing somebody's words to bookkeeping is the one unacceptable outcome.
    const orphan = comment({ id: 500, inReplyTo: 499, body: "still said something" });
    const built = threads([orphan]);

    expect(built).toHaveLength(1);
    expect(built[0]!.comments[0]!.body).toBe("still said something");
  });

  it("does not hang on comments that reply to each other, and loses neither", () => {
    const a = comment({ id: 600, inReplyTo: 601 });
    const b = comment({ id: 601, inReplyTo: 600 });

    expect(() => threads([a, b])).not.toThrow();
    const built = threads([a, b]);
    expect(built).toHaveLength(1);
    expect(built[0]!.comments.map((c) => c.id).sort()).toEqual([600, 601]);
  });

  it("keeps two separate conversations separate", () => {
    const first = comment({ id: 700, line: 3 });
    const second = comment({ id: 701, line: 8 });

    expect(threads([first, second])).toHaveLength(2);
  });
});

describe("buildThreads — ordering", () => {
  it("reads down the note, not by when comments arrived", () => {
    const late = comment({ id: 800, line: 8 });
    const early = comment({ id: 801, line: 1 });

    expect(threads([late, early]).map((t) => t.id)).toEqual([801, 800]);
  });

  it("puts threads it cannot place last, after everything readable", () => {
    const placed = comment({ id: 900, line: 3 });
    const outdated = comment({ id: 901, line: null });

    expect(threads([outdated, placed]).map((t) => t.id)).toEqual([900, 901]);
  });

  it("orders two comments on the same line predictably", () => {
    const a = comment({ id: 1000, line: 3 });
    const b = comment({ id: 1001, line: 3 });

    expect(threads([b, a]).map((t) => t.id)).toEqual([1000, 1001]);
  });

  it("returns nothing for a review with no comments", () => {
    expect(threads([])).toEqual([]);
  });
});

let reviewId = 0;
function review(overrides: Partial<SubmittedReview> = {}): SubmittedReview {
  reviewId += 1;
  return {
    id: reviewId,
    author: "reviewer",
    state: "COMMENTED",
    body: "",
    submittedAt: `2026-08-2${reviewId % 9}T10:00:00.000Z`,
    ...overrides,
  };
}

describe("summariseReviews", () => {
  it("says nothing has been said when nobody has reviewed", () => {
    expect(summariseReviews([])).toEqual({ verdict: "none", reviewers: [] });
  });

  it("reports an approval", () => {
    expect(summariseReviews([review({ state: "APPROVED" })]).verdict).toBe("approved");
  });

  it("reports a request for changes", () => {
    expect(summariseReviews([review({ state: "CHANGES_REQUESTED" })]).verdict).toBe(
      "changes-requested",
    );
  });

  it("counts only each person's latest word", () => {
    const verdict = summariseReviews([
      review({ author: "a", state: "CHANGES_REQUESTED", submittedAt: "2026-08-01T00:00:00Z" }),
      review({ author: "a", state: "APPROVED", submittedAt: "2026-08-02T00:00:00Z" }),
    ]);

    // Otherwise a note whose author fixed the problem stays blocked forever.
    expect(verdict.verdict).toBe("approved");
    expect(verdict.reviewers).toHaveLength(1);
  });

  it("does not let a later remark withdraw an approval", () => {
    // Commenting after approving does not withdraw it on GitHub either.
    const verdict = summariseReviews([
      review({ author: "a", state: "APPROVED", submittedAt: "2026-08-01T00:00:00Z" }),
      review({ author: "a", state: "COMMENTED", submittedAt: "2026-08-02T00:00:00Z" }),
    ]);

    expect(verdict.verdict).toBe("approved");
  });

  it("lets one request for changes outrank several approvals", () => {
    const verdict = summariseReviews([
      review({ author: "a", state: "APPROVED" }),
      review({ author: "b", state: "APPROVED" }),
      review({ author: "c", state: "CHANGES_REQUESTED" }),
    ]);

    expect(verdict.verdict).toBe("changes-requested");
  });

  it("falls back to commented when that is all anyone did", () => {
    expect(summariseReviews([review({ state: "COMMENTED" })]).verdict).toBe("commented");
  });

  it("ignores a dismissed review", () => {
    expect(summariseReviews([review({ state: "DISMISSED" })]).verdict).toBe("none");
  });

  it("ignores a review with no author to attribute it to", () => {
    expect(summariseReviews([review({ author: null, state: "APPROVED" })]).verdict).toBe("none");
  });

  it("lists reviewers most recent first", () => {
    const verdict = summariseReviews([
      review({ author: "older", state: "APPROVED", submittedAt: "2026-08-01T00:00:00Z" }),
      review({ author: "newer", state: "APPROVED", submittedAt: "2026-08-05T00:00:00Z" }),
    ]);

    expect(verdict.reviewers.map((r) => r.author)).toEqual(["newer", "older"]);
  });
});
