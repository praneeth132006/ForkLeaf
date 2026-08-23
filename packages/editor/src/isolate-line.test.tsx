// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { WysiwygEditor, markdownOf } from "./WysiwygEditor";
import { isolateCurrentLine } from "./isolate-line";

afterEach(cleanup);

/**
 * Isolating a line before a block command runs.
 *
 * Enter here makes a hard break, so "three lines" is one paragraph. Block
 * commands act on a node, so running one from the slash menu on the last line
 * rewrote the whole paragraph: `/h1` at the bottom of a five-line paragraph
 * turned all five into one heading, and there was no undo-shaped way to explain
 * that to somebody who had pointed at a single line.
 *
 * These mount the real editor rather than a stub, because the thing under test
 * is a ProseMirror transaction against a real schema.
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

/** Puts the caret at the end of the line containing `text`. */
function caretAtEndOf(editor: Editor, text: string) {
  let found = -1;
  editor.state.doc.descendants((node, pos) => {
    if (node.isText && node.text === text && found === -1) found = pos + text.length;
  });
  expect(found).toBeGreaterThan(-1);
  editor.commands.setTextSelection(found);
}

describe("isolateCurrentLine", () => {
  it("splits the last line of a multi-line paragraph out on its own", async () => {
    const editor = await mount("alpha\nbravo\ncharlie");
    caretAtEndOf(editor, "charlie");

    expect(isolateCurrentLine(editor)).toBe(true);
    // The block the caret is in is now just that line.
    expect(editor.state.selection.$from.parent.textContent).toBe("charlie");
  });

  it("splits a middle line away from both its neighbours", async () => {
    const editor = await mount("alpha\nbravo\ncharlie");
    caretAtEndOf(editor, "bravo");

    expect(isolateCurrentLine(editor)).toBe(true);
    expect(editor.state.selection.$from.parent.textContent).toBe("bravo");
  });

  it("splits the first line away from what follows it", async () => {
    const editor = await mount("alpha\nbravo");
    caretAtEndOf(editor, "alpha");

    expect(isolateCurrentLine(editor)).toBe(true);
    expect(editor.state.selection.$from.parent.textContent).toBe("alpha");
  });

  it("does nothing to a paragraph that is already one line", async () => {
    const editor = await mount("alpha");
    caretAtEndOf(editor, "alpha");

    expect(isolateCurrentLine(editor)).toBe(false);
  });

  // The whole point: what the writer sees on the page is unchanged. Only the
  // shape of the document underneath it moved, so the command that runs next
  // has a single line to act on.
  it("does not change the markdown it produces", async () => {
    const editor = await mount("alpha\nbravo\ncharlie");
    caretAtEndOf(editor, "bravo");
    isolateCurrentLine(editor);

    expect(markdownOf(editor)).toBe("alpha\n\nbravo\n\ncharlie");
  });

  it("leaves only the isolated line as a heading, not the lines above it", async () => {
    const editor = await mount("alpha\nbravo\ncharlie");
    caretAtEndOf(editor, "charlie");

    isolateCurrentLine(editor);
    editor.chain().focus().toggleHeading({ level: 1 }).run();

    // The reported bug: this used to be "# alpha\nbravo\ncharlie" — every line
    // in the paragraph swallowed by the heading. Only "charlie" needed its own
    // block, so "alpha" and "bravo" rightly stay one paragraph.
    expect(markdownOf(editor)).toBe("alpha\nbravo\n\n# charlie");
  });
});
