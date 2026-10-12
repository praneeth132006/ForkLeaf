// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { WysiwygEditor, markdownOf } from "./WysiwygEditor";
import type { LiveCodeBridge } from "./extensions/LiveCodeBlock";

afterEach(cleanup);

const FILE_V1 =
  "export function login(user) {\n  return check(user);\n}\n\nexport const other = 1;\n";
const FILE_V2 = "export function login(user, code) {\n  return check(user, code);\n}\n";

function bridge(
  files: Record<string, string | null>,
): LiveCodeBridge & { read: ReturnType<typeof vi.fn> } {
  return {
    defaultRepo: "acme/api",
    read: vi.fn(async (repo: string, path: string) => {
      const key = `${repo}/${path}`;
      if (!(key in files)) throw new Error("GitHub could not be reached.");
      return files[key] ?? null;
    }),
    webUrl: (repo, path, _ref, from, to) =>
      `https://github.com/${repo}/blob/HEAD/${path}#L${from}-L${to}`,
  };
}

async function mount(markdown: string, liveCode?: LiveCodeBridge, editable = true) {
  let editor: Editor | null = null;
  const onChange = vi.fn();
  render(
    <WysiwygEditor
      value={markdown}
      onChange={onChange}
      onReady={(instance) => (editor = instance)}
      editable={editable}
      {...(liveCode ? { liveCode } : {})}
    />,
  );
  await waitFor(() => expect(editor).not.toBeNull(), { timeout: 4000 });
  return { editor: editor!, onChange };
}

const block = (body: string) => `Intro\n\n\`\`\`live-code\n${body}\n\`\`\`\n`;

describe("a live code block", () => {
  it("fetches the code the first time and keeps a copy of it in the note", async () => {
    const { editor } = await mount(
      block("path: src/auth.ts\nsymbol: login"),
      bridge({ "acme/api/src/auth.ts": FILE_V1 }),
    );
    expect((await screen.findByTestId("live-code-status")).textContent).toContain(
      "Matches the repository · lines 1–3",
    );
    await waitFor(() =>
      expect(markdownOf(editor)).toContain(
        "```live-code\npath: src/auth.ts\nsymbol: login\n---\nexport function login(user) {\n  return check(user);\n}\n```",
      ),
    );
    expect(screen.getByText("Open on GitHub").getAttribute("href")).toBe(
      "https://github.com/acme/api/blob/HEAD/src/auth.ts#L1-L3",
    );
  });

  it("says when the code has changed, shows how, and updates the note on request", async () => {
    const snapshot = "export function login(user) {\n  return check(user);\n}";
    const { editor } = await mount(
      block(`path: src/auth.ts\nsymbol: login\n---\n${snapshot}`),
      bridge({ "acme/api/src/auth.ts": FILE_V2 }),
    );
    expect((await screen.findByTestId("live-code-status")).textContent).toContain(
      "The code has changed since this note was written.",
    );
    expect(screen.getByTestId("live-code-snapshot").textContent).toBe(snapshot);

    fireEvent.click(screen.getByText("Show what changed"));
    const diff = screen.getByTestId("live-code-diff").textContent!;
    expect(diff).toContain("−export function login(user) {");
    expect(diff).toContain("+export function login(user, code) {");

    act(() => {
      fireEvent.click(screen.getByText("Update the note"));
    });
    expect(screen.getByTestId("live-code-status").textContent).toContain("Matches the repository");
    expect(markdownOf(editor)).toContain("return check(user, code);");
  });

  it("keeps the copy and says why when the function has gone", async () => {
    await mount(
      block("path: src/auth.ts\nsymbol: register\n---\nfunction register() {}"),
      bridge({ "acme/api/src/auth.ts": FILE_V1 }),
    );
    expect((await screen.findByTestId("live-code-status")).textContent).toContain(
      "“register” is not in src/auth.ts any more.",
    );
    expect(screen.getByTestId("live-code-snapshot").textContent).toBe("function register() {}");
  });

  it("says when the file has gone", async () => {
    await mount(block("path: src/old.ts\n---\nx"), bridge({ "acme/api/src/old.ts": null }));
    expect((await screen.findByTestId("live-code-status")).textContent).toContain(
      "src/old.ts is not in acme/api any more.",
    );
  });

  it("reads another repository when one is named", async () => {
    const reader = bridge({ "other/lib/a.py": "def go():\n    pass\n" });
    await mount(block("repo: other/lib\npath: a.py\nsymbol: go"), reader);
    await screen.findByText(/Matches the repository/);
    expect(reader.read).toHaveBeenCalledWith("other/lib", "a.py", null);
  });

  it("says what went wrong when the repository cannot be read, and can try again", async () => {
    const reader = bridge({});
    await mount(block("path: src/auth.ts\nsymbol: login\n---\nx"), reader);
    expect(await screen.findByText("GitHub could not be reached.")).toBeTruthy();
    fireEvent.click(screen.getByText("Try again"));
    await waitFor(() => expect(reader.read).toHaveBeenCalledTimes(2));
  });

  it("asks what to embed when it is new, and checks it once saved", async () => {
    const reader = bridge({ "acme/api/src/auth.ts": FILE_V1 });
    const { editor } = await mount("Intro", reader);
    act(() => {
      editor.commands.focus("end");
      editor.commands.insertLiveCode();
    });
    fireEvent.change(await screen.findByLabelText("File"), { target: { value: "src/auth.ts" } });
    fireEvent.change(screen.getByLabelText("Function or class name"), {
      target: { value: "login" },
    });
    fireEvent.click(screen.getByText("Embed"));
    await screen.findByText(/Matches the repository/);
    await waitFor(() =>
      expect(markdownOf(editor)).toContain("symbol: login\n---\nexport function login(user)"),
    );
  });

  it("refuses a form with no file", async () => {
    const { editor } = await mount("Intro", bridge({}));
    act(() => {
      editor.commands.focus("end");
      editor.commands.insertLiveCode();
    });
    fireEvent.click(await screen.findByText("Embed"));
    expect(screen.getByRole("alert").textContent).toBe(
      "Which file? Give its path in the repository.",
    );
  });

  it("never rewrites a locked note", async () => {
    const { onChange } = await mount(
      block("path: src/auth.ts\nsymbol: login"),
      bridge({ "acme/api/src/auth.ts": FILE_V1 }),
      false,
    );
    await screen.findByText(/Matches the repository/);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByText("Edit")).toBeNull();
  });

  it("round-trips code that contains a fence of its own", async () => {
    const markdown = "````live-code\npath: README.md\n---\n```js\nx\n```\n````\n";
    const { editor } = await mount(markdown);
    expect(markdownOf(editor).trim()).toBe(markdown.trim());
  });
});
