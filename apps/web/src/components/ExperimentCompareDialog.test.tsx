// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const compareBranches = vi.fn();

vi.mock("@/lib/gateway", () => ({
  compareBranches: (...args: unknown[]) => compareBranches(...args),
}));

const { ExperimentCompareDialog } = await import("./ExperimentCompareDialog");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const file = (over: Record<string, unknown> = {}) => ({
  path: "notes/runbook.md",
  status: "modified",
  previousPath: null,
  before: "Deploy with make ship.",
  after: "Deploy with pnpm ship.",
  diffable: true,
  ...over,
});

const comparison = (over: Record<string, unknown> = {}) => ({
  base: "main",
  head: "try/main/the-deploy-runbook",
  mergeBaseSha: "merge00",
  headSha: "head000",
  aheadBy: 2,
  behindBy: 0,
  truncated: false,
  files: [file()],
  ...over,
});

function open(over: Partial<React.ComponentProps<typeof ExperimentCompareDialog>> = {}) {
  const props = {
    onClose: vi.fn(),
    owner: "me",
    repo: "notes",
    base: "main",
    head: "try/main/the-deploy-runbook",
    slug: "the-deploy-runbook",
    ...over,
  };

  render(<ExperimentCompareDialog {...props} />);
  return props;
}

describe("ExperimentCompareDialog", () => {
  it("says what is being compared with what", async () => {
    compareBranches.mockResolvedValue(comparison());
    open();

    expect(await screen.findByText(/the rewrite of the deploy runbook/i)).toBeTruthy();
    expect(compareBranches).toHaveBeenCalledWith(
      "me",
      "notes",
      "main",
      "try/main/the-deploy-runbook",
    );
  });

  it("puts the two versions side by side, with the changed words picked out", async () => {
    compareBranches.mockResolvedValue(comparison());
    open();

    // The split view labels its columns with the two branches.
    expect(await screen.findByText("main")).toBeTruthy();
    expect(screen.getByText("try/main/the-deploy-runbook")).toBeTruthy();
    // Only the word that changed is marked, not the whole line.
    expect(screen.getAllByText("make").length).toBeGreaterThan(0);
    expect(screen.getAllByText("pnpm").length).toBeGreaterThan(0);
  });

  /** A rewrite of one note is the common case, and a picker of one is furniture. */
  it("does not offer a choice when only one note changed", async () => {
    compareBranches.mockResolvedValue(comparison());
    open();

    await screen.findByText("main");
    expect(screen.queryByLabelText("Notes this rewrite changes")).toBeNull();
  });

  it("lets you move between the notes a rewrite touches", async () => {
    compareBranches.mockResolvedValue(
      comparison({
        files: [file(), file({ path: "notes/other.md", before: "old words", after: "new words" })],
      }),
    );
    open();

    fireEvent.click(await screen.findByRole("button", { name: /other\.md/ }));

    expect(await screen.findByText("new")).toBeTruthy();
  });

  /**
   * The sentence that stops the merge base from being a silent detail: if the
   * original moved on, somebody comparing needs to know they are not looking
   * at everything that differs between the two branches.
   */
  it("says when the original has moved on since the rewrite started", async () => {
    compareBranches.mockResolvedValue(comparison({ behindBy: 4 }));
    open();

    expect(await screen.findByText(/has moved on by 4 commits/)).toBeTruthy();
  });

  it("says nothing about the original when it has not moved", async () => {
    compareBranches.mockResolvedValue(comparison());
    open();

    await screen.findByText("main");
    expect(screen.queryByText(/has moved on by/)).toBeNull();
  });

  it("says so when the rewrite has changed nothing yet", async () => {
    compareBranches.mockResolvedValue(comparison({ files: [] }));
    open();

    expect(await screen.findByText(/Nothing has been changed on this rewrite yet/)).toBeTruthy();
  });

  it("names a note it cannot put a diff through", async () => {
    compareBranches.mockResolvedValue(
      comparison({
        files: [
          file({
            path: "notes/shot.png",
            status: "added",
            diffable: false,
            before: null,
            after: null,
          }),
        ],
      }),
    );
    open();

    expect(await screen.findByText(/It is not text/)).toBeTruthy();
  });

  it("shows a rename as the two paths it has", async () => {
    compareBranches.mockResolvedValue(
      comparison({
        files: [file({ path: "notes/new.md", status: "renamed", previousPath: "notes/old.md" })],
      }),
    );
    open();

    expect(await screen.findByText("notes/old.md → notes/new.md")).toBeTruthy();
  });

  it("says when a rewrite touches more notes than it can show", async () => {
    compareBranches.mockResolvedValue(comparison({ truncated: true }));
    open();

    expect(await screen.findByText(/touches more notes than are listed/)).toBeTruthy();
  });

  it("reports a comparison GitHub would not make", async () => {
    compareBranches.mockRejectedValue(new Error("That branch is gone."));
    open();

    expect((await screen.findByRole("alert")).textContent).toContain("That branch is gone.");
  });

  it("does not set state after it has been closed", async () => {
    let settle: (value: unknown) => void = () => {};
    compareBranches.mockReturnValue(new Promise((resolve) => (settle = resolve)));
    open();

    cleanup();
    settle(comparison());

    await waitFor(() => expect(screen.queryByText("main")).toBeNull());
  });
});
