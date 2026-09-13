// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { WysiwygEditor, markdownOf } from "./WysiwygEditor";
import type { ReadingBridge, ReadingPassage } from "./extensions/ReadingBlock";

afterEach(cleanup);

const PASSAGES: ReadingPassage[] = [
  {
    id: "aaaaaaaa",
    text: "Attention is all you need for sequence transduction",
    source: "Attention",
    path: "papers/attention.highlights.md",
    where: "p. 3",
    isNew: true,
  },
  {
    id: "bbbbbbbb",
    text: "The best way to predict the future is to invent it.",
    source: "Alan Kay",
    path: "inbox/quote.md",
    where: "example.com",
    isNew: false,
  },
];

async function mount(markdown: string, reading?: ReadingBridge): Promise<Editor> {
  let editor: Editor | null = null;
  render(
    <WysiwygEditor
      value={markdown}
      onChange={vi.fn()}
      onReady={(instance) => (editor = instance)}
      {...(reading ? { reading } : {})}
    />,
  );
  await waitFor(() => expect(editor).not.toBeNull(), { timeout: 4000 });
  return editor!;
}

const bridge = (passages = PASSAGES): ReadingBridge & { choose: ReturnType<typeof vi.fn> } => ({
  load: vi.fn(async () => passages),
  choose: vi.fn(async (_passage: ReadingPassage, choice: string) =>
    choice === "done" ? "Won't come back" : "Back in 4 days",
  ),
  open: vi.fn(),
});

describe("a spaced-reading block in the note", () => {
  it("lists today's passages where the block is", async () => {
    await mount("# Today\n\n```reading\n```", bridge());
    expect(await screen.findByText(PASSAGES[0]!.text)).toBeTruthy();
    expect(screen.getByText("Attention · p. 3")).toBeTruthy();
    expect(screen.getByText("First time")).toBeTruthy();
    expect(screen.getByTestId("reading-count").textContent).toContain("2 to reread today");
  });

  it("sends a passage back later and says when it returns", async () => {
    const reading = bridge();
    await mount("```reading\n```", reading);
    await screen.findByText(PASSAGES[0]!.text);
    fireEvent.click(screen.getAllByRole("button", { name: "Later" })[0]!);
    expect(await screen.findByText("Back in 4 days")).toBeTruthy();
    expect(reading.choose).toHaveBeenCalledWith(PASSAGES[0], "later");
    expect(screen.getByTestId("reading-count").textContent).toContain("1 to reread today");
  });

  it("opens where a passage came from", async () => {
    const reading = bridge();
    await mount("```reading\n```", reading);
    fireEvent.click(await screen.findByRole("button", { name: "Alan Kay · example.com" }));
    expect(reading.open).toHaveBeenCalledWith("inbox/quote.md");
  });

  it("says what to do when there is nothing to reread", async () => {
    await mount("```reading\n```", bridge([]));
    expect(await screen.findByText(/Nothing to reread today/)).toBeTruthy();
  });

  it("writes the block back as the same empty fence", async () => {
    const editor = await mount("Before\n\n```reading\n```\n\nAfter", bridge());
    expect(markdownOf(editor).trim()).toBe("Before\n\n```reading\n```\n\nAfter");
  });

  it("is inserted from the editor, and needs a notebook to read", async () => {
    const editor = await mount("Notes");
    act(() => {
      editor.chain().focus("end").insertReading().run();
    });
    expect(await screen.findByText(/needs a notebook/)).toBeTruthy();
    expect(markdownOf(editor)).toContain("```reading\n```");
  });
});
