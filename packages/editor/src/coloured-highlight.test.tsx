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

/**
 * Highlighting in a colour, and getting it back.
 *
 * The plain colour stays `==text==` — the syntax every markdown notebook
 * shares. Anything else is written as a `<mark>` with a class, which is the one
 * form that degrades honestly elsewhere, and it has to survive the round trip
 * or the colour is a lie the editor tells until you reopen the note.
 */
describe("coloured highlights in rich text", () => {
  it("writes the plain form for the default colour", async () => {
    const editor = await mount("nothing here");
    editor.commands.selectAll();
    editor.commands.setHighlight();

    expect(markdownOf(editor)).toContain("==nothing here==");
  });

  it("writes a colour as a mark the rest of the world understands", async () => {
    const editor = await mount("nothing here");
    editor.commands.selectAll();
    editor.commands.setHighlight({ color: "green" });

    expect(markdownOf(editor)).toContain('<mark class="fl-hl-green">nothing here</mark>');
  });

  it("reads that colour back when the note is opened again", async () => {
    const editor = await mount('a <mark class="fl-hl-pink">pink</mark> word');

    let colour: unknown = null;
    editor.state.doc.descendants((node) => {
      for (const mark of node.marks) {
        if (mark.type.name === "highlight") colour = mark.attrs.color;
      }
    });

    expect(colour).toBe("pink");
    // And writes it back unchanged, so opening a note is not an edit.
    expect(markdownOf(editor)).toContain('<mark class="fl-hl-pink">pink</mark>');
  });

  /**
   * The default colour, which is written as `==text==` and was the one that
   * did not come back: the serialiser wrote it, the preview rendered it, and
   * the rich editor showed the equals signs as text the next time the note was
   * opened.
   */
  it("reads a plain ==highlight== back as a highlight", async () => {
    const editor = await mount("a ==yellow== word");

    let found = false;
    editor.state.doc.descendants((node) => {
      for (const mark of node.marks) {
        if (mark.type.name === "highlight" && node.textContent === "yellow") found = true;
      }
    });

    expect(found).toBe(true);
    // And writes it back the way it was written, so opening a note is not an
    // edit to it.
    expect(markdownOf(editor).trim()).toBe("a ==yellow== word");
  });

  it("leaves == inside code exactly as typed, where it is an operator", async () => {
    const editor = await mount("check `a ==b== c` here\n\n```js\nif (a ==b== c) {}\n```");

    let highlights = 0;
    editor.state.doc.descendants((node) => {
      for (const mark of node.marks) if (mark.type.name === "highlight") highlights += 1;
    });

    expect(highlights).toBe(0);
    expect(markdownOf(editor)).toContain("`a ==b== c`");
  });

  it("leaves a colour it does not know as the text it was written as", async () => {
    const editor = await mount('a <mark class="fl-hl-chartreuse">odd</mark> word');

    expect(markdownOf(editor)).toContain("fl-hl-chartreuse");
    let highlighted = false;
    editor.state.doc.descendants((node) => {
      if (node.marks.some((mark) => mark.type.name === "highlight")) highlighted = true;
    });
    expect(highlighted).toBe(false);
  });
});
