// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { Command } from "@/components/CommandPalette";
import { ToolsDialog } from "./ToolsDialog";

afterEach(cleanup);

const command = (over: Partial<Command> & Pick<Command, "id" | "label" | "group">): Command => ({
  run: vi.fn(),
  ...over,
});

function open(commands: Command[]) {
  const onClose = vi.fn();
  render(<ToolsDialog commands={commands} onClose={onClose} />);
  return onClose;
}

describe("ToolsDialog", () => {
  const commands = [
    command({ id: "docs", label: "Go to documentation", group: "Go to" }),
    command({ id: "new-note", label: "New note", group: "Notes", hint: "⌘⇧N" }),
    command({ id: "focus", label: "Focus mode", group: "View", keywords: "zen distraction" }),
  ];

  it("shows every command as a button, grouped, with its shortcut", () => {
    open(commands);
    const headings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual(["Notes · 1", "View · 1", "Go to · 1"]);
    const notes = screen.getByRole("region", { name: "Notes" });
    expect(within(notes).getByRole("button", { name: /New note/ }).textContent).toContain("⌘⇧N");
  });

  it("shows a descriptive hint under the label, not as a key", () => {
    open([
      command({
        id: "import",
        label: "Import notes",
        group: "Notes",
        hint: "A vault or an unzipped Notion export",
      }),
    ]);
    const button = screen.getByRole("button", { name: /Import notes/ });
    expect(button.querySelector("kbd")).toBeNull();
    expect(button.textContent).toContain("A vault or an unzipped Notion export");
  });

  it("filters by label, group and keywords", () => {
    open(commands);
    fireEvent.change(screen.getByLabelText("Filter tools"), { target: { value: "zen" } });
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(
      expect.arrayContaining(["Focus mode"]),
    );
    expect(screen.queryByRole("button", { name: /New note/ })).toBeNull();

    fireEvent.change(screen.getByLabelText("Filter tools"), {
      target: { value: "nothing like it" },
    });
    expect(screen.getByText(/No tool matches/)).toBeTruthy();
  });

  it("closes and runs the command that was clicked", () => {
    const onClose = open(commands);
    fireEvent.click(screen.getByRole("button", { name: /Focus mode/ }));
    expect(onClose).toHaveBeenCalled();
    expect(commands[2]!.run).toHaveBeenCalledTimes(1);
    expect(commands[1]!.run).not.toHaveBeenCalled();
  });
});
