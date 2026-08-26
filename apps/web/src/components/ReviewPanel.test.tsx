// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ReviewPanel } from "./ReviewPanel";

afterEach(cleanup);

const NOTE = ["# Recon", "", "SMB signing is disabled.", "", "## Foothold"].join("\n");

const PULL = {
  number: 7,
  url: "https://github.com/me/notes/pull/7",
  title: "Notes on recon",
  state: "open",
  merged: false,
  author: "me",
  head: "study/recon",
  base: "main",
  mergeable: true,
  mergeableState: "clean",
};

function comment(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    author: "reviewer",
    body: "Is SMB signing really off on all three?",
    createdAt: "2026-08-27T10:00:00.000Z",
    path: "notes/recon.md",
    line: 3,
    inReplyTo: null,
    ...overrides,
  };
}

/** The GET response the panel loads from. */
function loads(body: Record<string, unknown>) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: () =>
      Promise.resolve({ pull: PULL, comments: [], reviews: [], conversation: [], ...body }),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function view() {
  return render(
    <ReviewPanel
      owner="me"
      repo="notes"
      branch="study/recon"
      path="notes/recon.md"
      content={NOTE}
    />,
  );
}

beforeEach(() => vi.unstubAllGlobals());

describe("ReviewPanel — reading a review", () => {
  it("names the pull request it is showing", async () => {
    loads({});
    view();

    await waitFor(() => expect(screen.getByText("Notes on recon")).toBeTruthy());
    expect(screen.getByText("#7")).toBeTruthy();
  });

  it("asks GitHub about the branch, not about a number it does not have", async () => {
    const fetchMock = loads({});
    view();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(String(fetchMock.mock.calls[0]![0])).toContain("head=study%2Frecon");
  });

  it("says plainly when the branch has no review open", async () => {
    loads({ pull: null });
    view();

    await waitFor(() => expect(screen.getByText(/nothing is under review/i)).toBeTruthy());
  });

  it("quotes the paragraph a comment was written about", async () => {
    loads({ comments: [comment()] });
    view();

    await waitFor(() => expect(screen.getByText(/is smb signing really off/i)).toBeTruthy());
    expect(screen.getByText("SMB signing is disabled.")).toBeTruthy();
  });

  it("says so rather than quoting the wrong paragraph when the line is gone", async () => {
    loads({ comments: [comment({ line: null })] });
    view();

    await waitFor(() => expect(screen.getByText(/since changed/i)).toBeTruthy());
  });

  it("ignores comments left on another note", async () => {
    loads({ comments: [comment({ path: "notes/other.md" })] });
    view();

    await waitFor(() => expect(screen.getByText(/no inline comments/i)).toBeTruthy());
  });

  it("shows a reply under the comment it answers", async () => {
    loads({
      comments: [comment(), comment({ id: 2, inReplyTo: 1, author: "me", body: "Checked twice." })],
    });
    view();

    await waitFor(() => expect(screen.getByText("Checked twice.")).toBeTruthy());
    // One thread, not two.
    expect(
      screen.getAllByRole("listitem").filter((n) => n.querySelector("blockquote")),
    ).toHaveLength(1);
  });

  it("reports an approval", async () => {
    loads({
      reviews: [
        {
          id: 1,
          author: "reviewer",
          state: "APPROVED",
          body: "",
          submittedAt: "2026-08-27T11:00:00Z",
        },
      ],
    });
    view();

    await waitFor(() => expect(screen.getByText("Approved")).toBeTruthy());
  });

  it("reports a request for changes", async () => {
    loads({
      reviews: [
        {
          id: 1,
          author: "reviewer",
          state: "CHANGES_REQUESTED",
          body: "",
          submittedAt: "2026-08-27T11:00:00Z",
        },
      ],
    });
    view();

    await waitFor(() => expect(screen.getByText("Changes requested")).toBeTruthy());
    expect(screen.getByText(/someone has asked for changes/i)).toBeTruthy();
  });

  it("says nobody has reviewed yet when nobody has", async () => {
    loads({});
    view();

    await waitFor(() => expect(screen.getByText("Not reviewed yet")).toBeTruthy());
  });
});

