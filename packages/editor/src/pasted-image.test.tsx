// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { WysiwygEditor } from "./WysiwygEditor";
import type { ImageBridge } from "./images";

afterEach(cleanup);

/**
 * A pasted screenshot showing up.
 *
 * Resolving an image is a lookup in a store that is still being written to
 * when the image is inserted: the bytes are put away and the node goes in, and
 * only afterwards does the app publish the entry the resolver reads. So the
 * first answer for a freshly pasted image is "not on this device" — and since
 * ProseMirror renders a node's DOM once, that first answer used to be the last
 * one, leaving a placeholder where the screenshot was until the note was
 * closed and opened again.
 */
describe("a pasted image", () => {
  it("appears as soon as its bytes can be resolved", async () => {
    // Empty when the paste lands, filled a moment later — the local asset
    // store, in miniature.
    const store = new Map<string, string>();

    const bridge: ImageBridge = {
      canUpload: true,
      resolve: (src) => store.get(src) ?? "MISSING",
      upload: async (file) => `assets/${file.name}`,
    };

    let editor: Editor | null = null;
    const note = () => (
      <WysiwygEditor
        value="hello"
        onChange={vi.fn()}
        images={bridge}
        onReady={(instance) => {
          editor = instance;
        }}
      />
    );
    const { rerender } = render(note());
    await waitFor(() => expect(editor).not.toBeNull(), { timeout: 4000 });

    const view = editor!.view;
    const file = new File([new Uint8Array([1, 2, 3])], "shot.png", { type: "image/png" });
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: { files: [file], items: [], types: ["Files"], getData: () => "" },
    });
    view.dom.dispatchEvent(event);

    await waitFor(() => expect(view.dom.querySelector("img")).not.toBeNull(), { timeout: 4000 });

    // The bytes land, and the app re-renders — which is what storing an asset
    // does.
    store.set("assets/shot.png", "blob:the-image");
    rerender(note());

    await waitFor(
      () => expect(view.dom.querySelector("img")?.getAttribute("src")).toBe("blob:the-image"),
      { timeout: 2000 },
    );
  });

  /**
   * Where the caret ends up afterwards.
   *
   * An image is a block, so inserting one left the selection on the node
   * itself: the next keystroke replaced the screenshot that had just been
   * uploaded. Pasting a picture into a note is almost always followed by
   * writing about the picture.
   */
  it("leaves the caret on an empty line below the picture", async () => {
    const bridge: ImageBridge = {
      canUpload: true,
      resolve: () => "blob:the-image",
      upload: async (file) => `assets/${file.name}`,
    };

    let editor: Editor | null = null;
    render(
      <WysiwygEditor
        value="hello"
        onChange={vi.fn()}
        images={bridge}
        onReady={(instance) => {
          editor = instance;
        }}
      />,
    );
    await waitFor(() => expect(editor).not.toBeNull(), { timeout: 4000 });

    const view = editor!.view;
    const file = new File([new Uint8Array([1])], "shot.png", { type: "image/png" });
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: { files: [file], items: [], types: ["Files"], getData: () => "" },
    });
    view.dom.dispatchEvent(event);

    await waitFor(() => expect(view.dom.querySelector("img")).not.toBeNull(), { timeout: 4000 });

    // In a paragraph, and below the picture rather than above it — which is
    // where node-size arithmetic used to leave it when the insertion split the
    // paragraph the caret was in.
    let imageEnd = -1;
    editor!.state.doc.descendants((node, pos) => {
      if (node.type.name === "image") imageEnd = pos + node.nodeSize;
    });

    const { $from, empty } = editor!.state.selection;
    expect(empty).toBe(true);
    expect($from.parent.type.name).toBe("paragraph");
    expect($from.pos).toBeGreaterThanOrEqual(imageEnd);

    // And typing goes into that paragraph rather than over the image.
    editor!.commands.insertContent("about the shot");
    let images = 0;
    editor!.state.doc.descendants((node) => {
      if (node.type.name === "image") images += 1;
    });
    expect(images).toBe(1);
  });

  /**
   * The case the first attempt at this got wrong.
   *
   * With the caret at the *end* of a line the picture goes in after that whole
   * block, so anything derived from the caret's own position — including
   * mapping it through the transaction, which correctly reports it unmoved —
   * leaves the caret above the picture. Which is where people found it, and
   * typing then continued the sentence they had just illustrated.
   */
  it("goes below the picture even when the caret was at the end of a line", async () => {
    const bridge: ImageBridge = {
      canUpload: true,
      resolve: () => "blob:the-image",
      upload: async (file) => `assets/${file.name}`,
    };

    let editor: Editor | null = null;
    render(
      <WysiwygEditor
        value="Here is the screenshot:"
        onChange={vi.fn()}
        images={bridge}
        onReady={(instance) => {
          editor = instance;
        }}
      />,
    );
    await waitFor(() => expect(editor).not.toBeNull(), { timeout: 4000 });

    // The end of the only line, which is where somebody writing is.
    editor!.commands.setTextSelection(editor!.state.doc.content.size - 1);

    const view = editor!.view;
    const file = new File([new Uint8Array([1])], "shot.png", { type: "image/png" });
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: { files: [file], items: [], types: ["Files"], getData: () => "" },
    });
    view.dom.dispatchEvent(event);

    await waitFor(() => expect(view.dom.querySelector("img")).not.toBeNull(), { timeout: 4000 });

    editor!.commands.insertContent("and this is what it shows");

    // The picture between the two lines, rather than the second sentence
    // running on from the first above it.
    const blocks = editor!.state.doc.content.content.map((node) =>
      node.type.name === "image" ? "[image]" : node.textContent,
    );
    expect(blocks).toEqual(["Here is the screenshot:", "[image]", "and this is what it shows"]);
  });

  it("keeps the markdown pointing at the path, not the resolved URL", async () => {
    const bridge: ImageBridge = {
      canUpload: true,
      resolve: () => "blob:the-image",
      upload: async (file) => `assets/${file.name}`,
    };

    let editor: Editor | null = null;
    render(
      <WysiwygEditor
        value="hello"
        onChange={vi.fn()}
        images={bridge}
        onReady={(instance) => {
          editor = instance;
        }}
      />,
    );
    await waitFor(() => expect(editor).not.toBeNull(), { timeout: 4000 });

    const view = editor!.view;
    const file = new File([new Uint8Array([1])], "shot.png", { type: "image/png" });
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: { files: [file], items: [], types: ["Files"], getData: () => "" },
    });
    view.dom.dispatchEvent(event);

    await waitFor(() => expect(view.dom.querySelector("img")).not.toBeNull(), { timeout: 4000 });

    let src = "";
    editor!.state.doc.descendants((node) => {
      if (node.type.name === "image") src = node.attrs.src as string;
    });
    expect(src).toBe("assets/shot.png");
  });
});
