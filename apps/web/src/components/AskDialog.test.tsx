// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AskDialog } from "./AskDialog";

afterEach(cleanup);

const NOTES = [
  {
    path: "projects/Launch.md",
    title: "Launch",
    content: "# Launch\n\n## Dates\n\nWe ship the beta on October 3rd.",
  },
  { path: "Bread.md", title: "Bread", content: "Bake at 220 degrees." },
];

function open() {
  const props = {
    onClose: vi.fn(),
    loadNotes: vi.fn(async () => NOTES),
    onOpen: vi.fn(),
  };
  render(<AskDialog {...props} />);
  return props;
}

function askQuestion(text: string) {
  fireEvent.change(screen.getByLabelText("Question"), { target: { value: text } });
  fireEvent.submit(screen.getByLabelText("Question").closest("form")!);
}

describe("AskDialog", () => {
  it("quotes the passage that answers, with where it is, and opens the note there", async () => {
    const props = open();
    askQuestion("When do we ship the beta?");

    expect(await screen.findByText("1 passage from 1 note, best answer first.")).toBeTruthy();
    expect(screen.getByText("Launch › Dates · line 5")).toBeTruthy();
    expect(screen.getAllByText("ship", { selector: "mark" })).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Open at line 5" }));
    expect(props.onOpen).toHaveBeenCalledWith("projects/Launch.md", 5);
  });

  it("reads the notes once, however many questions are asked", async () => {
    const props = open();
    askQuestion("beta");
    await screen.findByRole("status");
    askQuestion("bake degrees");
    expect(await screen.findByText("Bread · line 1")).toBeTruthy();
    expect(props.loadNotes).toHaveBeenCalledTimes(1);
  });

  it("says plainly when nothing answers", async () => {
    open();
    askQuestion("quantum entanglement");
    expect(await screen.findByText(/Nothing in your notes answers/)).toBeTruthy();
  });

  it("offers example questions to start from", async () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "bread oven temperature" }));
    expect(await screen.findByText(/Nothing in your notes answers|passage/)).toBeTruthy();
  });
});
