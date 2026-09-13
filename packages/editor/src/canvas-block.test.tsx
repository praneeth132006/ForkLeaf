// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { WysiwygEditor, markdownOf } from "./WysiwygEditor";

afterEach(cleanup);

async function mount(markdown: string, editable = true): Promise<Editor> {
  let editor: Editor | null = null;
  render(
    <WysiwygEditor
      value={markdown}
      onChange={vi.fn()}
      editable={editable}
      onReady={(instance) => (editor = instance)}
      canvas={{
        loadNotes: async () => [{ path: "Plan.md", title: "Plan", excerpt: "Ship it" }],
        openNote: vi.fn(),
      }}
    />,
  );
  await waitFor(() => expect(editor).not.toBeNull(), { timeout: 4000 });
  return editor!;
}

const BOARD = [
  "```canvas",
  "{",
  '\t"nodes": [',
  "\t\t{",
  '\t\t\t"id": "a",',
  '\t\t\t"type": "text",',
  '\t\t\t"text": "First idea",',
  '\t\t\t"x": 0,',
  '\t\t\t"y": 0,',
  '\t\t\t"width": 200,',
  '\t\t\t"height": 100',
  "\t\t}",
  "\t],",
  '\t"edges": []',
  "}",
  "```",
].join("\n");

describe("a canvas in the note", () => {
  it("draws a ```canvas block as a board, in place", async () => {
    const editor = await mount(`# Plan\n\n${BOARD}\n\nAfter the board.`);
    const names: string[] = [];
    editor.state.doc.forEach((node) => names.push(node.type.name));
    expect(names).toEqual(["heading", "canvasBlock", "paragraph"]);
    expect(await screen.findByText("First idea")).toBeTruthy();
  });

  it("writes the block back unchanged", async () => {
    const editor = await mount(`Before\n\n${BOARD}\n\nAfter`);
    expect(markdownOf(editor).trim()).toBe(`Before\n\n${BOARD}\n\nAfter`);
  });

  it("inserts an empty board that is saved into the note", async () => {
    const editor = await mount("Notes");
    act(() => {
      editor.chain().focus("end").insertCanvas().run();
    });
    expect(await screen.findByText(/Double-click anywhere to add a card/)).toBeTruthy();
    expect(markdownOf(editor)).toContain('```canvas\n{\n\t"nodes": [],\n\t"edges": []\n}\n```');
  });

  it("keeps a card added on the board in the note's markdown", async () => {
    const editor = await mount(BOARD);
    await screen.findByText("First idea");
    fireEvent.click(screen.getByRole("button", { name: "Add card" }));
    fireEvent.change(await screen.findByLabelText("Card text"), {
      target: { value: "Second idea" },
    });
    await waitFor(() => expect(markdownOf(editor)).toContain('"text": "Second idea"'), {
      timeout: 2000,
    });
  });

  it("offers the notebook's notes to place", async () => {
    await mount(BOARD);
    expect(await screen.findByLabelText("Add a note")).toBeTruthy();
  });

  it("deletes a card with Delete without deleting the board from the note", async () => {
    const editor = await mount(`${BOARD}\n\nAfter`);
    const card = (await screen.findByText("First idea")).closest("[data-node-id]")!;
    fireEvent.pointerDown(card);
    fireEvent.keyDown(card, { key: "Delete" });
    await waitFor(() => expect(markdownOf(editor)).toContain('"nodes": []'), { timeout: 2000 });
    expect(markdownOf(editor)).toContain("After");
  });

  it("uses a longer fence when a card holds backticks", async () => {
    const editor = await mount("x");
    act(() => {
      editor
        .chain()
        .focus("end")
        .insertCanvas({
          nodes: [{ id: "a", type: "text", text: "```js", x: 0, y: 0, width: 10, height: 10 }],
          edges: [],
        })
        .run();
    });
    const markdown = markdownOf(editor);
    expect(markdown).toContain("````canvas");
    expect(markdownOf(await mount(markdown)).trim()).toBe(markdown.trim());
  });

  it("shows what is wrong with a block that is not a canvas, and keeps it", async () => {
    const editor = await mount("```canvas\nnot json\n```");
    expect(await screen.findByText(/not valid JSON Canvas/)).toBeTruthy();
    expect(markdownOf(editor).trim()).toBe("```canvas\nnot json\n```");
  });

  it("has no tools on a locked note", async () => {
    await mount(BOARD, false);
    await screen.findByText("First idea");
    expect(screen.queryByRole("button", { name: "Add card" })).toBeNull();
  });
});
