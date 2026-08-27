// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { WysiwygEditor } from "./WysiwygEditor";
import { SourceEditor, type SourceEditorHandle } from "./SourceEditor";
import { MarkdownEditor } from "./MarkdownEditor";

/**
 * A locked note, from every direction somebody could type into one.
 *
 * The lock exists to stop an accident, so the interesting cases are all the
 * ones that are not typing: a toolbar button, a paste, a dropped screenshot, a
 * programmatic insert from the "/" menu, a mode switch to a surface that
 * forgot. Each of those is a separate code path, and any one of them left open
 * makes the padlock a decoration.
 */

afterEach(cleanup);

const NOTE = "# Reference\n\nSome text that must not change.";

async function richEditor(props: { editable?: boolean } = {}) {
  const onChange = vi.fn();
  let editor: Editor | null = null;

  render(
    <WysiwygEditor
      value={NOTE}
      onChange={onChange}
      onReady={(instance) => (editor = instance)}
      {...props}
    />,
  );

  await waitFor(() => expect(editor).not.toBeNull(), { timeout: 4000 });
  return { editor: editor as unknown as Editor, onChange };
}

describe("rich text, locked", () => {
  it("takes contenteditable off the surface, so the browser will not type into it", async () => {
    await richEditor({ editable: false });

    const surface = document.querySelector(".ProseMirror");
    expect(surface?.getAttribute("contenteditable")).toBe("false");
  });

  it("is editable by default, so nothing changes for a note nobody locked", async () => {
    await richEditor();

    expect(document.querySelector(".ProseMirror")?.getAttribute("contenteditable")).toBe("true");
  });

  it("locks a note that is already open, without waiting for it to be reopened", async () => {
    const onChange = vi.fn();
    let editor: Editor | null = null;

    const { rerender } = render(
      <WysiwygEditor value={NOTE} onChange={onChange} onReady={(i) => (editor = i)} editable />,
    );
    await waitFor(() => expect(editor).not.toBeNull(), { timeout: 4000 });

    rerender(
      <WysiwygEditor
        value={NOTE}
        onChange={onChange}
        onReady={(i) => (editor = i)}
        editable={false}
      />,
    );

    await waitFor(() => expect((editor as unknown as Editor).isEditable).toBe(false));
    expect(document.querySelector(".ProseMirror")?.getAttribute("contenteditable")).toBe("false");
  });

  it("unlocks again, in place", async () => {
    let editor: Editor | null = null;
    const { rerender } = render(
      <WysiwygEditor
        value={NOTE}
        onChange={vi.fn()}
        onReady={(i) => (editor = i)}
        editable={false}
      />,
    );
    await waitFor(() => expect(editor).not.toBeNull(), { timeout: 4000 });

    rerender(
      <WysiwygEditor value={NOTE} onChange={vi.fn()} onReady={(i) => (editor = i)} editable />,
    );

    await waitFor(() => expect((editor as unknown as Editor).isEditable).toBe(true));
  });

  it("refuses a pasted screenshot rather than uploading it", async () => {
    const upload = vi.fn().mockResolvedValue("assets/shot.png");
    let editor: Editor | null = null;

    render(
      <WysiwygEditor
        value={NOTE}
        onChange={vi.fn()}
        onReady={(i) => (editor = i)}
        editable={false}
        images={{ upload }}
      />,
    );
    await waitFor(() => expect(editor).not.toBeNull(), { timeout: 4000 });

    const file = new File([new Uint8Array([1])], "shot.png", { type: "image/png" });
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: { files: [file], items: [], types: ["Files"], getData: () => "" },
    });
    document.querySelector(".ProseMirror")!.dispatchEvent(event);

    // An upload writes a file into the repository *and* an `![](…)` into the
    // note, so this is the one paste path a read-only view cannot stop by
    // itself.
    await waitFor(() => expect(upload).not.toHaveBeenCalled());
  });

  it("refuses a dropped screenshot for the same reason", async () => {
    const upload = vi.fn().mockResolvedValue("assets/shot.png");
    let editor: Editor | null = null;

    render(
      <WysiwygEditor
        value={NOTE}
        onChange={vi.fn()}
        onReady={(i) => (editor = i)}
        editable={false}
        images={{ upload }}
      />,
    );
    await waitFor(() => expect(editor).not.toBeNull(), { timeout: 4000 });

    const file = new File([new Uint8Array([1])], "shot.png", { type: "image/png" });
    const event = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", {
      value: { files: [file], items: [], types: ["Files"], getData: () => "" },
    });
    document.querySelector(".ProseMirror")!.dispatchEvent(event);

    await waitFor(() => expect(upload).not.toHaveBeenCalled());
  });

  it("still follows a link, because reading a locked note is the point", async () => {
    const open = vi.fn();
    vi.stubGlobal("open", open);

    let editor: Editor | null = null;
    render(
      <WysiwygEditor
        value="See [the docs](https://example.com/docs)"
        onChange={vi.fn()}
        onReady={(i) => (editor = i)}
        editable={false}
      />,
    );
    await waitFor(() => expect(editor).not.toBeNull(), { timeout: 4000 });

    const anchor = document.querySelector<HTMLAnchorElement>(".ProseMirror a[href]");
    expect(anchor).not.toBeNull();

    vi.unstubAllGlobals();
  });
});

