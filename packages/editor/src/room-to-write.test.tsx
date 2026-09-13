// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { WysiwygEditor, markdownOf } from "./WysiwygEditor";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** jsdom lays nothing out, so every box is 500 wide and ends 100px down. */
function layOut() {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 500,
    bottom: 100,
    width: 500,
    height: 100,
    toJSON: () => ({}),
  } as DOMRect);
}

async function mount(markdown: string): Promise<{ editor: Editor; wrapper: HTMLElement }> {
  let editor: Editor | null = null;
  const { container } = render(
    <WysiwygEditor
      value={markdown}
      onChange={vi.fn()}
      onReady={(instance) => (editor = instance)}
    />,
  );
  await waitFor(() => expect(editor).not.toBeNull(), { timeout: 4000 });
  return { editor: editor!, wrapper: container.firstElementChild as HTMLElement };
}

const last = (editor: Editor) => editor.state.doc.lastChild!.type.name;

describe("room to write below the last block", () => {
  it.each([
    ["a canvas", '```canvas\n{\n\t"nodes": [],\n\t"edges": []\n}\n```', "canvasBlock"],
    ["a flashcard", "Capital of France :: Paris", "flashcard"],
    ["a spaced-reading block", "```reading\n```", "readingBlock"],
  ])("puts a line under %s when the page below it is clicked", async (_name, markdown, type) => {
    const { editor, wrapper } = await mount(markdown);
    expect(last(editor)).toBe(type);
    layOut();

    fireEvent.mouseDown(wrapper, { button: 0, clientY: 400 });

    expect(last(editor)).toBe("paragraph");
    expect(editor.state.selection.$from.parent.type.name).toBe("paragraph");
    // An empty line is not a change to the file.
    expect(markdownOf(editor).trim()).toBe(markdown);
  });

  it("does not add a line when the note already ends in text", async () => {
    const { editor, wrapper } = await mount("Just text");
    layOut();
    fireEvent.mouseDown(wrapper, { button: 0, clientY: 400 });
    expect(editor.state.doc.childCount).toBe(1);
  });

  it("leaves a click on the block itself alone", async () => {
    const { editor, wrapper } = await mount("Capital of France :: Paris");
    layOut();
    fireEvent.mouseDown(wrapper, { button: 0, clientY: 50 });
    expect(last(editor)).toBe("flashcard");
  });

  it("does nothing on a locked note", async () => {
    let editor: Editor | null = null;
    const { container } = render(
      <WysiwygEditor
        value="Capital of France :: Paris"
        onChange={vi.fn()}
        editable={false}
        onReady={(instance) => (editor = instance)}
      />,
    );
    await waitFor(() => expect(editor).not.toBeNull(), { timeout: 4000 });
    layOut();
    fireEvent.mouseDown(container.firstElementChild!, { button: 0, clientY: 400 });
    expect(last(editor!)).toBe("flashcard");
  });
});
