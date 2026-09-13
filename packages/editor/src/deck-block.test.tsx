// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { WysiwygEditor, markdownOf } from "./WysiwygEditor";
import type { DeckBridge } from "./extensions/DeckBlock";

afterEach(cleanup);

async function mount(markdown: string, deck?: DeckBridge): Promise<Editor> {
  let editor: Editor | null = null;
  render(
    <WysiwygEditor
      value={markdown}
      onChange={vi.fn()}
      onReady={(instance) => (editor = instance)}
      {...(deck ? { deck } : {})}
    />,
  );
  await waitFor(() => expect(editor).not.toBeNull(), { timeout: 4000 });
  return editor!;
}

const V1 = "# Bio\n\n## Cards\n\nCell :: unit of life\nDNA :: genes\n";
const V2 = "# Bio\n\n## Cards\n\nCell :: the unit of life\nRNA :: messenger\n";

function bridge(over: Partial<DeckBridge> = {}): DeckBridge & {
  share: ReturnType<typeof vi.fn>;
  read: ReturnType<typeof vi.fn>;
} {
  return {
    signedIn: () => true,
    noteTitle: () => "Bio",
    share: vi.fn(async () => ({ repo: "me/bio-deck", sha: "fff0000" })),
    read: vi.fn(async (_repo: string, ref?: string) =>
      ref === "aaa1111" ? { sha: "aaa1111", content: V1 } : { sha: "bbb2222", content: V2 },
    ),
    ...over,
  } as never;
}

describe("a shared deck in the note", () => {
  it("copies a shared deck in as cards, and remembers where from", async () => {
    const deck = bridge({
      read: vi.fn(async () => ({ sha: "aaa1111", content: V1 })) as never,
    });
    const editor = await mount("Studying\n\n```deck\n```", deck);
    fireEvent.change(await screen.findByLabelText("Shared deck address"), {
      target: { value: "https://github.com/friend/bio-deck" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Copy the cards here" }));

    expect(await screen.findByText(/Copied 2 cards from friend\/bio-deck/)).toBeTruthy();
    expect(deck.read).toHaveBeenCalledWith("friend/bio-deck");
    expect(markdownOf(editor).trim()).toBe(
      "Studying\n\n```deck\nsource: friend/bio-deck\nversion: aaa1111\n```\n\nCell :: unit of life\nDNA :: genes",
    );
  });

  it("pulls in a newer version, keeping the reader's own cards", async () => {
    const deck = bridge();
    const editor = await mount(
      "```deck\nsource: friend/bio-deck\nversion: aaa1111\n```\n\nCell :: unit of life\nDNA :: genes\n\nMine :: my own card",
      deck,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Check for updates" }));
    const update = await screen.findByTestId("deck-update");
    expect(update.textContent).toContain("1 new card, 1 changed, 1 removed");

    fireEvent.click(screen.getByRole("button", { name: "Pull them in" }));
    await screen.findByText(/Brought in 1 new card/);
    const markdown = markdownOf(editor);
    expect(markdown).toContain("version: bbb2222");
    expect(markdown).toContain("Cell :: the unit of life\nRNA :: messenger");
    expect(markdown).not.toContain("DNA :: genes");
    expect(markdown).toContain("Mine :: my own card");
  });

  it("leaves a card the reader rewrote", async () => {
    const editor = await mount(
      "```deck\nsource: friend/bio-deck\nversion: aaa1111\n```\n\nCell :: in my own words\nDNA :: genes",
      bridge(),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Check for updates" }));
    expect((await screen.findByTestId("deck-update")).textContent).toContain(
      "1 card you rewrote will be left as you wrote it",
    );
    fireEvent.click(screen.getByRole("button", { name: "Pull them in" }));
    await screen.findByText(/Brought in/);
    expect(markdownOf(editor)).toContain("Cell :: in my own words");
  });

  it("says when a copy is up to date", async () => {
    await mount(
      "```deck\nsource: friend/bio-deck\nversion: bbb2222\n```\n\nCell :: the unit of life",
      bridge(),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Check for updates" }));
    expect(await screen.findByText("Up to date.")).toBeTruthy();
  });

  it("asks before sharing publicly, then shares only the cards", async () => {
    const deck = bridge();
    const editor = await mount("Intro paragraph\n\nQ1 :: A1\nQ2 :: A2\n\n```deck\n```", deck);
    fireEvent.click(await screen.findByRole("button", { name: "Share as a public repository" }));
    expect(screen.getByRole("alertdialog").textContent).toContain("public");
    expect(deck.share).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Share publicly" }));
    expect(await screen.findByText(/Shared 2 cards at github.com\/me\/bio-deck/)).toBeTruthy();
    expect(deck.share).toHaveBeenCalledWith({ title: "Bio", cards: "Q1 :: A1\nQ2 :: A2" });
    expect(markdownOf(editor)).toContain("```deck\nshared: me/bio-deck\nversion: fff0000\n```");
  });

  it("publishes changes to a deck already shared", async () => {
    const deck = bridge({
      share: vi.fn(async () => ({ repo: "me/bio-deck", sha: "fff0001" })) as never,
    });
    const editor = await mount(
      "```deck\nshared: me/bio-deck\nversion: fff0000\n```\n\nQ1 :: A1",
      deck,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Publish changes" }));
    await screen.findByText("Published 1 card.");
    expect(deck.share).toHaveBeenCalledWith({ title: "Bio", cards: "Q1 :: A1", repo: "bio-deck" });
    expect(markdownOf(editor)).toContain("version: fff0001");
  });

  it("explains that sharing needs a GitHub sign-in", async () => {
    await mount("Q1 :: A1\n\n```deck\n```", bridge({ signedIn: () => false }));
    expect(await screen.findByText(/Sign in with GitHub to share/)).toBeTruthy();
  });

  it("shows what went wrong", async () => {
    const deck = bridge({
      read: vi.fn(async () => Promise.reject(new Error("There is no deck at x/y."))) as never,
    });
    await mount("```deck\n```", deck);
    fireEvent.change(await screen.findByLabelText("Shared deck address"), {
      target: { value: "x/y" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Copy the cards here" }));
    expect((await screen.findByRole("alert")).textContent).toBe("There is no deck at x/y.");
  });
});