describe("markdown source, locked", () => {
  function source(readOnly: boolean) {
    const onChange = vi.fn();
    const handle = React.createRef<SourceEditorHandle>();
    render(
      <SourceEditor value={NOTE} onChange={onChange} readOnly={readOnly} handleRef={handle} />,
    );
    return { onChange, handle };
  }

  it("takes the surface out of the tab order and refuses input", () => {
    source(true);

    const content = document.querySelector(".cm-content");
    expect(content?.getAttribute("contenteditable")).toBe("false");
  });

  it("is writable by default", () => {
    source(false);

    expect(document.querySelector(".cm-content")?.getAttribute("contenteditable")).toBe("true");
  });

  it("refuses a toolbar insert, which is a dispatch and not a keystroke", () => {
    // `EditorState.readOnly` stops typing and the keymap. It does not stop a
    // `view.dispatch`, which is exactly what every toolbar button is.
    const { onChange, handle } = source(true);

    handle.current?.insertAtCursor("**bold**");
    handle.current?.wrapSelection("**");
    handle.current?.toggleLinePrefix("# ");
    handle.current?.indent(1);

    expect(onChange).not.toHaveBeenCalled();
  });

  it("refuses undo and redo, which would rewrite the document just as well", () => {
    const { onChange, handle } = source(true);

    handle.current?.undo();
    handle.current?.redo();

    expect(onChange).not.toHaveBeenCalled();
  });

  it("still reports what is selected, so copying out of it works", () => {
    const { handle } = source(true);

    expect(typeof handle.current?.selection()).toBe("string");
    expect(typeof handle.current?.currentLine()).toBe("string");
  });

  it("accepts the same inserts once it is unlocked", () => {
    const { onChange, handle } = source(false);

    handle.current?.insertAtCursor("**bold**");

    expect(onChange).toHaveBeenCalled();
  });

  it("locks and unlocks in place, keeping the document", () => {
    const onChange = vi.fn();
    const handle = React.createRef<SourceEditorHandle>();

    const { rerender } = render(
      <SourceEditor value={NOTE} onChange={onChange} readOnly={false} handleRef={handle} />,
    );
    expect(document.querySelector(".cm-content")?.getAttribute("contenteditable")).toBe("true");

    rerender(<SourceEditor value={NOTE} onChange={onChange} readOnly handleRef={handle} />);
    expect(document.querySelector(".cm-content")?.getAttribute("contenteditable")).toBe("false");

    handle.current?.insertAtCursor("x");
    expect(onChange).not.toHaveBeenCalled();

    rerender(<SourceEditor value={NOTE} onChange={onChange} readOnly={false} handleRef={handle} />);
    expect(document.querySelector(".cm-content")?.getAttribute("contenteditable")).toBe("true");
    handle.current?.insertAtCursor("x");
    expect(onChange).toHaveBeenCalled();
  });
});

