// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { WysiwygEditor, markdownOf } from "./WysiwygEditor";

afterEach(cleanup);

/**
 * Getting back out of a code span or a link.
 *
 * Both marks carry on into whatever you type next, and the escape Tiptap ships
 * only fires at the end of a paragraph — which, in an editor where Enter makes
 * a line, is almost never where the caret is. So a three-letter code span at
 * the end of a line meant the rest of the sentence was in monospace too.
 */

async function mount(markdown: string): Promise<Editor> {
  let editor: Editor | null = null;
  render(
    <WysiwygEditor
      value={markdown}
      onChange={vi.fn()}
      onReady={(instance) => {
        editor = instance;
      }}
    />,
  );
  await waitFor(() => expect(editor).not.toBeNull(), { timeout: 4000 });
  return editor!;
}

function press(editor: Editor, key: string): boolean {
  const { view } = editor;
  return Boolean(
    view.someProp("handleKeyDown", (handler) =>
      handler(view, new KeyboardEvent("keydown", { key, bubbles: true })),
    ),
  );
}

/** The caret at the end of the code span, which is where people get stuck. */
function caretAfterCode(editor: Editor): void {
  let end = -1;
  editor.state.doc.descendants((node, pos) => {
    if (node.isText && node.marks.some((mark) => mark.type.name === "code")) {
      end = pos + node.nodeSize;
    }
  });
  expect(end).toBeGreaterThan(-1);
  editor.commands.setTextSelection(end);
}

describe("leaving a code span at the end of a line", () => {
  it("lets the next words be ordinary text", async () => {
    // A code span at the end of a line, with another line under it — so this
    // is not the end of the paragraph and Tiptap's own escape does nothing.
    const editor = await mount("use the `MHA` \nnext line");
    caretAfterCode(editor);

    expect(press(editor, "ArrowRight")).toBe(true);
    editor.commands.insertContent("tool");

    expect(markdownOf(editor)).toContain("`MHA`");
    expect(markdownOf(editor)).not.toContain("`MHAtool`");
    expect(markdownOf(editor)).not.toContain("`MHA tool`");
  });

  it("puts a space in, so there is somewhere outside the span to stand", async () => {
    const editor = await mount("use the `MHA`\nnext line");
    caretAfterCode(editor);

    press(editor, "ArrowRight");

    expect(editor.state.doc.textBetween(0, editor.state.doc.content.size, "\n", "\n")).toContain(
      "MHA ",
    );
  });

  it("leaves the caret unmarked, whatever is typed next", async () => {
    const editor = await mount("use the `MHA`\nnext line");
    caretAfterCode(editor);
    press(editor, "ArrowRight");

    const marks = editor.state.storedMarks ?? editor.state.selection.$from.marks();
    expect(marks.some((mark) => mark.type.name === "code")).toBe(false);
  });

  it("gets out on Escape too, without adding anything", async () => {
    const editor = await mount("use the `MHA`\nnext line");
    caretAfterCode(editor);

    expect(press(editor, "Escape")).toBe(true);
    expect(editor.state.doc.textContent).toContain("MHA");
    expect(editor.state.doc.textContent).not.toContain("MHA ");
  });

  it("does nothing in the middle of a span, where the arrow key already works", async () => {
    const editor = await mount("use the `MHA` tool");
    let start = -1;
    editor.state.doc.descendants((node, pos) => {
      if (node.isText && node.marks.some((mark) => mark.type.name === "code")) start = pos;
    });
    editor.commands.setTextSelection(start + 1);

    expect(press(editor, "ArrowRight")).toBe(false);
  });

  it("does nothing in ordinary text", async () => {
    const editor = await mount("just writing");
    editor.commands.setTextSelection(5);

    expect(press(editor, "ArrowRight")).toBe(false);
  });
});

describe("leaving a link at the end of a line", () => {
  it("stops the next words being swallowed by the address", async () => {
    const editor = await mount("GreenShot: https://getgreenshot.org/downloads/\nFlameShot");
    let end = -1;
    editor.state.doc.descendants((node, pos) => {
      if (node.isText && node.marks.some((mark) => mark.type.name === "link")) {
        end = pos + node.nodeSize;
      }
    });
    editor.commands.setTextSelection(end);

    expect(press(editor, "ArrowRight")).toBe(true);
    editor.commands.insertContent("(prefer)");

    const links: string[] = [];
    editor.state.doc.descendants((node) => {
      if (node.marks.some((mark) => mark.type.name === "link")) links.push(node.textContent);
    });
    expect(links.join("")).not.toContain("prefer");
  });
});
