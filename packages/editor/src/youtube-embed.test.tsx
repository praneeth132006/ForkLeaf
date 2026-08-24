// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { WysiwygEditor, markdownOf } from "./WysiwygEditor";

afterEach(cleanup);

async function mount(markdown: string): Promise<Editor> {
  let editor: Editor | null = null;
  render(<WysiwygEditor value={markdown} onChange={vi.fn()} onReady={(i) => (editor = i)} />);
  await waitFor(() => expect(editor).not.toBeNull(), { timeout: 4000 });
  return editor!;
}

describe("YouTube videos in rich text", () => {
  it("turns a link on its own line into a player", async () => {
    const editor = await mount("Watch this\n\nhttps://www.youtube.com/watch?v=dQw4w9WgXcQ");

    const node = editor.state.doc.child(editor.state.doc.childCount - 1);
    expect(node.type.name).toBe("youtubeEmbed");
    expect(node.attrs.src).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  });

  it("writes it back as the same plain link", async () => {
    const editor = await mount("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(markdownOf(editor).trim()).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  });

  it("keeps a link inside a sentence as a link", async () => {
    const editor = await mount("See https://youtu.be/dQw4w9WgXcQ for the demo.");
    expect(editor.state.doc.firstChild?.type.name).toBe("paragraph");
  });

  it("embeds a video pasted into an empty paragraph", async () => {
    const editor = await mount("");
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: {
        files: [],
        items: [],
        types: ["text/plain"],
        getData: () => "https://youtu.be/dQw4w9WgXcQ?t=42",
      },
    });
    editor.view.dom.dispatchEvent(event);

    await waitFor(() => {
      const found: string[] = [];
      editor.state.doc.descendants((node) => {
        if (node.type.name === "youtubeEmbed") found.push(node.attrs.src as string);
      });
      expect(found).toEqual(["https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s"]);
    });
  });
});
