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
