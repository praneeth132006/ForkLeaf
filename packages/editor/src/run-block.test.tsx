// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { WysiwygEditor, markdownOf } from "./WysiwygEditor";

afterEach(cleanup);

async function mount(markdown: string): Promise<Editor> {
  let editor: Editor | null = null;
  render(<WysiwygEditor value={markdown} onChange={vi.fn()} onReady={(i) => (editor = i)} />);
  await waitFor(() => expect(editor).not.toBeNull(), { timeout: 4000 });
  return editor!;
}

/** The next fetch resolves as a completed run. */
function runs(body: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          stdout: "",
          stderr: "",
          exitCode: 0,
          ms: 120,
          truncated: false,
          ranAt: "2026-08-27T10:04:09.000Z",
          ...body,
        }),
    }),
  );
}

/** The next fetch is refused by the API. */
function refuses(status: number, message: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      status,
      json: () => Promise.resolve({ error: { code: "x", message } }),
    }),
  );
}

const runButton = () => screen.getByRole("button", { name: /^run$/i });

/**
 * The document's blocks as [language, text].
 *
 * Asserted on instead of child counts: the editor keeps a trailing empty
 * paragraph for the caret, so counting children measures that as much as it
 * measures the result.
 */
function blocks(editor: Editor): [string, string][] {
  const found: [string, string][] = [];
  editor.state.doc.forEach((node) => {
    if (node.type.name === "codeBlock") found.push([node.attrs.language ?? "", node.textContent]);
    else if (node.textContent) found.push([node.type.name, node.textContent]);
  });
  return found;
}

const outputOf = (editor: Editor) =>
  blocks(editor).find(([lang]) => lang === "output")?.[1] ?? null;

beforeEach(() => vi.unstubAllGlobals());

describe("which blocks offer to run", () => {
  it("offers a Run button on a shell block", async () => {
    await mount("```bash\necho hi\n```");
    expect(runButton()).toBeTruthy();
  });

  it("offers one on a python block", async () => {
    await mount("```python\nprint(1)\n```");
    expect(runButton()).toBeTruthy();
  });

  it("offers one on a javascript block", async () => {
    await mount("```js\nconsole.log(1)\n```");
    expect(runButton()).toBeTruthy();
  });

  it("offers nothing on a language nothing can interpret", async () => {
    await mount("```rust\nfn main() {}\n```");
    expect(screen.queryByRole("button", { name: /^run$/i })).toBeNull();
  });

  it("offers nothing on an unlabelled block", async () => {
    await mount("```\nplain text\n```");
    expect(screen.queryByRole("button", { name: /^run$/i })).toBeNull();
  });

  it("never offers to run a block that is itself a result", async () => {
    // Otherwise the output grows a Run button, and pressing it executes the
    // last run's stdout as a script.
    await mount("```output\n— ran 2026-08-27 10:04 UTC · ok · 12ms\nhi\n```");
    expect(screen.queryByRole("button", { name: /^run$/i })).toBeNull();
  });

  it("still offers Copy on a block it cannot run", async () => {
    await mount("```rust\nfn main() {}\n```");
    expect(screen.getByRole("button", { name: /copy/i })).toBeTruthy();
  });
});

describe("running a block", () => {
  it("sends the code and its language", async () => {
    runs({ stdout: "hi" });
    await mount("```bash\necho hi\n```");
    fireEvent.click(runButton());

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/run",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ language: "bash", code: "echo hi" }),
        }),
      ),
    );
  });

  it("writes what came back into a block underneath", async () => {
    runs({ stdout: "hello" });
    const editor = await mount("```bash\necho hello\n```");
    fireEvent.click(runButton());

    await waitFor(() => expect(outputOf(editor)).not.toBeNull());

    expect(outputOf(editor)).toContain("hello");
    expect(outputOf(editor)).toContain("2026-08-27 10:04 UTC");
  });

  it("writes it back as an ordinary fenced block, readable anywhere", async () => {
    runs({ stdout: "hello" });
    const editor = await mount("```bash\necho hello\n```");
    fireEvent.click(runButton());

    await waitFor(() => expect(outputOf(editor)).not.toBeNull());
    const markdown = markdownOf(editor);

    expect(markdown).toContain("```output");
    expect(markdown).toContain("hello");
    // The script itself is untouched.
    expect(markdown).toContain("```bash\necho hello\n```");
  });

  it("records a failing script as a result, with its exit code", async () => {
    runs({ stderr: "no such file", exitCode: 2 });
    const editor = await mount("```bash\ncat nope\n```");
    fireEvent.click(runButton());

    await waitFor(() => expect(outputOf(editor)).not.toBeNull());
    expect(outputOf(editor)).toContain("exit 2");
    expect(outputOf(editor)).toContain("no such file");
  });

  it("records a sandbox that never ran the script", async () => {
    runs({ failure: "timed out after 30s", exitCode: -1 });
    const editor = await mount("```bash\nsleep 999\n```");
    fireEvent.click(runButton());

    await waitFor(() => expect(outputOf(editor)).not.toBeNull());
    expect(outputOf(editor)).toContain("timed out after 30s");
  });

  it("says a command printed nothing rather than leaving an empty block", async () => {
    runs({ stdout: "", stderr: "" });
    const editor = await mount("```bash\ntrue\n```");
    fireEvent.click(runButton());

    await waitFor(() => expect(outputOf(editor)).not.toBeNull());
    expect(outputOf(editor)).toContain("(no output)");
  });

  it("shows that it is running while the sandbox works", async () => {
    let release: (value: unknown) => void = () => {};
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise((resolve) => (release = resolve))));

    await mount("```bash\necho hi\n```");
    fireEvent.click(runButton());

    await waitFor(() => expect(screen.getByRole("button", { name: /running/i })).toBeTruthy());
    expect(screen.getByRole("button", { name: /running/i })).toHaveProperty("disabled", true);

    release({
      ok: true,
      json: () => Promise.resolve({ stdout: "hi", exitCode: 0, ms: 1, ranAt: "" }),
    });
  });
});