describe("ReviewPanel — replying", () => {
  it("sends a reply against the comment that opened the thread", async () => {
    const fetchMock = loads({ comments: [comment({ id: 55 })] });
    view();

    await waitFor(() => expect(screen.getByPlaceholderText(/reply to this/i)).toBeTruthy());
    fireEvent.change(screen.getByPlaceholderText(/reply to this/i), {
      target: { value: "Yes, all three." },
    });
    fireEvent.click(screen.getByRole("button", { name: /^reply$/i }));

    await waitFor(() => {
      const posted = fetchMock.mock.calls.find(
        ([, init]) => (init as RequestInit)?.method === "POST",
      );
      expect(JSON.parse(String((posted![1] as RequestInit).body))).toMatchObject({
        action: "reply",
        commentId: 55,
        body: "Yes, all three.",
        number: 7,
      });
    });
  });

  it("will not send an empty reply", async () => {
    loads({ comments: [comment()] });
    view();

    await waitFor(() => expect(screen.getByRole("button", { name: /^reply$/i })).toBeTruthy());
    expect(screen.getByRole("button", { name: /^reply$/i })).toHaveProperty("disabled", true);
  });

  it("sends on Enter, the way every other message box does", async () => {
    const fetchMock = loads({ comments: [comment()] });
    view();

    await waitFor(() => expect(screen.getByPlaceholderText(/reply to this/i)).toBeTruthy());
    const box = screen.getByPlaceholderText(/reply to this/i);
    fireEvent.change(box, { target: { value: "Yes." } });
    fireEvent.keyDown(box, { key: "Enter" });

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([, i]) => (i as RequestInit)?.method === "POST")).toBe(
        true,
      ),
    );
  });

  it("leaves a newline alone when shift is held", async () => {
    const fetchMock = loads({ comments: [comment()] });
    view();

    await waitFor(() => expect(screen.getByPlaceholderText(/reply to this/i)).toBeTruthy());
    const box = screen.getByPlaceholderText(/reply to this/i);
    fireEvent.change(box, { target: { value: "Line one" } });
    fireEvent.keyDown(box, { key: "Enter", shiftKey: true });

    expect(fetchMock.mock.calls.some(([, i]) => (i as RequestInit)?.method === "POST")).toBe(false);
  });

  it("adds to the conversation when the remark is not about a line", async () => {
    const fetchMock = loads({});
    view();

    await waitFor(() => expect(screen.getByPlaceholderText(/review as a whole/i)).toBeTruthy());
    fireEvent.change(screen.getByPlaceholderText(/review as a whole/i), {
      target: { value: "Thanks for looking." },
    });
    fireEvent.click(screen.getByRole("button", { name: /add to the conversation/i }));

    await waitFor(() => {
      const posted = fetchMock.mock.calls.find(([, i]) => (i as RequestInit)?.method === "POST");
      expect(JSON.parse(String((posted![1] as RequestInit).body)).action).toBe("comment");
    });
  });
});

