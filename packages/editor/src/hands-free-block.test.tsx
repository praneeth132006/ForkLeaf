// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { WysiwygEditor, markdownOf } from "./WysiwygEditor";
import type { SpeechKit } from "./extensions/HandsFreeBlock";
import type { FlashcardBridge } from "./extensions/FlashcardBlock";

afterEach(cleanup);

/** A voice that says nothing aloud and hears what the test tells it to. */
function voice(heard: string[]): SpeechKit & { said: string[] } {
  const said: string[] = [];
  return {
    said,
    speak: async (text) => {
      said.push(text);
    },
    listen: async () => heard.shift() ?? "",
    cancel: vi.fn(),
  };
}

async function mount(
  markdown: string,
  speech: SpeechKit | null,
  flashcards?: FlashcardBridge,
): Promise<Editor> {
  let editor: Editor | null = null;
  render(
    <WysiwygEditor
      value={markdown}
      onChange={vi.fn()}
      onReady={(instance) => (editor = instance)}
      speech={() => speech}
      {...(flashcards ? { flashcards } : {})}
    />,
  );
  await waitFor(() => expect(editor).not.toBeNull(), { timeout: 4000 });
  return editor!;
}

const NOTE = "What is H2O? :: Water\nCapital of France :: Paris\n\n```hands-free\n```";

describe("hands-free review in the note", () => {
  it("reads each card, judges the spoken answer, says what was missed, and grades", async () => {
    const speech = voice(["it's water", "Berlin"]);
    const grade = vi.fn();
    await mount(NOTE, speech, { status: () => null, grade });

    fireEvent.click(await screen.findByRole("button", { name: "Start" }));
    expect(await screen.findByText("Done: 1 of 2 right.")).toBeTruthy();

    expect(speech.said).toEqual([
      "What is H2O?",
      "Right.",
      "Capital of France",
      "The answer is Paris.",
      "Done. 1 of 2 right.",
    ]);
    expect(grade.mock.calls.map((call) => call[1])).toEqual(["good", "again"]);
  });

  it("repeats, skips, and takes “I don't know” as a miss", async () => {
    const speech = voice(["repeat", "water", "skip"]);
    const grade = vi.fn();
    await mount(`${NOTE}`, speech, { status: () => null, grade });
    fireEvent.click(await screen.findByRole("button", { name: "Start" }));
    await screen.findByText("Done: 1 of 1 right.");
    expect(speech.said.slice(0, 3)).toEqual(["What is H2O?", "What is H2O?", "Right."]);
    expect(grade).toHaveBeenCalledTimes(1);

    cleanup();
    const unsure = voice(["I don't know", "stop"]);
    await mount(NOTE, unsure);
    fireEvent.click(await screen.findByRole("button", { name: "Start" }));
    await screen.findByText("Done: 0 of 1 right.");
    expect(unsure.said).toContain("The answer is Water.");
  });

  it("asks cards due today first", async () => {
    const speech = voice(["stop"]);
    await mount(NOTE, speech, {
      status: (face) =>
        face.question === "Capital of France" ? "Due today" : "Next review in 6 days",
      grade: vi.fn(),
    });
    fireEvent.click(await screen.findByRole("button", { name: "Start" }));
    await screen.findByText(/Done:/);
    expect(speech.said[0]).toBe("Capital of France");
  });

  it("stops after it hears nothing for a while", async () => {
    const speech = voice([]);
    await mount(NOTE, speech);
    fireEvent.click(await screen.findByRole("button", { name: "Start" }));
    await screen.findByText(/Done:/);
    expect(speech.said).toContain("I haven't heard anything, so I'll stop here.");
  });

  it("says when the browser cannot speak and listen", async () => {
    await mount(NOTE, null);
    expect(await screen.findByText(/cannot both speak and listen/)).toBeTruthy();
  });

  it("writes the block back as the same empty fence", async () => {
    const editor = await mount(NOTE, voice([]));
    expect(markdownOf(editor).trim()).toBe(NOTE);
  });
});
