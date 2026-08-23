// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { WysiwygEditor, markdownOf } from "./WysiwygEditor";

afterEach(cleanup);

/**
 * What the rich editor writes back to the file.
 *
 * This is the only surface in ForkLeaf that can silently rewrite somebody's
 * notes: it parses Markdown into a document model and serialises it back on
 * every keystroke, so anything the round trip does not preserve is destroyed
 * the moment a file is opened in it. Two bugs had already shipped that way —
 * wikilinks coming back as `\[\[…\]\]`, and line breaks as `\` + newline —
 * and both looked correct on screen while being wrong on disk.
 *
 * So these assert the exact bytes, not the rendering.
 */

/**
 * Mounts the editor on `input` and returns what it would write back.
 *
 * Read through `onReady` rather than by forcing an edit and catching
 * `onChange`: an edit would test what the edit did, and the failure being
 * guarded here is the one where merely *opening* a file rewrites it.
 */
async function roundTrip(input: string): Promise<string> {
  let editor: Editor | null = null;
  render(
    <WysiwygEditor
      value={input}
      onChange={vi.fn()}
      onReady={(instance) => {
        editor = instance;
      }}
    />,
  );

  await waitFor(() => expect(editor).not.toBeNull(), { timeout: 4000 });
  return markdownOf(editor!);
}

describe("markdown round trip", () => {
  it("keeps single newlines as single newlines", async () => {
    // The bug: these came back as one run-on paragraph in rich text, and the
    // two editing surfaces disagreed about what the file said.
    await expect(roundTrip("alpha\nbravo\ncharlie")).resolves.toBe("alpha\nbravo\ncharlie");
  });

  it("does not grow a backslash on every line", async () => {
    const out = await roundTrip("alpha\nbravo");
    expect(out).not.toContain("\\");
  });

  it("keeps a blank line between paragraphs as exactly one blank line", async () => {
    await expect(roundTrip("alpha\n\nbravo")).resolves.toBe("alpha\n\nbravo");
  });

  it("separates a heading from its paragraph with one blank line, not two", async () => {
    await expect(roundTrip("# Title\n\nalpha\nbravo")).resolves.toBe("# Title\n\nalpha\nbravo");
  });

  it("normalises a heading written with no blank line after it", async () => {
    // Markdown allows it; the serialiser has to add the separator. What it
    // must not do is add two.
    await expect(roundTrip("# Title\nalpha")).resolves.toBe("# Title\n\nalpha");
  });

  it("leaves wikilinks unescaped", async () => {
    await expect(roundTrip("See [[Q3 Roadmap]] today")).resolves.toBe("See [[Q3 Roadmap]] today");
  });

  it("preserves lists without reflowing them into a paragraph", async () => {
    await expect(roundTrip("- one\n- two\n- three")).resolves.toBe("- one\n- two\n- three");
  });

  it("preserves a fenced code block verbatim", async () => {
    const source = "```js\nconst a = 1;\nconst b = 2;\n```";
    await expect(roundTrip(source)).resolves.toBe(source);
  });

  it("preserves a mermaid block, which is how every diagram is stored", async () => {
    const source = "```mermaid\nflowchart TD\n  A --> B\n```";
    await expect(roundTrip(source)).resolves.toBe(source);
  });

  it("preserves a blockquote", async () => {
    await expect(roundTrip("> quoted line\n> second line")).resolves.toBe(
      "> quoted line\n> second line",
    );
  });

  it("preserves inline marks, normalising the emphasis delimiter", async () => {
    // `_em_` comes back as `*em*`. Both are emphasis and both render
    // identically everywhere, so this is a formatting normalisation rather
    // than a loss — and it is idempotent, so a file settles after one save
    // instead of churning. Asserted rather than ignored because if it ever
    // starts dropping the mark instead of respelling it, that is data loss.
    await expect(roundTrip("**bold** and _em_ and `code`")).resolves.toBe(
      "**bold** and *em* and `code`",
    );
  });

  it("collapses a run of blank lines to one, and stays there", async () => {
    // Enter now writes a line break rather than splitting the paragraph, so
    // extra blank lines only arrive from a file written elsewhere. Markdown
    // reads any run of them as a single paragraph break; the serialiser has to
    // agree, and — more importantly — has to stop moving after one pass.
    const once = await roundTrip("alpha\n\n\n\nbravo");
    expect(once).toBe("alpha\n\nbravo");
    await expect(roundTrip(once)).resolves.toBe(once);
  });

  it("keeps a trailing newline from turning into a growing gap", async () => {
    // The failure worth guarding: a file that gains a line every time it is
    // opened. Whatever the first pass settles on, the second must match.
    const once = await roundTrip("alpha\nbravo\n");
    await expect(roundTrip(once)).resolves.toBe(once);
  });

  it("survives a document with every construct at once", async () => {
    const source = [
      "# Title",
      "",
      "alpha",
      "bravo",
      "",
      "- one",
      "- two",
      "",
      "> quoted",
      "",
      "```js",
      "const a = 1;",
      "```",
      "",
      "See [[Another note]].",
    ].join("\n");

    await expect(roundTrip(source)).resolves.toBe(source);
  });
});