describe("running a block a second time", () => {
  it("replaces the previous result instead of stacking another under it", async () => {
    runs({ stdout: "first" });
    const editor = await mount("```bash\necho hi\n```");

    fireEvent.click(runButton());
    await waitFor(() => expect(outputOf(editor)).toContain("first"));

    runs({ stdout: "second" });
    fireEvent.click(runButton());

    await waitFor(() => expect(outputOf(editor)).toContain("second"));
    expect(blocks(editor).filter(([lang]) => lang === "output")).toHaveLength(1);
    expect(outputOf(editor)).not.toContain("first");
  });

  it("does not swallow a paragraph that happens to follow the block", async () => {
    runs({ stdout: "hi" });
    const editor = await mount("```bash\necho hi\n```\n\nSome prose after it.");
    fireEvent.click(runButton());

    await waitFor(() => expect(outputOf(editor)).not.toBeNull());
    expect(blocks(editor)).toEqual([
      ["bash", "echo hi"],
      ["output", expect.stringContaining("hi")],
      ["paragraph", "Some prose after it."],
    ]);
  });

  it("does not mistake a following code block in another language for its output", async () => {
    runs({ stdout: "hi" });
    const editor = await mount("```bash\necho hi\n```\n\n```python\nprint(1)\n```");
    // Two runnable blocks, so two buttons; this is the first block's.
    fireEvent.click(screen.getAllByRole("button", { name: /^run$/i })[0]!);

    await waitFor(() => expect(outputOf(editor)).not.toBeNull());
    expect(blocks(editor).map(([lang]) => lang)).toEqual(["bash", "output", "python"]);
  });
});

describe("when the run is refused", () => {
  it("shows why, and writes nothing into the note", async () => {
    refuses(429, "Too many runs. Try again shortly.");
    const editor = await mount("```bash\necho hi\n```");
    fireEvent.click(runButton());

    await waitFor(() => expect(screen.getByText(/too many runs/i)).toBeTruthy());
    // The note should not record the app declining to run something.
    expect(outputOf(editor)).toBeNull();
  });

  it("passes on what the server said about a missing sandbox", async () => {
    refuses(503, "Running blocks needs a sandbox, which this deployment is not configured for.");
    await mount("```bash\necho hi\n```");
    fireEvent.click(runButton());

    await waitFor(() => expect(screen.getByText(/not configured for/i)).toBeTruthy());
  });

  it("says something useful when the request never arrived", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const editor = await mount("```bash\necho hi\n```");
    fireEvent.click(runButton());

    await waitFor(() => expect(screen.getByText(/could not reach the server/i)).toBeTruthy());
    expect(outputOf(editor)).toBeNull();
  });

  it("clears an old failure when a later run succeeds", async () => {
    refuses(429, "Too many runs. Try again shortly.");
    const editor = await mount("```bash\necho hi\n```");
    fireEvent.click(runButton());
    await waitFor(() => expect(screen.getByText(/too many runs/i)).toBeTruthy());

    runs({ stdout: "worked" });
    fireEvent.click(runButton());

    await waitFor(() => expect(outputOf(editor)).toContain("worked"));
    expect(screen.queryByText(/too many runs/i)).toBeNull();
  });

  it("becomes clickable again after a failure", async () => {
    refuses(500, "Something went wrong.");
    await mount("```bash\necho hi\n```");
    fireEvent.click(runButton());

    await waitFor(() => expect(screen.getByText(/something went wrong/i)).toBeTruthy());
    expect(runButton()).toHaveProperty("disabled", false);
  });
});
