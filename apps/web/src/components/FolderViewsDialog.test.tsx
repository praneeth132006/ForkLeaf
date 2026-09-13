// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { FolderViewsDialog } from "./FolderViewsDialog";

afterEach(cleanup);

const NOTES = [
  { path: "work/launch.md", title: "Launch", frontmatter: { status: "Doing", priority: 2 } },
  { path: "work/hiring.md", title: "Hiring", frontmatter: { status: "To do", priority: 10 } },
  { path: "work/idea.md", title: "Idea", frontmatter: {} },
  { path: "home/garden.md", title: "Garden", frontmatter: { status: "Done" } },
];

function open(over: Partial<React.ComponentProps<typeof FolderViewsDialog>> = {}) {
  const props = {
    onClose: vi.fn(),
    initialView: "board" as const,
    folders: ["home", "work"],
    initialFolder: "work",
    loadNotes: vi.fn(async () => NOTES),
    onSetProperties: vi.fn(async () => true),
    onOpenNote: vi.fn(),
    ...over,
  };
  render(<FolderViewsDialog {...props} />);
  return props;
}

const column = (name: string) => screen.getByRole("region", { name });

describe("FolderViewsDialog — board", () => {
  it("lays the folder's notes out by status", async () => {
    open();
    await screen.findByText("Launch");
    expect(within(column("Doing")).getByText("Launch")).toBeTruthy();
    expect(within(column("To do")).getByText("Hiring")).toBeTruthy();
    expect(within(column("No status")).getByText("Idea")).toBeTruthy();
    expect(screen.queryByText("Garden")).toBeNull();
  });

  it("moves a card with the menu, writing the property, and the card follows", async () => {
    const props = open();
    await screen.findByText("Launch");
    fireEvent.change(screen.getByRole("combobox", { name: "Move Launch" }), {
      target: { value: "Done" },
    });
    await waitFor(() =>
      expect(props.onSetProperties).toHaveBeenCalledWith("work/launch.md", { status: "Done" }),
    );
    await waitFor(() => expect(within(column("Done")).getByText("Launch")).toBeTruthy());
  });

  it("removes the property when a card goes to the no-status column", async () => {
    const props = open();
    await screen.findByText("Launch");
    fireEvent.change(screen.getByRole("combobox", { name: "Move Hiring" }), {
      target: { value: "" },
    });
    await waitFor(() =>
      expect(props.onSetProperties).toHaveBeenCalledWith("work/hiring.md", { status: undefined }),
    );
  });

  it("moves a card by drag and drop", async () => {
    const props = open();
    await screen.findByText("Launch");
    const data = new Map<string, string>();
    const dataTransfer = {
      setData: (type: string, value: string) => data.set(type, value),
      getData: (type: string) => data.get(type) ?? "",
      effectAllowed: "",
    };
    fireEvent.dragStart(screen.getByText("Idea").closest("li")!, { dataTransfer });
    fireEvent.dragOver(column("Doing"), { dataTransfer });
    fireEvent.drop(column("Doing"), { dataTransfer });
    await waitFor(() =>
      expect(props.onSetProperties).toHaveBeenCalledWith("work/idea.md", { status: "Doing" }),
    );
  });

  it("adds an empty column to drag into", async () => {
    open();
    await screen.findByText("Launch");
    fireEvent.change(screen.getByRole("textbox", { name: "New column name" }), {
      target: { value: "Blocked" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(column("Blocked")).toBeTruthy();
  });

  it("says so, and leaves the card, when the note cannot be changed", async () => {
    open({ onSetProperties: vi.fn(async () => false) });
    await screen.findByText("Launch");
    fireEvent.change(screen.getByRole("combobox", { name: "Move Launch" }), {
      target: { value: "Done" },
    });
    expect((await screen.findByRole("alert")).textContent).toContain("locked");
    expect(within(column("Doing")).getByText("Launch")).toBeTruthy();
  });

  it("switches folder", async () => {
    open();
    await screen.findByText("Launch");
    fireEvent.change(screen.getByRole("combobox", { name: "Folder" }), {
      target: { value: "home" },
    });
    expect(within(column("Done")).getByText("Garden")).toBeTruthy();
  });
});

describe("FolderViewsDialog — table", () => {
  const titles = () =>
    screen
      .getAllByRole("row")
      .slice(1)
      .map((row) => within(row).getAllByRole("button")[0]!.textContent);

  it("sorts by a column, numbers as numbers", async () => {
    open({ initialView: "table" });
    await screen.findByText("Launch");
    expect(titles()).toEqual(["Hiring", "Idea", "Launch"]);
    fireEvent.click(screen.getByRole("button", { name: "priority" }));
    expect(titles()).toEqual(["Launch", "Hiring", "Idea"]);
    fireEvent.click(screen.getByRole("button", { name: "priority" }));
    expect(titles()).toEqual(["Hiring", "Launch", "Idea"]);
  });

  it("edits a cell, keeping a number a number", async () => {
    const props = open({ initialView: "table" });
    await screen.findByText("Launch");
    fireEvent.click(screen.getByRole("button", { name: "Edit priority of Launch" }));
    const input = screen.getByRole("textbox", { name: "priority of Launch" });
    fireEvent.change(input, { target: { value: "7" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() =>
      expect(props.onSetProperties).toHaveBeenCalledWith("work/launch.md", { priority: 7 }),
    );
  });

  it("does not write a cell that was not changed, or one escaped from", async () => {
    const props = open({ initialView: "table" });
    await screen.findByText("Launch");
    fireEvent.click(screen.getByRole("button", { name: "Edit priority of Launch" }));
    fireEvent.keyDown(screen.getByRole("textbox", { name: "priority of Launch" }), {
      key: "Enter",
    });
    fireEvent.click(screen.getByRole("button", { name: "Edit status of Idea" }));
    const input = screen.getByRole("textbox", { name: "status of Idea" });
    fireEvent.change(input, { target: { value: "Doing" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(props.onSetProperties).not.toHaveBeenCalled();
  });

  it("filters rows and adds a property column", async () => {
    open({ initialView: "table" });
    await screen.findByText("Launch");
    fireEvent.change(screen.getByRole("searchbox", { name: "Filter rows" }), {
      target: { value: "doing" },
    });
    expect(titles()).toEqual(["Launch"]);
    fireEvent.change(screen.getByRole("textbox", { name: "New property name" }), {
      target: { value: "owner" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByRole("button", { name: "owner" })).toBeTruthy();
  });

  it("opens a note from its title", async () => {
    const props = open({ initialView: "table" });
    fireEvent.click(await screen.findByRole("button", { name: "Idea" }));
    expect(props.onOpenNote).toHaveBeenCalledWith("work/idea.md");
  });
});
