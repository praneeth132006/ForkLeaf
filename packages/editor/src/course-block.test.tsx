// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { WysiwygEditor, markdownOf } from "./WysiwygEditor";
import type { CourseBridge, CourseData } from "./extensions/CourseBlock";

afterEach(cleanup);

const DATA: CourseData = {
  lessons: [
    { path: "bio/cells.md", title: "Cells", cards: 2, buildsOn: [] },
    { path: "bio/dna.md", title: "DNA", cards: 1, buildsOn: ["Cells"] },
  ],
  quiz: [
    { question: "What is a cell?", answer: "The unit of life", lesson: "Cells" },
    { question: "What is DNA?", answer: "Deoxyribonucleic acid", lesson: "DNA" },
  ],
};

const bridge = (data = DATA): CourseBridge & { open: ReturnType<typeof vi.fn> } => ({
  folders: vi.fn(async () => ["bio", "chem"]),
  load: vi.fn(async () => data),
  open: vi.fn(),
  currentFolder: () => "bio",
});

async function mount(markdown: string, course?: CourseBridge): Promise<Editor> {
  let editor: Editor | null = null;
  render(
    <WysiwygEditor
      value={markdown}
      onChange={vi.fn()}
      onReady={(instance) => (editor = instance)}
      {...(course ? { course } : {})}
    />,
  );
  await waitFor(() => expect(editor).not.toBeNull(), { timeout: 4000 });
  return editor!;
}

const BLOCK = "```course\nfolder: bio\ndone:\n- bio/cells.md\n```";

describe("a course in the note", () => {
  it("lists the lessons in order with progress and what is next", async () => {
    await mount(BLOCK, bridge());
    expect(await screen.findByText("Cells")).toBeTruthy();
    expect(screen.getByTestId("course-progress").textContent).toContain("1 of 2 done");
    expect(screen.getByText("Builds on Cells")).toBeTruthy();
    expect(screen.getByText("2 cards")).toBeTruthy();
    expect((screen.getByLabelText("Done: Cells") as HTMLInputElement).checked).toBe(true);
    const next = screen.getByText(/^Next:/).querySelector("button")!;
    expect(next.textContent).toBe("DNA");
  });

  it("keeps progress in the note when a lesson is ticked off", async () => {
    const editor = await mount(BLOCK, bridge());
    fireEvent.click(await screen.findByLabelText("Done: DNA"));
    expect(markdownOf(editor).trim()).toBe(
      "```course\nfolder: bio\ndone:\n- bio/cells.md\n- bio/dna.md\n```",
    );
    expect(await screen.findByText(/Every lesson is done/)).toBeTruthy();
  });

  it("opens a lesson", async () => {
    const course = bridge();
    await mount(BLOCK, course);
    fireEvent.click(await screen.findByRole("button", { name: "Cells" }));
    expect(course.open).toHaveBeenCalledWith("bio/cells.md");
  });

  it("runs the quiz in place and gives a score", async () => {
    await mount(BLOCK, bridge());
    fireEvent.click(await screen.findByRole("button", { name: /Take the quiz · 2 questions/ }));
    expect(screen.getByText("What is a cell?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show answer" }));
    fireEvent.click(screen.getByRole("button", { name: "I knew it" }));
    expect(screen.getByText("What is DNA?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show answer" }));
    fireEvent.click(screen.getByRole("button", { name: /I didn/ }));
    expect(screen.getByText("Quiz done: 1 of 2 right.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Take it again" }));
    expect(screen.getByText("What is a cell?")).toBeTruthy();
  });

  it("writes the block back exactly as it was", async () => {
    const editor = await mount(`# Biology\n\n${BLOCK}\n\nNotes after.`, bridge());
    expect(markdownOf(editor).trim()).toBe(`# Biology\n\n${BLOCK}\n\nNotes after.`);
  });

  it("offers the note's own folder for a new course, and a choice of others", async () => {
    const editor = await mount("Plan", bridge());
    act(() => {
      editor.chain().focus("end").insertCourse().run();
    });
    fireEvent.click(await screen.findByRole("button", { name: "Make a course of bio" }));
    expect(markdownOf(editor)).toContain("```course\nfolder: bio\n```");

    fireEvent.change(await screen.findByLabelText("Course folder"), { target: { value: "chem" } });
    expect(markdownOf(editor)).toContain("```course\nfolder: chem\n```");
  });

  it("says a quiz needs cards when the lessons have none", async () => {
    await mount("```course\nfolder: bio\n```", bridge({ lessons: DATA.lessons, quiz: [] }));
    expect(await screen.findByText(/lines in the lessons and a quiz appears here/)).toBeTruthy();
  });

  it("needs a notebook", async () => {
    await mount("```course\nfolder: bio\n```");
    expect(await screen.findByText(/needs a notebook/)).toBeTruthy();
  });
});
