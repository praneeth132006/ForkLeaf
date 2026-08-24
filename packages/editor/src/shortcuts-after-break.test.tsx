// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { WysiwygEditor, markdownOf } from "./WysiwygEditor";

afterEach(cleanup);

/**
 * Typing `- ` at the start of a line.
 *
 * This looked like flakiness — "sometimes the dash makes a bullet and
 * sometimes it doesn't" — and had an exact rule behind it. Enter inserts a
 * hard break here rather than splitting the paragraph, so the split view can
 * promise that one line on the left is one line on the right. Tiptap's own
 * input rules fire at the start of a *block*, and the second line of a
 * paragraph is not one. So the first line made a list and every line after it
 * did nothing.
 *
 * These type the characters through the editor rather than calling commands,
 * because the bug was in whether the rule fired at all.
 */

async function mount(): Promise<Editor> {
  let editor: Editor | null = null;
  render(
    <WysiwygEditor
      value=""
      onChange={vi.fn()}
      onReady={(instance) => {
        editor = instance;
      }}
    />,
  );

  await waitFor(() => expect(editor).not.toBeNull(), { timeout: 4000 });
  return editor!;
}

/**
 * Types text the way a keyboard does.
 *
 * Deliberately not `insertContent`: that dispatches a transaction directly and
 * never goes near `handleTextInput`, which is the hook input rules live on. A
 * test written that way passes against the broken code, because it is not
 * exercising the thing that was broken. This is the path ProseMirror itself
 * takes for a typed character — offer it to the input rules first, and insert
 * it plainly only if none of them claimed it.
 */
function type(editor: Editor, text: string): void {
  const { view } = editor;

  for (const character of text) {
    const { from, to } = view.state.selection;
    // The fifth argument is the transaction ProseMirror would have applied
    // had no handler claimed the keystroke — passed through so this stays the
    // real signature rather than a convenient subset of it.
    const handled = view.someProp("handleTextInput", (handler) =>
      handler(view, from, to, character, () => view.state.tr.insertText(character, from, to)),
    );
    if (!handled) view.dispatch(view.state.tr.insertText(character, from, to));
  }
}

describe("markdown shortcuts after a line break", () => {
  it("makes a bullet on the first line, as it always did", async () => {
    const editor = await mount();

    type(editor, "- one");

    expect(editor.isActive("bulletList")).toBe(true);
    expect(markdownOf(editor)).toContain("- one");
  });

  it("makes a bullet on the second line too — the bug", async () => {
    const editor = await mount();

    type(editor, "Some prose");
    editor.commands.setHardBreak();
    type(editor, "- one");

    expect(editor.isActive("bulletList")).toBe(true);

    const markdown = markdownOf(editor);
    expect(markdown).toContain("Some prose");
    expect(markdown).toContain("- one");
    // The dash itself must not survive as text next to the bullet.
    expect(markdown).not.toContain("- - one");
  });

  it("keeps the prose above it in its own paragraph", async () => {
    const editor = await mount();

    type(editor, "Intro line");
    editor.commands.setHardBreak();
    type(editor, "- first");

    const markdown = markdownOf(editor);
    expect(markdown.indexOf("Intro line")).toBeLessThan(markdown.indexOf("- first"));
  });

  it("makes a numbered list after a break", async () => {
    const editor = await mount();

    type(editor, "Steps:");
    editor.commands.setHardBreak();
    type(editor, "1. first");

    expect(editor.isActive("orderedList")).toBe(true);
  });

  it("makes a heading after a break", async () => {
    const editor = await mount();

    type(editor, "Intro");
    editor.commands.setHardBreak();
    type(editor, "## Section");

    expect(editor.isActive("heading", { level: 2 })).toBe(true);
  });

  it("makes a quote after a break", async () => {
    const editor = await mount();

    type(editor, "They said:");
    editor.commands.setHardBreak();
    type(editor, "> quoted");

    expect(editor.isActive("blockquote")).toBe(true);
  });

  it("leaves a dash alone inside a code block, where it is just a dash", async () => {
    const editor = await mount();

    editor.commands.setCodeBlock();
    // A code block has no hard breaks — a newline in one is literal text —
    // so this is what "the next line" means in here.
    type(editor, "x\n- not a bullet");

    expect(editor.isActive("codeBlock")).toBe(true);
    expect(editor.isActive("bulletList")).toBe(false);
    expect(markdownOf(editor)).toContain("- not a bullet");
  });

  it("does not fire on a dash in the middle of a sentence", async () => {
    const editor = await mount();

    type(editor, "well - actually");

    expect(editor.isActive("bulletList")).toBe(false);
    expect(markdownOf(editor)).toContain("well - actually");
  });
});
