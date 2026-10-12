// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { WysiwygEditor } from "./WysiwygEditor";
import type { GlossaryBridge } from "./extensions/Glossary";

afterEach(() => {
  cleanup();
  document.querySelectorAll(".fl-glossary-card").forEach((element) => element.remove());
});

function bridge(enabled = true) {
  const open = vi.fn();
  const value: GlossaryBridge = {
    enabled,
    version: 1,
    match: (text) =>
      [...text.matchAll(/\bidempotent\b/gi)].map((match) => ({
        from: match.index!,
        to: match.index! + match[0].length,
        key: "idempotent",
      })),
    lookup: (key) =>
      key === "idempotent"
        ? {
            term: "Idempotent",
            definition: "Idempotent means running it twice changes nothing.",
            source: "Computing words",
            path: "cs.md",
            line: 4,
            others: 1,
          }
        : undefined,
    open,
  };
  return { value, open };
}

async function mount(markdown: string, glossary?: GlossaryBridge) {
  let editor: Editor | null = null;
  const onChange = vi.fn();
  render(
    <WysiwygEditor
      value={markdown}
      onChange={onChange}
      onReady={(instance) => (editor = instance)}
      {...(glossary ? { glossary } : {})}
    />,
  );
  await waitFor(() => expect(editor).not.toBeNull(), { timeout: 4000 });
  return { editor: editor!, onChange };
}

const terms = () =>
  Array.from(document.querySelectorAll(".fl-glossary-term")).map((element) => element.textContent);

describe("glossary terms in rich text", () => {
  it("underlines a defined term wherever it appears, but not in code, bold or headings", async () => {
    await mount(
      "# Idempotent heading\n\nMake it idempotent. **Idempotent** in bold, `idempotent` in code, Idempotent again.",
      bridge().value,
    );
    expect(terms()).toEqual(["idempotent", "Idempotent"]);
  });

  it("underlines nothing while switched off", async () => {
    await mount("Make it idempotent.", bridge(false).value);
    expect(terms()).toEqual([]);
  });

  it("shows the definition and where it comes from on hover, and opens that note", async () => {
    const glossary = bridge();
    await mount("Make it idempotent.", glossary.value);
    const term = document.querySelector<HTMLElement>(".fl-glossary-term")!;
    fireEvent.mouseOver(term);

    const card = document.querySelector<HTMLElement>(".fl-glossary-card")!;
    expect(card.textContent).toContain("Idempotent means running it twice changes nothing.");
    expect(card.textContent).toContain("Computing words · and 1 other note");

    fireEvent.click(card.querySelector("button")!);
    expect(glossary.open).toHaveBeenCalledWith("cs.md", 4);
    expect(document.querySelector(".fl-glossary-card")).toBeNull();
  });

  it("shows the card on a tap too, and hides it on Escape", async () => {
    await mount("Make it idempotent.", bridge().value);
    fireEvent.click(document.querySelector(".fl-glossary-term")!);
    expect(document.querySelector(".fl-glossary-card")).not.toBeNull();
    fireEvent.keyDown(document.querySelector(".ProseMirror")!, { key: "Escape" });
    expect(document.querySelector(".fl-glossary-card")).toBeNull();
  });

  it("never changes the note", async () => {
    const { onChange } = await mount("Make it idempotent.", bridge().value);
    fireEvent.mouseOver(document.querySelector(".fl-glossary-term")!);
    expect(onChange).not.toHaveBeenCalled();
  });
});
