// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { WysiwygEditor, markdownOf } from "./WysiwygEditor";
import type { FlashcardBridge } from "./extensions/FlashcardBlock";

afterEach(cleanup);

async function mount(
  markdown: string,
  flashcards?: FlashcardBridge,
): Promise<{ editor: Editor; onChange: ReturnType<typeof vi.fn> }> {
  let editor: Editor | null = null;
  const onChange = vi.fn();
  render(
    <WysiwygEditor
      value={markdown}
      onChange={onChange}
      onReady={(instance) => (editor = instance)}
      {...(flashcards ? { flashcards } : {})}
    />,
  );
  await waitFor(() => expect(editor).not.toBeNull(), { timeout: 4000 });
  return { editor: editor!, onChange };
}

/** Types text the way a keyboard does. `insertContent` would parse it as markdown. */
const type = (editor: Editor, text: string) =>
  editor.view.dispatch(editor.state.tr.insertText(text));

const types = (editor: Editor) => {
  const names: string[] = [];
  editor.state.doc.forEach((node) => names.push(node.type.name));
  return names;
};

describe("flashcards drawn in the note", () => {
  it("turns a Question :: Answer line into a card", async () => {
    const { editor } = await mount("What is H2O? :: Water");
    expect(types(editor)).toEqual(["flashcard"]);
    expect(editor.state.doc.firstChild!.attrs).toMatchObject({
      question: "What is H2O?",
      answer: "Water",
      reversed: false,
    });
    expect(screen.getByText("What is H2O?")).toBeTruthy();
  });

  it("shows the answer only when the card is turned over", async () => {
    await mount("Capital of France :: Paris");
    expect(screen.queryByTestId("flashcard-answer")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show answer" }));
    expect(screen.getByTestId("flashcard-answer").textContent).toBe("Paris");
  });

  it.each([
    ["one card", "What is H2O? :: Water"],
    ["cards on consecutive lines", "One :: 1\nTwo :: 2\nThree :: 3"],
    ["cards separated by blank lines", "One :: 1\n\nTwo :: 2"],
    ["a card between lines of text", "Intro line\nOne :: 1\nOutro line"],
    ["a heading, text, then cards", "# Chemistry\n\nSome notes.\n\nH2O :: Water\nNaCl :: Salt"],
    ["a both-ways card", "Hund ::: dog"],
    ["a card after a list", "- a\n- b\n\nQuestion here :: answer"],
  ])("writes %s back exactly as it was", async (_name, markdown) => {
    const { editor } = await mount(markdown);
    expect(types(editor)).toContain("flashcard");
    expect(markdownOf(editor).trim()).toBe(markdown);
  });

  it.each([
    ["C++ scope", "Use std::vector here"],
    ["a list item", "- Question :: Answer"],
    ["code", "```\nQuestion :: Answer\n```"],
    ["a card with formatting", "**Bold** question :: answer"],
    ["no answer", "Question ::"],
  ])("leaves %s as text", async (_name, markdown) => {
    const { editor } = await mount(markdown);
    expect(types(editor)).not.toContain("flashcard");
  });

  it("saves an edit made in the card's fields", async () => {
    const { editor } = await mount("Capital of France :: Paris");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Answer"), { target: { value: "Paris, on the Seine" } });
    await waitFor(() =>
      expect(markdownOf(editor).trim()).toBe("Capital of France :: Paris, on the Seine"),
    );
  });

  it("inserts a card with its fields open, and removes it when left empty", async () => {
    const { editor } = await mount("Some text");
    act(() => {
      editor.chain().focus("end").insertFlashcard().run();
    });
    const question = (await screen.findByLabelText("Question")) as HTMLInputElement;
    expect(question.value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(types(editor)).not.toContain("flashcard"));
  });

  it("writes a new card as a plain line", async () => {
    const { editor } = await mount("Notes");
    act(() => {
      editor.chain().focus("end").insertFlashcard().run();
    });
    fireEvent.change(await screen.findByLabelText("Question"), { target: { value: "2 * 3?" } });
    fireEvent.change(screen.getByLabelText("Answer"), { target: { value: "6" } });
    await waitFor(() => expect(markdownOf(editor)).toContain(":: 6"));
    expect(markdownOf(editor)).toMatch(/^Notes\n\n2 \\?\* 3\? :: 6/);
  });

  it("grades a card in place through the app", async () => {
    const grade = vi.fn();
    const bridge: FlashcardBridge = {
      status: () => "New card",
      preview: () => ({ good: "1 day" }),
      grade,
    };
    await mount("Capital of France :: Paris", bridge);
    expect(screen.getByTestId("flashcard-status").textContent).toBe("New card");
    fireEvent.click(screen.getByRole("button", { name: "Show answer" }));
    expect(screen.getByText("1 day")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Good/ }));
    expect(grade).toHaveBeenCalledWith(
      { question: "Capital of France", answer: "Paris", reversed: false },
      "good",
    );
    expect(screen.queryByTestId("flashcard-answer")).toBeNull();
  });

  it("makes a card of a line the moment Enter is pressed at its end", async () => {
    const { editor } = await mount("");
    act(() => {
      editor.commands.focus("end");
      type(editor, "What is H2O? :: Water");
      editor.commands.keyboardShortcut("Enter");
    });
    expect(types(editor)).toEqual(["flashcard", "paragraph"]);
    expect(await screen.findByText("What is H2O?")).toBeTruthy();
    // The caret is on the line below, ready for the next card.
    expect(editor.state.selection.$from.parent.type.name).toBe("paragraph");

    act(() => {
      type(editor, "Capital of France :: Paris");
      editor.commands.keyboardShortcut("Enter");
    });
    expect(types(editor)).toEqual(["flashcard", "flashcard", "paragraph"]);
    expect(markdownOf(editor).trim()).toBe("What is H2O? :: Water\nCapital of France :: Paris");
  });

  it("keeps the lines above a card typed at the end of a paragraph", async () => {
    const { editor } = await mount("Intro line");
    act(() => {
      editor.chain().focus("end").setHardBreak().run();
      type(editor, "One :: 1");
      editor.commands.keyboardShortcut("Enter");
    });
    expect(types(editor)).toEqual(["paragraph", "flashcard", "paragraph"]);
    expect(markdownOf(editor).trim()).toBe("Intro line\nOne :: 1");
  });

  it.each([
    ["the caret is not at the end of the line", "One :: 1", 3],
    ["the line is code", "Use std::vector here", null],
  ] as const)("does not make a card when %s", async (_name, text, back) => {
    const { editor } = await mount("");
    act(() => {
      editor.commands.focus("end");
      type(editor, text);
      if (back !== null) {
        const at = editor.state.selection.from - back;
        editor.commands.setTextSelection(at);
      }
      editor.commands.keyboardShortcut("Enter");
    });
    expect(types(editor)).not.toContain("flashcard");
  });

  it("does not report a change just for opening a note with cards", async () => {
    const { onChange } = await mount("One :: 1\nTwo :: 2");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(onChange).not.toHaveBeenCalled();
  });
});
