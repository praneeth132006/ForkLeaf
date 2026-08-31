// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { RepoRef } from "@forkleaf/types";

const readNotebookAt = vi.fn();
const readNoteAtCommit = vi.fn();

vi.mock("@/lib/gateway", () => ({
  readNotebookAt: (...args: unknown[]) => readNotebookAt(...args),
  readNoteAtCommit: (...args: unknown[]) => readNoteAtCommit(...args),
}));

// The preview renders markdown through mermaid and the whole editor package;
// what is under test here is the time machine around it.
vi.mock("@forkleaf/editor", () => ({
  Preview: ({ markdown }: { markdown: string }) => <div data-testid="preview">{markdown}</div>,
}));

const { TimeMachineDialog } = await import("./TimeMachineDialog");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const REPO: RepoRef = { owner: "me", repo: "notes", branch: "main", directory: "" };

const TREE = [
  { kind: "file" as const, name: "kickoff.md", path: "notes/kickoff.md" },
  { kind: "file" as const, name: "plan.md", path: "plan.md" },
];

const COMMIT = {
  sha: "abc1234def",
  message: "Notes from the third",
  authorName: "Ada",
  authorLogin: "ada",
  avatarUrl: null,
  date: "2026-03-03T18:00:00.000Z",
  byForkLeaf: false,
};

function open() {
  const onClose = vi.fn();
  render(<TimeMachineDialog onClose={onClose} repo={REPO} today="2026-08-31" />);
  return { onClose };
}

const go = () => fireEvent.click(screen.getByRole("button", { name: /Go there/ }));

const pickDate = (value: string) =>
  fireEvent.change(screen.getByLabelText(/Show me/), { target: { value } });

describe("TimeMachineDialog — going there", () => {
  it("reads nothing until it is asked to", () => {
    open();
    expect(readNotebookAt).not.toHaveBeenCalled();
  });

  it("asks for the day that was chosen, and lists what was there", async () => {
    readNotebookAt.mockResolvedValue({ commit: COMMIT, tree: TREE });
    open();

    pickDate("2026-03-03");
    go();

    await waitFor(() => expect(readNotebookAt).toHaveBeenCalledWith(REPO, "2026-03-03"));
    expect(await screen.findByText("2 files that day")).toBeTruthy();
    expect(screen.getByRole("button", { name: "notes/kickoff.md" })).toBeTruthy();
    // Which commit it is showing, so the answer can be checked against the
    // repository rather than taken on trust.
    expect(screen.getByText("abc1234")).toBeTruthy();
  });

  it("cannot be asked for a day that has not happened", () => {
    open();
    expect(screen.getByLabelText(/Show me/).getAttribute("max")).toBe("2026-08-31");
  });

  /**
   * A notebook has a first day. "There was nothing here yet" is the true
   * answer to what it looked like before that, and not a failure.
   */
  it("says plainly when the repository did not exist yet", async () => {
    readNotebookAt.mockResolvedValue({ commit: null, tree: [] });
    open();

    pickDate("1999-01-01");
    go();

    expect(await screen.findByText(/A notebook has a first day/)).toBeTruthy();
  });

  it("reports a day it could not read", async () => {
    readNotebookAt.mockRejectedValue(new Error("Not Found"));
    open();
    go();

    expect(await screen.findByRole("alert")).toBeTruthy();
  });
});

describe("TimeMachineDialog — reading a note as it was", () => {
  it("reads the note at that commit, not at the newest one", async () => {
    readNotebookAt.mockResolvedValue({ commit: COMMIT, tree: TREE });
    readNoteAtCommit.mockResolvedValue("# Kickoff\n\nAs it stood in March.");
    open();
    go();

    fireEvent.click(await screen.findByRole("button", { name: "notes/kickoff.md" }));

    await waitFor(() =>
      expect(readNoteAtCommit).toHaveBeenCalledWith(REPO, "notes/kickoff.md", COMMIT.sha),
    );
    expect((await screen.findByTestId("preview")).textContent).toContain("As it stood in March");
  });

  it("says so in place of the note when one file cannot be read", async () => {
    readNotebookAt.mockResolvedValue({ commit: COMMIT, tree: TREE });
    readNoteAtCommit.mockRejectedValue(new Error("gone"));
    open();
    go();

    fireEvent.click(await screen.findByRole("button", { name: "plan.md" }));

    // The rest of the day is still readable, so this is not an alarm.
    expect(await screen.findByText(/plan\.md could not be read at that commit/)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("offers no way to change anything, which is the point", async () => {
    readNotebookAt.mockResolvedValue({ commit: COMMIT, tree: TREE });
    open();
    go();

    await screen.findByText("2 files that day");
    expect(screen.queryByRole("button", { name: /restore|revert|roll back/i })).toBeNull();
  });
});
