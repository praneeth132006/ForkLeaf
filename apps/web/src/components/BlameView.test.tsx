// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { RepoRef } from "@forkleaf/types";
import { BlameView } from "./BlameView";
import type { RevisionTexts } from "@/hooks/useRevisionTexts";
import type { NoteCommitDto } from "@/lib/gateway";

const readCommitFiles = vi.fn();

vi.mock("@/lib/gateway", () => ({
  readCommitFiles: (...args: unknown[]) => readCommitFiles(...args),
}));

beforeEach(() => {
  // A default a test can override. It used to live in `view()`, which meant
  // rendering overwrote whatever the test had just set up.
  readCommitFiles.mockResolvedValue({ files: [], truncated: false });
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

const REPO: RepoRef = { owner: "me", repo: "notes", branch: "main", directory: "" };
const PATH = "notes/ad-engagement.md";

function commit(sha: string, day: number, extra: Partial<NoteCommitDto> = {}): NoteCommitDto {
  return {
    sha,
    message: `commit ${sha}`,
    authorName: "Ada",
    authorLogin: "ada",
    avatarUrl: null,
    date: `2026-03-${String(day).padStart(2, "0")}T10:00:00.000Z`,
    byForkLeaf: false,
    ...extra,
  };
}

function cache(texts: Record<string, string | null>): RevisionTexts {
  return {
    texts,
    has: (sha: string) => sha in texts,
    request: vi.fn(),
    prefetch: vi.fn(),
  };
}

/** Newest first, as the history API returns them. */
const COMMITS = [commit("ccc", 20), commit("bbb", 10), commit("aaa", 1)];
const TEXTS = {
  aaa: "# Kickoff\n\nScope is the corp forest.",
  bbb: "# Kickoff\n\nScope is the corp forest.\n\nSMB signing is off on three hosts.",
  ccc: "# Kickoff\n\nScope is the corp forest.\n\nSMB signing is off on three hosts.\n\nKerberoasted svc-sql.",
};

function view(overrides: Partial<React.ComponentProps<typeof BlameView>> = {}) {
  render(
    <BlameView
      commits={COMMITS}
      revisions={overrides.revisions ?? cache(TEXTS)}
      repo={REPO}
      path={PATH}
      {...overrides}
    />,
  );
}

const paragraphs = () => screen.getAllByRole("button");

describe("BlameView", () => {
  it("shows every paragraph with its date already in the margin", () => {
    view();
    // The dates are on screen without hovering anything: a gutter you have to
    // discover by accident is one nobody reads.
    expect(screen.getByText("# Kickoff")).toBeTruthy();
    expect(screen.getByText("Scope is the corp forest.")).toBeTruthy();
    expect(screen.getByText("Kerberoasted svc-sql.")).toBeTruthy();
    expect(document.querySelectorAll("[data-blame-date]")).toHaveLength(4);
  });

  it("attributes each paragraph to the commit that introduced it", () => {
    view();
    const rows = paragraphs();
    // Newest first in the fixture: heading and scope are oldest, the
    // Kerberoast note is newest.
    expect(rows[0]!.textContent).toContain("aaa");
    expect(rows[2]!.textContent).toContain("bbb");
    expect(rows[3]!.textContent).toContain("ccc");
  });

  it("marks the oldest visible text as possibly older still", () => {
    view();
    // Nothing before the first revision we can read, so we do not claim it.
    expect(paragraphs()[0]!.textContent).toContain("≤");
    expect(paragraphs()[3]!.textContent).not.toContain("≤");
  });

  it("invites you to point at something before you have", () => {
    view();
    expect(screen.getByText(/point at a paragraph/i)).toBeTruthy();
  });

  it("names the commit behind a paragraph on hover", async () => {
    view();
    fireEvent.mouseEnter(paragraphs()[3]!);
    expect(screen.getByText("commit ccc")).toBeTruthy();
    expect(screen.getByText(/Ada \(@ada\)/)).toBeTruthy();
  });

  it("reaches the same detail from the keyboard", () => {
    view();
    fireEvent.focus(paragraphs()[2]!);
    expect(screen.getByText("commit bbb")).toBeTruthy();
  });

  it("says what else that commit touched", async () => {
    readCommitFiles.mockResolvedValue({
      files: [
        { path: PATH, status: "modified", previousPath: null },
        { path: "notes/kerberos.md", status: "added", previousPath: null },
      ],
      truncated: false,
    });
    view();

    fireEvent.mouseEnter(paragraphs()[3]!);
    await waitFor(() => expect(screen.getByText("notes/kerberos.md")).toBeTruthy());
    expect(screen.getByText(/committed alongside/i)).toBeTruthy();
    // The note being blamed is not "what else".
    expect(screen.queryByText(PATH)).toBeNull();
  });

  it("says so plainly when a commit touched only this note", async () => {
    readCommitFiles.mockResolvedValue({
      files: [{ path: PATH, status: "modified", previousPath: null }],
      truncated: false,
    });
    view();

    fireEvent.mouseEnter(paragraphs()[3]!);
    await waitFor(() => expect(screen.getByText(/touched only this note/i)).toBeTruthy());
  });

  it("does not make an alarm out of a failed lookup", async () => {
    readCommitFiles.mockRejectedValue(new Error("offline"));
    view();

    fireEvent.mouseEnter(paragraphs()[3]!);
    await waitFor(() => expect(screen.getByText(/could not read what else/i)).toBeTruthy());
    // The date and message it already had are still there.
    expect(screen.getByText("commit ccc")).toBeTruthy();
  });

  it("summarises the page and explains the shading", () => {
    view();
    expect(screen.getByText(/3 commits still visible/i)).toBeTruthy();
    expect(screen.getByText("older")).toBeTruthy();
    expect(screen.getByText("newer")).toBeTruthy();
  });

  it("waits rather than attributing everything to the newest commit", () => {
    view({ revisions: cache({}) });
    expect(screen.getByText(/reading 3 revisions/i)).toBeTruthy();
    expect(screen.queryByText("# Kickoff")).toBeNull();
  });

  it("warns that attribution will move as older revisions arrive", () => {
    view({ revisions: cache({ ccc: TEXTS.ccc }) });
    expect(screen.getByText(/attribution will move earlier/i)).toBeTruthy();
    expect(screen.getByText("reading 1/3")).toBeTruthy();
  });

  it("marks a paragraph assembled over several commits", () => {
    view({
      revisions: cache({
        aaa: "one line",
        bbb: "one line\nsecond line",
        ccc: "one line\nsecond line",
      }),
    });
    // Both lines are one block, built by two different commits.
    expect(screen.getByText("2×")).toBeTruthy();
  });

  it("handles a note that is empty in its newest commit", () => {
    view({ revisions: cache({ aaa: "gone now", bbb: "", ccc: "" }) });
    expect(screen.getByText(/nothing to attribute/i)).toBeTruthy();
  });

  it("renders nothing to blame when there are no commits", () => {
    view({ commits: [], revisions: cache({}) });
    expect(screen.getByText(/nothing to attribute/i)).toBeTruthy();
  });

  it("links a commit out to GitHub", () => {
    view();
    fireEvent.mouseEnter(paragraphs()[3]!);
    const link = screen.getByRole("link", { name: "ccc" });
    expect(link.getAttribute("href")).toBe("https://github.com/me/notes/commit/ccc");
  });

  it("asks for every revision it needs up front", () => {
    const revisions = cache(TEXTS);
    view({ revisions });
    expect(revisions.prefetch).toHaveBeenCalledWith(["ccc", "bbb", "aaa"]);
  });
});
