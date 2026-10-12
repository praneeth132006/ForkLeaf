// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ContradictionsDialog } from "./ContradictionsDialog";

afterEach(cleanup);

const notes = [
  {
    path: "companies.md",
    title: "Companies",
    content: "Acme Robotics was founded in Berlin in 2019 by two engineers.",
  },
  {
    path: "meeting.md",
    title: "Meeting",
    content: "Acme Robotics was founded in Berlin in 2021 by two engineers.",
  },
];

function mount(dismissed: ReadonlySet<string> = new Set()) {
  const onDismiss = vi.fn();
  const onOpen = vi.fn();
  render(
    <ContradictionsDialog
      onClose={vi.fn()}
      loadNotes={async () => notes}
      dismissed={() => dismissed}
      onDismiss={onDismiss}
      onOpen={onOpen}
    />,
  );
  return { onDismiss, onOpen };
}

describe("ContradictionsDialog", () => {
  it("shows both sentences with the differing figure marked", async () => {
    mount();
    expect(await screen.findByText("Different figures")).toBeTruthy();
    expect(screen.getByText("2019 or 2021")).toBeTruthy();
    const marks = Array.from(document.querySelectorAll("mark")).map((mark) => mark.textContent);
    expect(marks).toEqual(["2019", "2021"]);
  });

  it("opens either note at the line", async () => {
    const { onOpen } = mount();
    fireEvent.click(await screen.findByText("Meeting · line 1"));
    expect(onOpen).toHaveBeenCalledWith("meeting.md", 1);
  });

  it("hides a pair judged fine, and remembers it", async () => {
    const { onDismiss } = mount();
    fireEvent.click(await screen.findByText("Not a contradiction"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Different figures")).toBeNull();
    expect(screen.getByText(/No contradictions found in 2 notes/)).toBeTruthy();
  });

  it("says plainly when there is nothing to look at", async () => {
    render(
      <ContradictionsDialog
        onClose={vi.fn()}
        loadNotes={async () => [notes[0]!]}
        dismissed={() => new Set()}
        onDismiss={vi.fn()}
        onOpen={vi.fn()}
      />,
    );
    expect(await screen.findByText("No contradictions found in 1 note.")).toBeTruthy();
  });

  it("says when the notebook could not be read", async () => {
    render(
      <ContradictionsDialog
        onClose={vi.fn()}
        loadNotes={async () => {
          throw new Error("Offline");
        }}
        dismissed={() => new Set()}
        onDismiss={vi.fn()}
        onOpen={vi.fn()}
      />,
    );
    expect((await screen.findByRole("alert")).textContent).toBe("Offline");
  });
});
