// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Workspace } from "@forkleaf/types";

const listNoteHistory = vi.fn();
const readDocumentText = vi.fn();

vi.mock("@/lib/gateway", () => ({
  listNoteHistory: (...args: unknown[]) => listNoteHistory(...args),
}));

vi.mock("@/lib/pdf-index", () => ({
  readDocumentText: (...args: unknown[]) => readDocumentText(...args),
}));

const { DocumentVersionsDialog } = await import("./DocumentVersionsDialog");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const WORKSPACE: Workspace = {
  id: "w",
  name: "me/notes",
  repo: { owner: "me", repo: "notes", branch: "main", directory: "" },
  isDefault: true,
  isLocal: false,
  createdAt: "",
  lastOpenedAt: "",
};

const commit = (sha: string, message: string) => ({
  sha,
  message,
  authorName: "Ada",
  authorLogin: "ada",
  avatarUrl: null,
  date: "2026-03-01T10:00:00.000Z",
  byForkLeaf: false,
});

const pages = (...texts: string[]) => texts.map((text, index) => ({ page: index + 1, text }));

function open(over: Partial<React.ComponentProps<typeof DocumentVersionsDialog>> = {}) {
  const props = {
    onClose: vi.fn(),
    workspace: WORKSPACE,
    path: "papers/attention.pdf",
    cited: [] as number[],
    onGoToPage: vi.fn(),
    ...over,
  };

  render(<DocumentVersionsDialog {...props} />);
  return props;
}

describe("DocumentVersionsDialog — choosing a version", () => {
  it("reads nothing until a version is picked", async () => {
    listNoteHistory.mockResolvedValue([commit("new", "v3"), commit("old", "v2")]);
    open();

    expect(await screen.findByText("v2")).toBeTruthy();
    // Reading two whole documents is seconds of work.
    expect(readDocumentText).not.toHaveBeenCalled();
  });

  it("does not offer the version you are already reading", async () => {
    listNoteHistory.mockResolvedValue([commit("new", "v3"), commit("old", "v2")]);
    open();

    await screen.findByText("v2");
    // Comparing a thing with itself is not a question.
    expect(screen.queryByText("v3")).toBeNull();
  });

  it("says so when there is only one version", async () => {
    listNoteHistory.mockResolvedValue([commit("only", "first commit")]);
    open();

    expect(await screen.findByText(/only ever been committed once/)).toBeTruthy();
  });
});

describe("DocumentVersionsDialog — the comparison", () => {
  // Set before the dialog renders: it asks for the history on mount, and a
  // mock installed afterwards would arrive too late — for the first test in
  // the file only, which is the most confusing kind of order dependence.
  beforeEach(() => {
    listNoteHistory.mockResolvedValue([commit("new", "v3"), commit("old", "v2")]);
  });

  const compare = async () =>
    fireEvent.click(await screen.findByRole("button", { name: "Compare" }));

  it("names the pages whose words changed", async () => {
    readDocumentText
      .mockResolvedValueOnce(pages("one", "two", "three"))
      .mockResolvedValueOnce(pages("one", "two, revised", "three"));
    open();
    await compare();

    expect(await screen.findByText(/1 of 3 pages changed/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "p. 2" })).toBeTruthy();
  });

  it("reads the old version at its commit, and the new one at the branch", async () => {
    readDocumentText.mockResolvedValue(pages("same"));
    open();
    await compare();

    await waitFor(() => expect(readDocumentText).toHaveBeenCalledTimes(2));
    expect(readDocumentText.mock.calls[0]?.[0]?.repo?.branch).toBe("old");
    expect(readDocumentText.mock.calls[1]?.[0]?.repo?.branch).toBe("main");
  });

  /** The sentence no other reading app can print. */
  it("says when a page you quoted is one of the ones that changed", async () => {
    readDocumentText
      .mockResolvedValueOnce(pages("one", "two"))
      .mockResolvedValueOnce(pages("one", "rewritten"));
    open({ cited: [2] });
    await compare();

    expect(await screen.findByText(/is one you quoted/)).toBeTruthy();
  });

  it("says plainly when none of your pages are affected", async () => {
    readDocumentText
      .mockResolvedValueOnce(pages("one", "two"))
      .mockResolvedValueOnce(pages("one", "rewritten"));
    open({ cited: [1] });
    await compare();

    expect(await screen.findByText(/None of the pages you quoted/)).toBeTruthy();
  });

  it("takes you to a changed page in the document you are reading", async () => {
    readDocumentText
      .mockResolvedValueOnce(pages("one", "two"))
      .mockResolvedValueOnce(pages("one", "rewritten"));
    const props = open();
    await compare();

    fireEvent.click(await screen.findByRole("button", { name: "p. 2" }));
    expect(props.onGoToPage).toHaveBeenCalledWith(2);
  });

  it("reports two versions that cannot both be read", async () => {
    readDocumentText.mockRejectedValue(new Error("That PDF could not be read."));
    open();
    await compare();

    expect(await screen.findByRole("alert")).toBeTruthy();
  });
});
