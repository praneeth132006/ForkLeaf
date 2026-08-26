// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Note, Workspace } from "@forkleaf/types";
import { HistoryDialog } from "./HistoryDialog";
import type { NoteCommitDto } from "@/lib/gateway";

const listNoteHistory = vi.fn();
const readNoteAtCommit = vi.fn();

vi.mock("@/lib/gateway", () => ({
  listNoteHistory: (...args: unknown[]) => listNoteHistory(...args),
  readNoteAtCommit: (...args: unknown[]) => readNoteAtCommit(...args),
}));

vi.mock("@forkleaf/editor", () => ({
  Preview: ({ markdown }: { markdown: string }) => <pre data-testid="preview">{markdown}</pre>,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const COMMITS: NoteCommitDto[] = [
  {
    sha: "bbbbbbb",
    message: "Second",
    authorName: "Ada",
    authorLogin: "ada",
    avatarUrl: null,
    date: "2026-03-02T10:00:00.000Z",
    byForkLeaf: false,
  },
  {
    sha: "aaaaaaa",
    message: "First",
    authorName: "Ada",
    authorLogin: "ada",
    avatarUrl: null,
    date: "2026-03-01T10:00:00.000Z",
    byForkLeaf: false,
  },
];

const TEXT: Record<string, string> = { aaaaaaa: "one", bbbbbbb: "one\ntwo" };

const NOTE = { path: "notes/a.md", content: "one\ntwo" } as Note;
const WORKSPACE = {
  repo: { owner: "me", repo: "notes", branch: "main", directory: "" },
} as Workspace;

function open(commits: NoteCommitDto[] = COMMITS) {
  listNoteHistory.mockResolvedValue(commits);
  readNoteAtCommit.mockImplementation((_repo: unknown, _path: string, sha: string) =>
    Promise.resolve(TEXT[sha] ?? null),
  );

  const onRestore = vi.fn();
  const onClose = vi.fn();
  render(
    <HistoryDialog note={NOTE} workspace={WORKSPACE} onClose={onClose} onRestore={onRestore} />,
  );
  return { onRestore, onClose };
}

describe("HistoryDialog", () => {
  it("opens on the diff view, with the replay a tab away", async () => {
    open();
    await screen.findByRole("tab", { name: "Changes" });

    expect(screen.getByRole("tab", { name: "Changes" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: "Replay" }).getAttribute("aria-selected")).toBe("false");
    // The diff view's own controls, not the replay's.
    expect(screen.getByLabelText(/compare with/i)).toBeTruthy();
    expect(screen.queryByRole("slider")).toBeNull();
  });

  it("switches to the replay and back", async () => {
    open();
    fireEvent.click(await screen.findByRole("tab", { name: "Replay" }));

    const scrubber = await screen.findByRole("slider");
    expect(scrubber).toBeTruthy();
    expect(screen.queryByLabelText(/compare with/i)).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Changes" }));
    expect(screen.getByLabelText(/compare with/i)).toBeTruthy();
  });

  it("fetches each revision once across both tabs", async () => {
    open();
    // The diff view opens on the newest commit against the one before it.
    await waitFor(() => expect(readNoteAtCommit).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByRole("tab", { name: "Replay" }));
    await screen.findByRole("slider");

    // The replay wants the same two revisions and finds them already cached.
    await waitFor(() => expect(screen.getByText("1/2")).toBeTruthy());
    expect(readNoteAtCommit).toHaveBeenCalledTimes(2);
  });

  it("offers no tabs at all when the note has no history", async () => {
    open([]);
    await screen.findByText(/no commits yet for this note/i);
    expect(screen.queryByRole("tab", { name: "Replay" })).toBeNull();
  });

  it("closes after restoring from the replay", async () => {
    const { onRestore, onClose } = open();
    fireEvent.click(await screen.findByRole("tab", { name: "Replay" }));
    await screen.findByRole("slider");
    await waitFor(() => expect(screen.getByText("1/2")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /restore this version/i }));
    await waitFor(() => expect(onRestore).toHaveBeenCalledWith("one"));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
