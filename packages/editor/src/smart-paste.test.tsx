// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { WysiwygEditor, markdownOf } from "./WysiwygEditor";
import { runRichAction } from "./insert-actions";

afterEach(cleanup);

/**
 * What happens to something pasted in from somewhere else.
 *
 * A script copied out of a notes app used to arrive as one paragraph per line,
 * with a paragraph's margin between every line of it, and turning the lot into
 * code afterwards produced one code block per line. These drive the real paste
 * hook with the two flavours a clipboard actually carries, because the bug was
 * in which of them the editor believed.
 */

async function mount(value = ""): Promise<Editor> {
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

/**
 * A paste, as ProseMirror sees one.
 *
 * `clipboardData` is a stub because jsdom has no clipboard: what matters is
 * that both flavours are offered, since the whole question is which one the
 * editor should trust.
 */
function paste(editor: Editor, text: string, html = ""): boolean {
  const { view } = editor;
  const event = {
    clipboardData: {
      files: [] as File[],
      // Only the two flavours a real clipboard offers here. Anything else —
      // `vscode-editor-data`, say — has to come back empty, because the
      // handler that reads it parses whatever it is given.
      getData: (type: string) => (type === "text/html" ? html : type === "text/plain" ? text : ""),
    },
    preventDefault: () => {},
  };

  return Boolean(
    view.someProp("handlePaste", (handler) =>
      handler(view, event as unknown as ClipboardEvent, view.state.selection.content()),
    ),
  );
}

const SCRIPT = `#!/bin/bash
domain=$1

info_path="$domain/info"
mkdir -p "$info_path"
whois "$domain" > "$info_path/whois.txt"`;

const COMMANDS = `whois tcm-sec.com
subfinder -d tcm-sec.com
assetfinder tcm-sec.com
cat tesla.txt | sort -u | httprobe -s -p https:443`;

describe("pasting code", () => {
  it("makes one code block, not one paragraph per line", async () => {
    const editor = await mount();

    expect(paste(editor, SCRIPT)).toBe(true);

    const blocks = editor.state.doc.content.content.filter(
      (node) => node.type.name === "codeBlock",
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.textContent).toBe(SCRIPT);
  });

  it("tags it with the language it is in", async () => {
    const editor = await mount();
    paste(editor, SCRIPT);

    expect(markdownOf(editor)).toContain("```bash");
  });

  it("catches a run of shell commands, which carries no shebang", async () => {
    const editor = await mount();
    paste(editor, COMMANDS);

    const markdown = markdownOf(editor);
    expect(markdown).toContain("```bash");
    expect(markdown).toContain("cat tesla.txt | sort -u");
    // One fence, opened and closed, rather than one per command.
    expect(markdown.match(/```/g)).toHaveLength(2);
  });

  it("does it even when the clipboard also carries the source's own HTML", async () => {
    const editor = await mount();
    const html = COMMANDS.split("\n")
      .map((line) => `<p>${line}</p>`)
      .join("");

    paste(editor, COMMANDS, html);

    expect(markdownOf(editor)).toContain("```bash");
  });

  it("leaves the note somewhere to carry on writing", async () => {
    const editor = await mount();
    paste(editor, SCRIPT);

    const last = editor.state.doc.lastChild;
    expect(last?.type.name).toBe("paragraph");
  });

  it("stays out of a code block, where a paste is just text", async () => {
    const editor = await mount("```js\nconst a = 1;\n```");
    editor.commands.setTextSelection(3);

    expect(paste(editor, COMMANDS)).toBe(false);
  });

  it("leaves ordinary writing alone", async () => {
    const editor = await mount();
    const prose = "Met the team about the migration.\nWe ship the importer first.";

    expect(paste(editor, prose)).toBe(false);
  });
});

describe("pasting from something that writes one paragraph per line", () => {
  const LINES = ["Subfinder - https://github.com/projectdiscovery/subfinder", "Amass - see wiki"];
  const HTML = LINES.map((line) => `<p>${line}</p>`).join("");

  it("keeps them as lines rather than as spaced-out paragraphs", async () => {
    const editor = await mount();

    expect(paste(editor, LINES.join("\n"), HTML)).toBe(true);

    // One paragraph holding both lines with a break between them, rather than
    // two paragraphs with a margin between them.
    expect(editor.state.doc.childCount).toBe(1);
    expect(countHardBreaks(editor)).toBe(1);
    // And one newline in the file, which is what a line break is here.
    expect(markdownOf(editor).trim().split("\n")).toHaveLength(2);
  });

  it("finds the links in them", async () => {
    const editor = await mount();
    paste(editor, LINES.join("\n"), HTML);

    expect(markdownOf(editor)).toContain("https://github.com/projectdiscovery/subfinder");
    expect(hasLink(editor)).toBe(true);
  });

  it("leaves real structure to ProseMirror, which handles it", async () => {
    const editor = await mount();
    const structured = "<h1>Setup</h1><ul><li>one</li><li>two</li></ul>";

    expect(paste(editor, "Setup\none\ntwo", structured)).toBe(false);
  });
});

describe("turning a selection into code", () => {
  it("makes one block out of everything selected, not one block per line", async () => {
    const editor = await mount("whois tcm-sec.com\n\nsubfinder -d tcm-sec.com\n\namass enum");
    editor.commands.selectAll();

    runRichAction(editor, "code");

    const blocks = editor.state.doc.content.content.filter(
      (node) => node.type.name === "codeBlock",
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.textContent.split("\n")).toHaveLength(3);
  });

  it("keeps the lines apart instead of running them together", async () => {
    const editor = await mount("assetfinder tcm-sec.com\n\namass enum -d tcm-sec.com");
    editor.commands.selectAll();

    runRichAction(editor, "code");

    expect(editor.state.doc.firstChild?.textContent).toContain("tcm-sec.com\namass");
  });

  it("still toggles a single block the way it always did", async () => {
    const editor = await mount("one line");
    // A selection within the one paragraph, which is the case Tiptap's own
    // toggle already handles correctly and which this must not take over.
    editor.commands.setTextSelection({ from: 1, to: 9 });

    runRichAction(editor, "code");
    expect(editor.isActive("codeBlock")).toBe(true);

    runRichAction(editor, "code");
    expect(editor.isActive("codeBlock")).toBe(false);
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

/** Whether anything in the document carries a link mark. */
function hasLink(editor: Editor): boolean {
  let found = false;
  editor.state.doc.descendants((node) => {
    if (node.marks.some((mark) => mark.type.name === "link")) found = true;
  });
  return found;
}
