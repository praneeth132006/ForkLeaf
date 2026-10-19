// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { WysiwygEditor, markdownOf } from "./WysiwygEditor";
import { SourceEditor } from "./SourceEditor";
import type { SpellBridge } from "./spelling";

afterEach(() => {
  cleanup();
  document.querySelectorAll(".fl-spell-bubble").forEach((element) => element.remove());
});

/** A dictionary that knows every word except the ones listed. */
function bridge(misspelt: Record<string, string[]>, enabled = true) {
  const requested: string[] = [];
  const learnt: string[] = [];
  const ignored: string[] = [];
  const value: SpellBridge = {
    enabled,
    version: 1,
    check: (word) =>
      ignored.includes(word) || learnt.includes(word) ? true : !(word.toLowerCase() in misspelt),
    request: (list) => void requested.push(...list),
    suggest: async (word) => misspelt[word.toLowerCase()] ?? [],
    learn: (word) => void learnt.push(word),
    ignore: (word) => void ignored.push(word),
  };
  return { value, requested, learnt, ignored };
}

/**
 * jsdom never reports a contenteditable as focused, and the bubble only opens
 * for an editor that has focus — so a test that types also says it is focused.
 */
function focused(editor: Editor): Editor {
  editor.view.hasFocus = () => true;
  return editor;
}

/** Types text one character at a time, the way a keyboard does. */
function type(editor: Editor, text: string): void {
  for (const character of text) {
    act(() => {
      const { state } = editor.view;
      editor.view.dispatch(state.tr.insertText(character));
    });
  }
}

async function mountRich(markdown: string, spelling?: SpellBridge): Promise<Editor> {
  let editor: Editor | null = null;
  render(
    <WysiwygEditor
      value={markdown}
      onChange={vi.fn()}
      onReady={(instance) => (editor = instance)}
      {...(spelling ? { spelling } : {})}
    />,
  );
  await waitFor(() => expect(editor).not.toBeNull(), { timeout: 4000 });
  return editor!;
}

const underlined = () =>
  Array.from(document.querySelectorAll(".fl-misspelt")).map((element) => element.textContent);

