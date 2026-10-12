// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ExamDialog } from "./ExamDialog";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const notes = [
  {
    path: "geo/capitals.md",
    title: "Capitals",
    content: "Capital of France? :: Paris\nCapital of Japan? :: Tokyo",
  },
  { path: "other/misc.md", title: "Misc", content: "Two plus two? :: Four" },
];

function mount(clock = { now: 0 }) {
  const onSave = vi.fn(async (title: string) => `exams/${title}.md`);
  const onOpen = vi.fn();
  render(
    <ExamDialog
      onClose={vi.fn()}
      loadNotes={async () => notes}
      onSave={onSave}
      onOpen={onOpen}
      now={() => clock.now}
      seed={1}
    />,
  );
  return { onSave, onOpen, clock };
}

const answer = (text: string) =>
  fireEvent.change(screen.getByRole("textbox"), { target: { value: text } });

describe("ExamDialog", () => {
  it("builds a paper from one folder and marks typed answers", async () => {
    const { onSave } = mount();
    fireEvent.change(await screen.findByLabelText("On"), { target: { value: "geo" } });
    expect(screen.getByText("2 questions to draw from, so this paper will have 2.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Time"), { target: { value: "none" } });
    fireEvent.click(screen.getByText("Start the exam"));

    expect(screen.getByTestId("exam-progress").textContent).toBe("Question 1 of 2");
    const first = screen.getByText(/Capital of (France|Japan)\?/).textContent!;
    answer(first.includes("France") ? "paris" : "Tokyo");
    fireEvent.click(screen.getByText("Next"));

    expect(screen.getByTestId("exam-progress").textContent).toBe("Question 2 of 2");
    // Moves on with ⌘↵, unanswered.
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter", metaKey: true });

    expect(screen.getByTestId("exam-score").textContent).toBe("50%");
    expect(screen.getByText(/1 right · 0 partly · 0 wrong · 1 skipped/)).toBeTruthy();

    fireEvent.click(screen.getByText("Save results as a note"));
    await screen.findByText(/Saved to exams\//);
    const [title, content] = onSave.mock.calls[0]!;
    expect(title).toMatch(/^\d{4}-\d{2}-\d{2} \d{4} geo exam$/);
    expect(content).toContain("# Exam: geo");
    expect(content).toContain("## To go over again");
  });

  it("goes back to an earlier question with the answer still there", async () => {
    mount();
    fireEvent.click(await screen.findByText("Start the exam"));
    answer("Paris");
    fireEvent.click(screen.getByText("Next"));
    fireEvent.click(screen.getByText("Back"));
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("Paris");
  });

  it("hands the paper in when time runs out", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const clock = { now: 0 };
    mount(clock);
    fireEvent.change(await screen.findByLabelText("Time"), { target: { value: "5" } });
    fireEvent.click(screen.getByText("Start the exam"));
    expect(screen.getByRole("timer").textContent).toBe("5:00");

    answer("Paris");
    clock.now = 5 * 60_000 + 1;
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId("exam-score")).toBeTruthy();
    expect(screen.getByText(/skipped/)).toBeTruthy();
  });

  it("opens the note a question came from", async () => {
    const { onOpen } = mount();
    fireEvent.click(await screen.findByText("Start the exam"));
    fireEvent.click(screen.getByText("Hand in now"));
    fireEvent.click(screen.getAllByText("Capitals")[0]!);
    expect(onOpen).toHaveBeenCalledWith("geo/capitals.md", expect.any(Number));
  });

  it("explains what exams are made from when there is nothing to ask", async () => {
    render(
      <ExamDialog
        onClose={vi.fn()}
        loadNotes={async () => [{ path: "a.md", title: "A", content: "Just prose." }]}
        onSave={vi.fn()}
        onOpen={vi.fn()}
      />,
    );
    expect(await screen.findByText(/Nothing here to be examined on yet/)).toBeTruthy();
    expect((screen.getByText("Start the exam") as HTMLButtonElement).disabled).toBe(true);
  });
});
