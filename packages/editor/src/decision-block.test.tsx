// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { WysiwygEditor, markdownOf } from "./WysiwygEditor";

afterEach(cleanup);

async function mount(markdown: string, editable = true): Promise<Editor> {
  let editor: Editor | null = null;
  render(
    <WysiwygEditor
      value={markdown}
      onChange={vi.fn()}
      editable={editable}
      today={() => "2026-09-13"}
      onReady={(instance) => (editor = instance)}
    />,
  );
  await waitFor(() => expect(editor).not.toBeNull(), { timeout: 4000 });
  return editor!;
}

const BLOCK = [
  "```decision",
  "question: Which database?",
  "option: Postgres",
  "+ mature (3)",
  "- more to run (2)",
  "option: SQLite",
  "+ simple (2)",
  "```",
].join("\n");

const body = (editor: Editor) => /```decision\n([\s\S]*?)\n```/.exec(markdownOf(editor))![1]!;

describe("a decision in the note", () => {
  it("shows the options with their pros, cons and scores", async () => {
    await mount(BLOCK);
    expect(((await screen.findByLabelText("Decision question")) as HTMLInputElement).value).toBe(
      "Which database?",
    );
    expect(screen.getAllByTestId("decision-score").map((element) => element.textContent)).toEqual([
      "+1",
      "+2",
    ]);
    expect(
      within(screen.getByRole("region", { name: "Option: SQLite" })).getByText("Highest score"),
    ).toBeTruthy();
  });

  it("writes the block back exactly as it was", async () => {
    const editor = await mount(`# Stack\n\n${BLOCK}\n\nAfter.`);
    expect(markdownOf(editor).trim()).toBe(`# Stack\n\n${BLOCK}\n\nAfter.`);
  });

  it("adds a weighed con, and the score follows", async () => {
    const editor = await mount(BLOCK);
    fireEvent.click(await screen.findByRole("button", { name: "+ Con for SQLite" }));
    fireEvent.change(await screen.findByLabelText("Con 1 of SQLite"), {
      target: { value: "one writer" },
    });
    fireEvent.change(await screen.findByLabelText("Weight of con 1 of SQLite"), {
      target: { value: "3" },
    });
    await waitFor(() =>
      expect(body(editor)).toContain("option: SQLite\n+ simple (2)\n- one writer (3)"),
    );
    await waitFor(() => expect(screen.getAllByTestId("decision-score")[1]!.textContent).toBe("-1"));
  });

  it("records a choice with the date, and a change of mind", async () => {
    const editor = await mount(BLOCK);
    fireEvent.click(await screen.findByRole("button", { name: "Choose Postgres" }));
    expect((await screen.findByTestId("decision-chosen")).textContent).toContain("Postgres");
    fireEvent.click(await screen.findByRole("button", { name: "Choose SQLite" }));
    await waitFor(() =>
      expect(screen.getByTestId("decision-history").textContent).toContain(
        "2026-09-13: changed to SQLite (2), over Postgres (1)",
      ),
    );
    expect(body(editor)).toContain(
      "chosen: SQLite\nhistory:\n- 2026-09-13: chose Postgres (1), over SQLite (2)\n- 2026-09-13: changed to SQLite (2), over Postgres (1)",
    );
  });

  it("renames an option without losing the choice, and adds and removes options", async () => {
    const editor = await mount(BLOCK.replace(/```$/, "chosen: SQLite\n```"));
    fireEvent.change(await screen.findByLabelText("Option 2 name"), {
      target: { value: "SQLite 3" },
    });
    expect(body(editor)).toContain("chosen: SQLite 3");
    fireEvent.click(await screen.findByRole("button", { name: "+ Add an option" }));
    expect(body(editor)).toContain("option: Option C");
    fireEvent.click(await screen.findByRole("button", { name: "Remove option Postgres" }));
    expect(body(editor)).not.toContain("Postgres");
  });

  it("starts a new decision with two options", async () => {
    const editor = await mount("Plans");
    act(() => {
      editor.chain().focus("end").insertDecision().run();
    });
    expect(await screen.findByPlaceholderText("What are you deciding?")).toBeTruthy();
    expect(markdownOf(editor)).toContain(
      "```decision\nquestion: \noption: Option A\noption: Option B\n```",
    );
  });

  it("can be read but not changed on a locked note", async () => {
    await mount(BLOCK, false);
    expect(((await screen.findByLabelText("Decision question")) as HTMLInputElement).disabled).toBe(
      true,
    );
    expect(screen.queryByRole("button", { name: "+ Add an option" })).toBeNull();
  });
});
