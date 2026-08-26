// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { WysiwygEditor, markdownOf } from "./WysiwygEditor";

afterEach(cleanup);

/**
 * Deleting the gap between two lines.
 *
 * Enter here makes a line rather than a paragraph, so the blank line between
 * two paragraphs is two presses of Enter. Backspace used to undo both of them
 * at once and run the lines together: `assetfinder tcm-sec.com` and `amass
 * enum -d tcm-sec.com` became one line reading `tcm-sec.comamass`, which reads
 * as a typo rather than as an edit anybody asked for.
 */

async function mount(value: string): Promise<Editor> {
  let editor: Editor | null = null;
  render(
    <WysiwygEditor
      value={value}
      onChange={vi.fn()}
      onReady={(instance) => {
        editor = instance;
      }}
    />,
  );

  await waitFor(() => expect(editor).not.toBeNull(), { timeout: 4000 });
  return editor!;
}

/** A key press, offered to the editor exactly as the browser would offer it. */
function press(editor: Editor, key: string): boolean {
  const { view } = editor;
  return Boolean(
    view.someProp("handleKeyDown", (handler) =>
      handler(view, new KeyboardEvent("keydown", { key, bubbles: true })),
    ),
  );
}

const TWO = "assetfinder tcm-sec.com\n\namass enum -d tcm-sec.com";

/**
 * The document as lines: a line break is a newline, a paragraph break a blank
 * line. Read off the document rather than from the markdown, because the
 * serialiser turns `tcm-sec.com` into a link once it sits next to other text
 * and that is a different question from this one.
 */
function lines(editor: Editor): string {
  const { doc } = editor.state;
  return doc.textBetween(0, doc.content.size, "\n\n", "\n");
}

describe("backspace at the start of a line", () => {
  it("closes the gap without running the lines together", async () => {
    const editor = await mount(TWO);
    // The start of the second paragraph, which is where the caret goes when
    // somebody clicks the blank line and presses Backspace.
    editor.commands.setTextSelection(editor.state.doc.child(0).nodeSize + 1);

    expect(press(editor, "Backspace")).toBe(true);

    // One paragraph now, but still two lines inside it.
    expect(editor.state.doc.childCount).toBe(1);
    expect(lines(editor)).toBe("assetfinder tcm-sec.com\namass enum -d tcm-sec.com");
    // And in the file: one line each, where there was a blank line before.
    expect(markdownOf(editor).trim().split("\n")).toHaveLength(2);
  });

  it("leaves the caret at the start of the line it moved, not somewhere else", async () => {
    const editor = await mount(TWO);
    editor.commands.setTextSelection(editor.state.doc.child(0).nodeSize + 1);
    press(editor, "Backspace");

    // Typing now continues the second line rather than the first.
    editor.commands.insertContent("x");
    expect(lines(editor)).toBe("assetfinder tcm-sec.com\nxamass enum -d tcm-sec.com");
  });

  it("leaves a break behind that one more press removes", async () => {
    const editor = await mount(TWO);
    editor.commands.setTextSelection(editor.state.doc.child(0).nodeSize + 1);
    press(editor, "Backspace");

    // A hard break sits between them and the caret is right after it, so the
    // next Backspace deletes that break and the lines join for real. The press
    // itself is the browser's own character delete, which jsdom has no
    // contentEditable to perform, so this checks the state it acts on.
    expect(countHardBreaks(editor)).toBe(1);
    // Right after the break: one for the paragraph's opening token, the first
    // line's characters, and one for the break itself.
    expect(editor.state.selection.from).toBe("assetfinder tcm-sec.com".length + 2);
  });

  it("still deletes an empty line rather than turning it into a break", async () => {
    const editor = await mount("");
    editor.commands.setContent({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "one" }] },
        { type: "paragraph" },
        { type: "paragraph", content: [{ type: "text", text: "two" }] },
      ],
    });
    // The start of "two", with an empty paragraph above it.
    editor.commands.setTextSelection(editor.state.doc.content.size - 4);

    press(editor, "Backspace");

    // The empty paragraph goes and the two paragraphs stay two paragraphs: a
    // blank line being deleted is not two lines being joined.
    expect(editor.state.doc.childCount).toBe(2);
    expect(countHardBreaks(editor)).toBe(0);
  });

  it("stays out of lists, where joining means something else", async () => {
    const editor = await mount("- one\n- two");
    // The start of the second item.
    editor.commands.setTextSelection(editor.state.doc.child(0).child(0).nodeSize + 2);

    press(editor, "Backspace");

    // Whatever the list does with that press is the list's business. What
    // matters is that this did not step in and put a line break inside it.
    expect(countHardBreaks(editor)).toBe(0);
  });
});

describe("delete at the end of a line", () => {
  it("pulls the next line up as a line, not as more of this one", async () => {
    const editor = await mount(TWO);
    editor.commands.setTextSelection(editor.state.doc.child(0).nodeSize - 1);

    expect(press(editor, "Delete")).toBe(true);
    expect(lines(editor)).toBe("assetfinder tcm-sec.com\namass enum -d tcm-sec.com");
  });
});

/** How many hard breaks the document holds, at any depth. */
function countHardBreaks(editor: Editor): number {
  let count = 0;
  editor.state.doc.descendants((node) => {
    if (node.type.name === "hardBreak") count += 1;
  });
  return count;
}