describe("spelling in rich text", () => {
  it("underlines misspelt words and nothing else", async () => {
    await mountRich("I recieve teh letter.", bridge({ recieve: ["receive"], teh: ["the"] }).value);
    expect(underlined()).toEqual(["recieve", "teh"]);
  });

  it("leaves code alone, and checks a link's words but not its address", async () => {
    await mountRich(
      "Use `recieve` and [teh](https://example.com) but recieve https://teh.example.com now.",
      bridge({ recieve: ["receive"], teh: ["the"] }).value,
    );
    expect(underlined()).toEqual(["teh", "recieve"]);
  });

  it("underlines nothing while switched off, and gives the browser its checker back", async () => {
    const editor = await mountRich("I recieve it.", bridge({ recieve: ["receive"] }, false).value);
    expect(underlined()).toEqual([]);
    expect(editor.view.dom.getAttribute("spellcheck")).toBe("true");
  });

  it("turns the browser's own checker off while it is on", async () => {
    const editor = await mountRich("Hello.", bridge({}).value);
    expect(editor.view.dom.getAttribute("spellcheck")).toBe("false");
  });

  it("asks the dictionary about words it does not know yet", async () => {
    const spelling = bridge({});
    spelling.value.check = () => undefined;
    await mountRich("Fresh words here.", spelling.value);
    expect(spelling.requested).toEqual(expect.arrayContaining(["Fresh", "words", "here"]));
  });

  it("does not underline the word being typed until it is finished", async () => {
    const spelling = bridge({ recie: ["receive"], recieve: ["receive"] });
    const editor = await mountRich("Start", spelling.value);
    act(() => {
      editor.commands.focus("end");
    });
    type(editor, " recie");
    expect(underlined()).toEqual([]);
    type(editor, "ve ");
    expect(underlined()).toEqual(["recieve"]);
  });

  it("offers corrections for a word just finished, and replaces it in the writer's case", async () => {
    const spelling = bridge({ teh: ["the", "ten"] });
    const editor = focused(await mountRich("Start", spelling.value));
    act(() => {
      editor.commands.focus("end");
    });
    type(editor, ". Teh ");

    const bubble = await waitFor(() => {
      const found = document.querySelector<HTMLElement>(".fl-spell-bubble");
      expect(found?.textContent).toContain("the");
      return found!;
    });
    const options = Array.from(bubble.querySelectorAll<HTMLButtonElement>(".fl-spell-option"));
    expect(options.map((option) => option.textContent)).toEqual(["the", "ten"]);

    act(() => options[0]!.click());
    expect(markdownOf(editor)).toContain("Start. The ");
    expect(document.querySelector(".fl-spell-bubble")).toBeNull();
  });

  it("adds a word to the dictionary from the bubble", async () => {
    const spelling = bridge({ forkleafy: [] });
    const editor = focused(await mountRich("Start", spelling.value));
    act(() => {
      editor.commands.focus("end");
    });
    type(editor, " forkleafy ");
    const bubble = await waitFor(() => {
      const found = document.querySelector<HTMLElement>(".fl-spell-bubble");
      expect(found?.textContent).toContain("No suggestions");
      return found!;
    });
    const add = Array.from(bubble.querySelectorAll("button")).find(
      (button) => button.textContent === "Add to dictionary",
    )!;
    act(() => add.click());
    expect(spelling.learnt).toEqual(["forkleafy"]);
    expect(underlined()).toEqual([]);
  });

  it("closes the bubble on Escape without changing the word", async () => {
    const spelling = bridge({ teh: ["the"] });
    const editor = focused(await mountRich("Start", spelling.value));
    act(() => {
      editor.commands.focus("end");
    });
    type(editor, " teh ");
    await waitFor(() => expect(document.querySelector(".fl-spell-bubble")).not.toBeNull());
    act(() => {
      editor.view.dom.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(document.querySelector(".fl-spell-bubble")).toBeNull();
    expect(markdownOf(editor)).toContain("teh");
  });

  it("lets the keyboard pick a correction without leaving the editor", async () => {
    const spelling = bridge({ teh: ["the", "ten"] });
    const editor = focused(await mountRich("Start", spelling.value));
    act(() => {
      editor.commands.focus("end");
    });
    type(editor, " teh ");
    await waitFor(() =>
      expect(document.querySelector(".fl-spell-bubble")?.textContent).toContain("ten"),
    );

    const press = (key: string) =>
      act(() => {
        editor.view.dom.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
      });
    press("ArrowDown");
    press("ArrowDown");
    expect(document.querySelector(".fl-spell-option.is-active")?.textContent).toBe("ten");
    press("Enter");

    expect(markdownOf(editor)).toContain("Start ten ");
    expect(document.querySelector(".fl-spell-bubble")).toBeNull();
  });

  it("leaves Enter to the editor until a correction is highlighted", async () => {
    const spelling = bridge({ teh: ["the"] });
    const editor = focused(await mountRich("Start", spelling.value));
    act(() => {
      editor.commands.focus("end");
    });
    type(editor, " teh ");
    await waitFor(() => expect(document.querySelector(".fl-spell-bubble")).not.toBeNull());
    const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    act(() => {
      editor.view.dom.dispatchEvent(event);
    });
    expect(markdownOf(editor)).toContain("teh");
    expect(markdownOf(editor)).not.toContain("the");
  });

  it("closes the bubble once the next word is begun", async () => {
    const spelling = bridge({ teh: ["the"] });
    const editor = focused(await mountRich("Start", spelling.value));
    act(() => {
      editor.commands.focus("end");
    });
    type(editor, " teh ");
    await waitFor(() => expect(document.querySelector(".fl-spell-bubble")).not.toBeNull());
    type(editor, "n");
    expect(document.querySelector(".fl-spell-bubble")).toBeNull();
    type(editor, "ext word ");
    expect(document.querySelector(".fl-spell-bubble")).toBeNull();
    // The word stays underlined, to come back to.
    expect(underlined()).toEqual(["teh"]);
  });

  it("never changes the note just by being on", async () => {
    const onChange = vi.fn();
    render(
      <WysiwygEditor
        value={"I recieve it."}
        onChange={onChange}
        spelling={bridge({ recieve: ["receive"] }).value}
      />,
    );
    await waitFor(() => expect(underlined()).toEqual(["recieve"]));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("spelling in the Markdown source", () => {
  it("underlines misspelt prose but not code, links or front matter", async () => {
    render(
      <SourceEditor
        value={
          "---\ntitel: recieve\n---\n\nI recieve `teh` [teh](http://teh.com).\n\n```\nrecieve\n```\n"
        }
        onChange={vi.fn()}
        spelling={bridge({ recieve: ["receive"], teh: ["the"], titel: ["title"] }).value}
      />,
    );
    await waitFor(() => expect(underlined()).toEqual(["recieve", "teh"]));
  });

  it("underlines nothing while switched off", async () => {
    render(
      <SourceEditor
        value={"I recieve it.\n"}
        onChange={vi.fn()}
        spelling={bridge({ recieve: ["receive"] }, false).value}
      />,
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(underlined()).toEqual([]);
  });
});