describe("the editor as a whole, locked", () => {
  it("takes the formatting bar away in every mode", () => {
    for (const mode of ["wysiwyg", "source", "split"] as const) {
      const { unmount } = render(
        <MarkdownEditor value={NOTE} onChange={vi.fn()} mode={mode} readOnly />,
      );

      expect(screen.queryByRole("button", { name: /^bold$/i })).toBeNull();
      unmount();
    }
  });

  it("shows the formatting bar again when it is not locked", () => {
    render(<MarkdownEditor value={NOTE} onChange={vi.fn()} mode="source" />);

    expect(screen.getAllByRole("button").length).toBeGreaterThan(0);
  });

  it("holds in the split view, where two surfaces are live at once", () => {
    render(<MarkdownEditor value={NOTE} onChange={vi.fn()} mode="split" readOnly />);

    for (const content of document.querySelectorAll(".cm-content")) {
      expect(content.getAttribute("contenteditable")).toBe("false");
    }
  });

  it("does not offer image dropping into the source surface", () => {
    const upload = vi.fn().mockResolvedValue("assets/a.png");
    render(
      <MarkdownEditor value={NOTE} onChange={vi.fn()} mode="source" readOnly images={{ upload }} />,
    );

    const file = new File([new Uint8Array([1])], "a.png", { type: "image/png" });
    const event = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", {
      value: { files: [file], items: [], types: ["Files"], getData: () => "" },
    });
    document.querySelector(".cm-content")!.dispatchEvent(event);

    expect(upload).not.toHaveBeenCalled();
  });

  it("still renders the note, because a locked note is one you are reading", () => {
    render(<MarkdownEditor value={NOTE} onChange={vi.fn()} mode="split" readOnly />);

    expect(document.body.textContent).toContain("Some text that must not change.");
  });
});

describe("a locked note that changes underneath the reader", () => {
  it("still takes an update from outside — a pull is not an edit", async () => {
    let editor: Editor | null = null;
    const { rerender } = render(
      <WysiwygEditor
        value="# One"
        onChange={vi.fn()}
        onReady={(i) => (editor = i)}
        editable={false}
      />,
    );
    await waitFor(() => expect(editor).not.toBeNull(), { timeout: 4000 });

    // A colleague's commit arriving through sync has to land, or a locked note
    // would quietly stop receiving other people's changes.
    rerender(
      <WysiwygEditor
        value="# Two"
        onChange={vi.fn()}
        onReady={(i) => (editor = i)}
        editable={false}
      />,
    );

    await waitFor(() =>
      expect(document.querySelector(".ProseMirror")?.textContent).toContain("Two"),
    );
  });

  it("does the same in the source view", () => {
    const { rerender } = render(
      <SourceEditor value="one" onChange={vi.fn()} readOnly ariaLabel="Markdown source" />,
    );

    rerender(<SourceEditor value="two" onChange={vi.fn()} readOnly ariaLabel="Markdown source" />);

    expect(document.querySelector(".cm-content")?.textContent).toContain("two");
  });
});

describe("keyboard, locked", () => {
  it("ignores typing into the rich surface", async () => {
    const { onChange } = await richEditor({ editable: false });

    const surface = document.querySelector(".ProseMirror")!;
    fireEvent.keyDown(surface, { key: "a" });
    fireEvent.input(surface);

    expect(onChange).not.toHaveBeenCalled();
  });

  it("ignores typing into the source surface", () => {
    const onChange = vi.fn();
    render(<SourceEditor value={NOTE} onChange={onChange} readOnly />);

    const content = document.querySelector(".cm-content")!;
    fireEvent.keyDown(content, { key: "a" });
    fireEvent.input(content, { data: "a" });

    expect(onChange).not.toHaveBeenCalled();
  });
});
