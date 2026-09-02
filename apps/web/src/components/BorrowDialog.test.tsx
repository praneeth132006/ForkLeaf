// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const describeRepo = vi.fn();
const listBranches = vi.fn();

vi.mock("@/lib/gateway", () => ({
  describeRepo: (...args: unknown[]) => describeRepo(...args),
  listBranches: (...args: unknown[]) => listBranches(...args),
}));

const { BorrowDialog } = await import("./BorrowDialog");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const TREE = [
  { kind: "file" as const, name: "runbook.md", path: "notes/runbook.md" },
  { kind: "file" as const, name: "chart.png", path: "assets/chart.png" },
];

function open(over: Partial<React.ComponentProps<typeof BorrowDialog>> = {}) {
  const props = {
    onClose: vi.fn(),
    loadTree: vi.fn(async () => TREE),
    onBorrow: vi.fn(),
    ...over,
  };

  render(<BorrowDialog {...props} />);
  return props;
}

/** Types a name and presses the button, the way somebody would. */
async function look(name = "ada/notes") {
  fireEvent.change(screen.getByLabelText(/Whose notebook/), { target: { value: name } });
  fireEvent.click(screen.getByRole("button", { name: /Look inside/ }));
}

const found = {
  owner: "ada",
  name: "notes",
  fullName: "ada/notes",
  private: false,
  defaultBranch: "main",
  description: null,
  updatedAt: "",
};

describe("BorrowDialog — finding a notebook", () => {
  it("reads their notes, and leaves everything that is not one out", async () => {
    describeRepo.mockResolvedValue(found);
    listBranches.mockResolvedValue([{ name: "main", sha: "a1b2c3d4e5", isDefault: true }]);
    open();
    await look();

    expect(await screen.findByRole("button", { name: "notes/runbook.md" })).toBeTruthy();
    // A picture is not a note somebody can borrow.
    expect(screen.queryByRole("button", { name: "assets/chart.png" })).toBeNull();
  });

  it("asks for the branch the notebook actually keeps its notes on", async () => {
    describeRepo.mockResolvedValue({ ...found, defaultBranch: "trunk" });
    listBranches.mockResolvedValue([]);
    const props = open();
    await look();

    await waitFor(() => expect(props.loadTree).toHaveBeenCalledWith("ada", "notes", "trunk"));
  });

  it("says what it needs when given something that is not a repository", async () => {
    open();
    await look("just-a-name");

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(describeRepo).not.toHaveBeenCalled();
  });

  it("says so when the notebook cannot be read", async () => {
    describeRepo.mockRejectedValue(new Error("ada/notes could not be found."));
    open();
    await look();

    expect(await screen.findByText(/could not be found/)).toBeTruthy();
  });
});

describe("BorrowDialog — the link it writes", () => {
  /**
   * The pin is the whole idea. An unpinned link says "whatever they have now",
   * and a note that changes under a claim you made about it is exactly what
   * borrowing is supposed to prevent.
   */
  it("pins to the revision that was read", async () => {
    describeRepo.mockResolvedValue(found);
    listBranches.mockResolvedValue([{ name: "main", sha: "a1b2c3d4e5f6", isDefault: true }]);
    const props = open();
    await look();

    fireEvent.click(await screen.findByRole("button", { name: "notes/runbook.md" }));

    expect(props.onBorrow).toHaveBeenCalledWith("[[repo:ada/notes:notes/runbook.md@a1b2c3d]]");
  });

  it("can follow along instead, for somebody who wants the newest", async () => {
    describeRepo.mockResolvedValue(found);
    listBranches.mockResolvedValue([{ name: "main", sha: "a1b2c3d4e5f6", isDefault: true }]);
    const props = open();
    await look();

    fireEvent.click(await screen.findByLabelText(/Pin to the version I read/));
    fireEvent.click(screen.getByRole("button", { name: "notes/runbook.md" }));

    expect(props.onBorrow).toHaveBeenCalledWith("[[repo:ada/notes:notes/runbook.md]]");
  });

  it("says plainly when there is no revision to pin to", async () => {
    describeRepo.mockResolvedValue(found);
    listBranches.mockResolvedValue([]);
    const props = open();
    await look();

    expect(await screen.findByText(/cannot be pinned/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "notes/runbook.md" }));
    expect(props.onBorrow).toHaveBeenCalledWith("[[repo:ada/notes:notes/runbook.md]]");
  });
});
