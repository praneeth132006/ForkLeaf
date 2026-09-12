// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SaveDialog } from "./SaveDialog";

afterEach(cleanup);

const QUOTE = {
  kind: "quote" as const,
  url: "https://www.example.com/essay",
  title: "An essay",
  text: "A sentence worth keeping.",
};

function open(over: Partial<React.ComponentProps<typeof SaveDialog>> = {}) {
  const props = {
    request: QUOTE,
    onSave: vi.fn(async () => {}),
    onClose: vi.fn(),
    existing: null,
    onOpenExisting: vi.fn(),
    ...over,
  };
  render(<SaveDialog {...props} />);
  return props;
}

describe("SaveDialog", () => {
  it("shows exactly what will be saved, and saves nothing until asked", () => {
    const props = open();
    expect(screen.getByText("A sentence worth keeping.")).toBeTruthy();
    expect(screen.getByText("example.com")).toBeTruthy();
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("An essay");
    expect(props.onSave).not.toHaveBeenCalled();
  });

  it("starts on Save, so one keypress from the share sheet is enough", () => {
    open();
    expect(document.activeElement?.textContent).toBe("Save");
  });

  it("saves with the title as edited", async () => {
    const props = open();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Renamed" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(props.onSave).toHaveBeenCalledWith({ ...QUOTE, title: "Renamed" }));
  });

  it("puts the title back when it is emptied", async () => {
    const props = open();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(props.onSave).toHaveBeenCalledWith(QUOTE));
  });

  it("can be declined", () => {
    const props = open();
    fireEvent.click(screen.getByRole("button", { name: "Don’t save" }));
    expect(props.onClose).toHaveBeenCalled();
    expect(props.onSave).not.toHaveBeenCalled();
  });

  it("points at an earlier save of the same thing", () => {
    const props = open({ existing: { path: "inbox/an-essay.md", title: "An essay" } });
    fireEvent.click(screen.getByRole("button", { name: "An essay" }));
    expect(props.onOpenExisting).toHaveBeenCalledWith("inbox/an-essay.md");
    expect(screen.getByRole("button", { name: "Save another copy" })).toBeTruthy();
  });

  it("says so when saving fails, and lets you try again", async () => {
    open({ onSave: vi.fn(async () => Promise.reject(new Error("Storage is full."))) });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Storage is full.");
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });
});