describe("ReviewPanel — merging", () => {
  it("squashes, and says so before it is pressed", async () => {
    loads({});
    view();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /squash and merge/i })).toBeTruthy(),
    );
    expect(screen.getByText(/land as a single commit/i)).toBeTruthy();
  });

  it("will not offer to merge something GitHub has refused", async () => {
    loads({ pull: { ...PULL, mergeable: false, mergeableState: "dirty" } });
    view();

    await waitFor(() => expect(screen.getByText(/has conflicts/i)).toBeTruthy());
    expect(screen.getByRole("button", { name: /squash and merge/i })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("says when GitHub has not worked out mergeability yet", async () => {
    loads({ pull: { ...PULL, mergeable: null, mergeableState: null } });
    view();

    await waitFor(() => expect(screen.getByText(/still working out/i)).toBeTruthy());
  });

  it("tells the workspace which branch to go back to once merged", async () => {
    const onMerged = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_url, init) =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve(
              (init as RequestInit)?.method === "POST"
                ? { merged: true }
                : { pull: PULL, comments: [], reviews: [], conversation: [] },
            ),
        }),
      ),
    );

    render(
      <ReviewPanel
        owner="me"
        repo="notes"
        branch="study/recon"
        path="notes/recon.md"
        content={NOTE}
        onMerged={onMerged}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /squash and merge/i })).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: /squash and merge/i }));

    await waitFor(() => expect(onMerged).toHaveBeenCalledWith("main"));
  });
});

describe("ReviewPanel — keeping up with the branch", () => {
  it("re-reads after a reply rather than guessing the new state", async () => {
    const fetchMock = vi.fn().mockImplementation((_url, init) =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve(
            (init as RequestInit)?.method === "POST"
              ? { comment: { id: 2 } }
              : { pull: PULL, comments: [comment()], reviews: [], conversation: [] },
          ),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    view();

    await waitFor(() => expect(screen.getByPlaceholderText(/reply to this/i)).toBeTruthy());
    const before = fetchMock.mock.calls.filter(([, i]) => !(i as RequestInit)?.method).length;

    fireEvent.change(screen.getByPlaceholderText(/reply to this/i), { target: { value: "Yes." } });
    fireEvent.click(screen.getByRole("button", { name: /^reply$/i }));

    await waitFor(() =>
      expect(fetchMock.mock.calls.filter(([, i]) => !(i as RequestInit)?.method).length).toBe(
        before + 1,
      ),
    );
  });

  it("does not let a slow answer for the old branch overwrite the new one", async () => {
    // The panel is remounted on a different branch while the first read is
    // still in flight; the stale answer must not land.
    const slow = {
      pull: { ...PULL, title: "Old branch" },
      comments: [],
      reviews: [],
      conversation: [],
    };
    const fresh = {
      pull: { ...PULL, title: "New branch" },
      comments: [],
      reviews: [],
      conversation: [],
    };

    let resolveFirst: (value: unknown) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)))
        .mockImplementation(() =>
          Promise.resolve({ ok: true, json: () => Promise.resolve(fresh) }),
        ),
    );

    const { rerender } = render(
      <ReviewPanel owner="me" repo="notes" branch="old" path="notes/recon.md" content={NOTE} />,
    );

    rerender(
      <ReviewPanel owner="me" repo="notes" branch="new" path="notes/recon.md" content={NOTE} />,
    );

    await waitFor(() => expect(screen.getByText("New branch")).toBeTruthy());

    resolveFirst({ ok: true, json: () => Promise.resolve(slow) });
    await waitFor(() => expect(screen.getByText("New branch")).toBeTruthy());
    expect(screen.queryByText("Old branch")).toBeNull();
  });
});

describe("ReviewPanel — when GitHub cannot be reached", () => {
  it("says the review exists even though this view cannot show it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    view();

    await waitFor(() => expect(screen.getByText(/could not reach github/i)).toBeTruthy());
  });

  it("passes on what GitHub said about a refused merge", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_url, init) =>
        Promise.resolve(
          (init as RequestInit)?.method === "POST"
            ? {
                ok: false,
                json: () => Promise.resolve({ error: { message: "Base branch was modified" } }),
              }
            : {
                ok: true,
                json: () =>
                  Promise.resolve({ pull: PULL, comments: [], reviews: [], conversation: [] }),
              },
        ),
      ),
    );

    view();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /squash and merge/i })).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: /squash and merge/i }));

    await waitFor(() => expect(screen.getByText(/base branch was modified/i)).toBeTruthy());
  });
});
