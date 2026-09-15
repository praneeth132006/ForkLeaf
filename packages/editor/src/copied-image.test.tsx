// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { DOMParser as PMDOMParser, DOMSerializer } from "@tiptap/pm/model";
import { WysiwygEditor } from "./WysiwygEditor";
import type { ImageBridge } from "./images";

afterEach(cleanup);

/**
 * Copying a note's images into another note.
 *
 * Images are written relative to their note, so pasting one into a note in a
 * different folder kept a path that pointed at nothing, and a page of
 * screenshots arrived as broken boxes with their file names. The clipboard's
 * HTML is exactly what these build and read, through the editor's own schema.
 */

/** A stand-in for the app: folders as a plain string, one notebook. */
function bridge(note: { path: string }): ImageBridge {
  const folder = () => note.path.split("/").slice(0, -1);
  return {
    resolve: (src) => `/proxy?path=${encodeURIComponent(src)}`,
    portable: (src) =>
      /^[a-z]+:/i.test(src) ? null : `nb#${[...folder(), src.replace(/^\.\//, "")].join("/")}`,
    localize: (portable) => {
      if (!portable.startsWith("nb#")) return null;
      const target = portable.slice(3).split("/");
      const from = folder();
      let shared = 0;
      while (shared < from.length && from[shared] === target[shared]) shared += 1;
      return [...from.slice(shared).map(() => ".."), ...target.slice(shared)].join("/");
    },
  };
}

async function mount(value: string, images: ImageBridge): Promise<Editor> {
  let editor: Editor | null = null;
  render(
    <WysiwygEditor
      value={value}
      onChange={vi.fn()}
      images={images}
      onReady={(instance) => {
        editor = instance;
      }}
    />,
  );
  await waitFor(() => expect(editor).not.toBeNull(), { timeout: 4000 });
  return editor!;
}

function copyHtml(editor: Editor): string {
  const box = document.createElement("div");
  box.appendChild(
    DOMSerializer.fromSchema(editor.schema).serializeFragment(editor.state.doc.content),
  );
  return box.innerHTML;
}

function pastedSrcs(editor: Editor, html: string): string[] {
  const box = document.createElement("div");
  box.innerHTML = html;
  const doc = PMDOMParser.fromSchema(editor.schema).parse(box);
  const srcs: string[] = [];
  doc.descendants((node) => {
    if (node.type.name === "image") srcs.push(node.attrs.src as string);
  });
  return srcs;
}

describe("an image copied into a note in another folder", () => {
  it("is rewritten to point at the same file from where it lands", async () => {
    const note = { path: "course/6. Basics/6.1 brute force.md" };
    const editor = await mount("Look:\n\n![image.png](./assets/shot.png)", bridge(note));

    const html = copyHtml(editor);
    expect(html).toContain('data-fl-asset="nb#course/6. Basics/assets/shot.png"');

    note.path = "course/18. Web/18.6 Auth/18.6.1-brute-force.md";
    expect(pastedSrcs(editor, html)).toEqual(["../../6. Basics/assets/shot.png"]);
  });

  it("keeps what the markdown said when the image is from somewhere else", async () => {
    const editor = await mount("", bridge({ path: "a/b.md" }));
    const html =
      '<img src="/proxy?x" data-src="./assets/shot.png" data-fl-asset="elsewhere#x.png">';

    expect(pastedSrcs(editor, html)).toEqual(["./assets/shot.png"]);
  });

  it("leaves images from the web exactly as they were", async () => {
    const editor = await mount("", bridge({ path: "a/b.md" }));

    expect(pastedSrcs(editor, '<img src="https://example.com/a.png">')).toEqual([
      "https://example.com/a.png",
    ]);
  });
});
