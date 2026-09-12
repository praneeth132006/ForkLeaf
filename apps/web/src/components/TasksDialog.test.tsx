// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TasksDialog } from "./TasksDialog";

afterEach(cleanup);

const NOW = new Date(2026, 8, 12, 12);

const notes = [
  { path: "later.md", title: "Later", content: "- [ ] someday" },
  { path: "urgent.md", title: "Urgent", content: "- [ ] file taxes 📅 2026-09-01\n- [x] done" },
  { path: "templates/daily.md", title: "Daily", content: "- [ ] from a template" },
];

function open(over: Partial<React.ComponentProps<typeof TasksDialog>> = {}) {
  const props = {
    onClose: vi.fn(),
    loadNotes: vi.fn(async () => notes),
    onToggle: vi.fn(async () => true),
    onOpenNote: vi.fn(),
    now: NOW,
    ...over,
  };
  render(<TasksDialog {...props} />);
  return props;
}

describe("TasksDialog", () => {
  it("lists open to-dos, overdue first, and counts them", async () => {
    open();
    expect(await screen.findByText("file taxes 📅 2026-09-01")).toBeTruthy();
    expect(screen.getByText("Overdue")).toBeTruthy();
    expect(screen.queryByText("done")).toBeNull();
    expect(screen.getByText(/open in/).textContent).toContain("3 open in 3 notes");

    const titles = screen.getAllByRole("button").map((button) => button.textContent);
    expect(titles.indexOf("Urgent")).toBeLessThan(titles.indexOf("Later"));
  });

  it("ticks a box through the note, and keeps the row", async () => {
    const props = open();
    const box = await screen.findByRole("checkbox", { name: "someday" });
    fireEvent.click(box);

    await waitFor(() => expect((box as HTMLInputElement).checked).toBe(true));
    expect(props.onToggle).toHaveBeenCalledWith(
      "later.md",
      expect.objectContaining({ text: "someday", line: 0 }),
      true,
    );
    expect(screen.getByText("someday")).toBeTruthy();
  });

  it("says so, and rereads, when the task has moved on", async () => {
    const props = open({ onToggle: vi.fn(async () => false) });
    fireEvent.click(await screen.findByRole("checkbox", { name: "someday" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    await waitFor(() => expect(props.loadNotes).toHaveBeenCalledTimes(2));
  });

  it("opens the note a row belongs to", async () => {
    const props = open();
    fireEvent.click(await screen.findByRole("button", { name: "Later" }));
    expect(props.onOpenNote).toHaveBeenCalledWith("later.md");
  });

  it("explains the syntax when there is nothing to do", async () => {
    open({ loadNotes: vi.fn(async () => []) });
    expect(await screen.findByText("Nothing left to do.")).toBeTruthy();
  });
});
