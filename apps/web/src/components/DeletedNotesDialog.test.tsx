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

vi.mock("@forkleaf/editor", () => ({
  Preview: ({ markdown }: { markdown: string }) => <div data-testid="preview">{markdown}</div>,
}));

const { DeletedNotesDialog } = await import("./DeletedNotesDialog");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const REPO: RepoRef = { owner: "me", repo: "notes", branch: "main", directory: "" };
const COMMIT = { sha: "abc1234", message: "m", date: "2026-08-01T00:00:00Z" };
const TREE = [
  { kind: "file" as const, name: "keep.md", path: "keep.md" },
  { kind: "file" as const, name: "gone.md", path: "ideas/gone.md" },
];

function open(over: Partial<React.ComponentProps<typeof DeletedNotesDialog>> = {}) {
  const props = {
    onClose: vi.fn(),
    repo: REPO,
    currentPaths: ["keep.md"],
    onRestore: vi.fn(async (path: string) => path),
    onOpenNote: vi.fn(),
    now: new Date(2026, 8, 13),
    ...over,
  };
  render(<DeletedNotesDialog {...props} />);
  return props;
}

describe("DeletedNotesDialog", () => {
  it("reads the notebook a month ago and lists what is gone", async () => {
    readNotebookAt.mockResolvedValue({ commit: COMMIT, tree: TREE });
    open();
    fireEvent.click(screen.getByRole("button", { name: "Find deleted notes" }));

    expect(await screen.findByText("ideas/gone.md")).toBeTruthy();
    expect(readNotebookAt).toHaveBeenCalledWith(REPO, "2026-08-14");
    expect(screen.queryByText("keep.md")).toBeNull();
  });

  it("brings a note back with its text from that commit, then offers to open it", async () => {
    readNotebookAt.mockResolvedValue({ commit: COMMIT, tree: TREE });
    readNoteAtCommit.mockResolvedValue("---\ntags: [x]\n---\n# Gone");
    const props = open();
    fireEvent.click(screen.getByRole("button", { name: "Find deleted notes" }));
    fireEvent.click(await screen.findByRole("button", { name: "Bring back ideas/gone.md" }));

    await waitFor(() =>
      expect(props.onRestore).toHaveBeenCalledWith("ideas/gone.md", "---\ntags: [x]\n---\n# Gone"),
    );
    expect(readNoteAtCommit).toHaveBeenCalledWith(REPO, "ideas/gone.md", "abc1234");
    fireEvent.click(await screen.findByRole("button", { name: "Restored — open it" }));
    expect(props.onOpenNote).toHaveBeenCalledWith("ideas/gone.md");
  });

  it("says so when the note cannot be written back", async () => {
    readNotebookAt.mockResolvedValue({ commit: COMMIT, tree: TREE });
    readNoteAtCommit.mockResolvedValue("# Gone");
    open({ onRestore: vi.fn(async () => null) });
    fireEvent.click(screen.getByRole("button", { name: "Find deleted notes" }));
    fireEvent.click(await screen.findByRole("button", { name: "Bring back ideas/gone.md" }));
    expect((await screen.findByRole("alert")).textContent).toContain("could not be written back");
  });

  it("previews a deleted note", async () => {
    readNotebookAt.mockResolvedValue({ commit: COMMIT, tree: TREE });
    readNoteAtCommit.mockResolvedValue("# Gone");
    open();
    fireEvent.click(screen.getByRole("button", { name: "Find deleted notes" }));
    fireEvent.click(await screen.findByRole("button", { name: "ideas/gone.md" }));
    expect((await screen.findByTestId("preview")).textContent).toBe("# Gone");
  });

  it("tells the truth when nothing is missing, and when the repository is younger", async () => {
    readNotebookAt.mockResolvedValue({ commit: COMMIT, tree: [TREE[0]] });
    open();
    fireEvent.click(screen.getByRole("button", { name: "Find deleted notes" }));
    expect(await screen.findByText(/is still here/)).toBeTruthy();

    cleanup();
    readNotebookAt.mockResolvedValue({ commit: null, tree: [] });
    open();
    fireEvent.click(screen.getByRole("button", { name: "Find deleted notes" }));
    expect(await screen.findByText(/Nothing had been committed/)).toBeTruthy();
  });
});
