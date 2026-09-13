// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FlashcardsDialog } from "./FlashcardsDialog";
import { findCards, formatSchedule, parseSchedule } from "@/lib/flashcards";

afterEach(cleanup);

const NOW = new Date(2026, 8, 13, 9);
const CARDS = findCards(
  "geo.md",
  "Geography",
  "Capital of France :: Paris\nCapital of Peru :: Lima",
);
const MORE = findCards("bio.md", "Biology", "Mitochondria :: the powerhouse of the cell");

function open(over: Partial<React.ComponentProps<typeof FlashcardsDialog>> = {}) {
  const props = {
    onClose: vi.fn(),
    loadCards: vi.fn(async () => CARDS),
    readSchedule: vi.fn(async () => null as string | null),
    writeSchedule: vi.fn(async (content: string) => void content),
    onOpenNote: vi.fn(),
    onAddCards: vi.fn(
      async (path: string, cards: { question: string; answer: string }[]) => void [path, cards],
    ),
    now: NOW,
    ...over,
  };
  render(<FlashcardsDialog {...props} />);
  return props;
}

async function study(name: RegExp | string = /^Study \d+ cards?$/) {
  fireEvent.click(await screen.findByRole("button", { name }));
}

describe("FlashcardsDialog — home", () => {
  it("says how many cards are waiting, and explains flashcards", async () => {
    open();
    expect(await screen.findByText("2 cards to study today")).toBeTruthy();
    expect(screen.getByText("0 reviews due · 2 new · 2 in total")).toBeTruthy();
    expect(screen.getByText("How flashcards work")).toBeTruthy();
    expect(screen.queryByText("Capital of France")).toBeNull();
  });

  it("opens the explanation, and offers to add a card, when there are none yet", async () => {
    open({ loadCards: vi.fn(async () => []) });
    expect(await screen.findByText("No flashcards yet")).toBeTruthy();
    expect(screen.getByText("How flashcards work").closest("details")!.open).toBe(true);
    expect(
      (screen.getByRole("button", { name: "All caught up" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getByLabelText("Question")).toBeTruthy();
  });

  it("adds a card without any syntax, to the chosen deck, and reads the cards again", async () => {
    const props = open({ loadCards: vi.fn(async () => [...CARDS, ...MORE]) });
    await screen.findByText("3 cards to study today");
    fireEvent.change(screen.getByLabelText("Question"), { target: { value: "Capital of Chile" } });
    fireEvent.change(screen.getByLabelText("Answer"), { target: { value: "Santiago" } });
    fireEvent.change(screen.getByLabelText("Save to"), { target: { value: "geo.md" } });
    fireEvent.click(screen.getByRole("button", { name: "Add card" }));

    await waitFor(() =>
      expect(props.onAddCards).toHaveBeenCalledWith("geo.md", [
        { question: "Capital of Chile", answer: "Santiago" },
      ]),
    );
    expect(await screen.findByText("Added a card to Geography.")).toBeTruthy();
    expect(props.loadCards).toHaveBeenCalledTimes(2);
    expect((screen.getByLabelText("Question") as HTMLInputElement).value).toBe("");
  });

  it("puts a first card in a new Flashcards note", async () => {
    const props = open({ loadCards: vi.fn(async () => []) });
    await screen.findByText("No flashcards yet");
    fireEvent.change(screen.getByLabelText("Question"), { target: { value: "One" } });
    fireEvent.change(screen.getByLabelText("Answer"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Add card" }));
    await waitFor(() =>
      expect(props.onAddCards).toHaveBeenCalledWith("flashcards/Flashcards.md", [
        { question: "One", answer: "1" },
      ]),
    );
  });

  it("suggests cards from the open note, and adds the ticked ones to it", async () => {
    const props = open({
      currentNote: {
        path: "bio/Cells.md",
        title: "Cells",
        content: "**Osmosis**: water moving across a membrane\n- Ribosome: makes proteins from RNA",
      },
    });
    await screen.findByText("Cards from “Cells”");
    fireEvent.click(screen.getByRole("checkbox", { name: /Ribosome/ }));
    fireEvent.click(screen.getByRole("button", { name: "Add 1 card to this note" }));
    await waitFor(() =>
      expect(props.onAddCards).toHaveBeenCalledWith("bio/Cells.md", [
        { question: "Osmosis", answer: "water moving across a membrane" },
      ]),
    );
  });

  it("studies one deck on its own", async () => {
    open({ loadCards: vi.fn(async () => [...CARDS, ...MORE]) });
    fireEvent.click(await screen.findByRole("button", { name: "Study Biology" }));
    expect(await screen.findByText("Mitochondria")).toBeTruthy();
    expect(screen.getByText(/1 left/)).toBeTruthy();
  });
});

describe("FlashcardsDialog — studying", () => {
  it("shows a question, then its answer, then grades it into the schedule file", async () => {
    const props = open();
    await study();
    expect(await screen.findByText("Capital of France")).toBeTruthy();
    expect(screen.queryByText("Paris")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Show answer/ }));
    expect(screen.getByText("Paris")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /^Good/ }));
    await waitFor(() => expect(props.writeSchedule).toHaveBeenCalledTimes(1));
    const written = parseSchedule(vi.mocked(props.writeSchedule).mock.calls[0]![0]);
    expect(written.get(CARDS[0]!.id)).toEqual({
      due: "2026-09-14",
      interval: 1,
      ease: 2.5,
      reps: 1,
    });
    expect(screen.getByText("Capital of Peru")).toBeTruthy();
  });

  it("explains each grade and when the card comes back", async () => {
    open();
    await study();
    fireEvent.click(await screen.findByRole("button", { name: /Show answer/ }));
    expect(screen.getByRole("button", { name: /^Again/ }).textContent).toContain(
      "Forgot it · again in this session",
    );
    expect(screen.getByRole("button", { name: /^Easy/ }).textContent).toContain(
      "Too easy · again in 4 days",
    );
  });

  it("brings a forgotten card back before the session ends", async () => {
    open();
    await study();
    fireEvent.click(await screen.findByRole("button", { name: /Show answer/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Again/ }));
    fireEvent.click(screen.getByRole("button", { name: /Show answer/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Good/ }));
    expect(await screen.findByText("Capital of France")).toBeTruthy();
  });

  it("works from the keyboard, by key or key code", async () => {
    const props = open();
    await study();
    await screen.findByText("Capital of France");
    fireEvent.keyDown(window, { key: "", code: "Space" });
    expect(screen.getByText("Paris")).toBeTruthy();
    fireEvent.keyDown(window, { key: "&", code: "Digit3" });
    await waitFor(() => expect(props.writeSchedule).toHaveBeenCalled());
    expect(screen.getByText("Capital of Peru")).toBeTruthy();
    fireEvent.keyDown(window, { key: " " });
    fireEvent.keyDown(window, { key: "4" });
    expect(await screen.findByText("Done — 2 cards reviewed.")).toBeTruthy();
  });

  it("does not grade before the answer is shown, and ignores keys on the home screen", async () => {
    const props = open();
    await screen.findByText("2 cards to study today");
    fireEvent.keyDown(window, { key: " " });
    expect(screen.queryByText("Capital of France")).toBeNull();
    await study();
    await screen.findByText("Capital of France");
    fireEvent.keyDown(window, { key: "3" });
    expect(props.writeSchedule).not.toHaveBeenCalled();
  });

  it("when nothing is due, says when the next card comes back and lets a deck be practised", async () => {
    const schedule = new Map(
      CARDS.map((card) => [card.id, { due: "2026-09-20", interval: 7, ease: 2.5, reps: 2 }]),
    );
    open({ readSchedule: vi.fn(async () => formatSchedule(schedule)) });
    expect(await screen.findByText("Nothing to study today")).toBeTruthy();
    expect(screen.getByText(/next review on 2026-09-20/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Practise Geography" }));
    expect(await screen.findByText("Capital of France")).toBeTruthy();
    expect(screen.getByText(/Practising ahead/)).toBeTruthy();
  });

  it("finishes a session and goes back home", async () => {
    open({ loadCards: vi.fn(async () => [CARDS[0]!]) });
    await study();
    fireEvent.click(await screen.findByRole("button", { name: /Show answer/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Easy/ }));
    expect(await screen.findByText("Done — 1 card reviewed.")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: /Back to flashcards/ }).at(-1)!);
    expect(await screen.findByText("Nothing to study today")).toBeTruthy();
  });

  it("keeps going, and says so, when the schedule cannot be saved", async () => {
    open({ writeSchedule: vi.fn(async () => Promise.reject(new Error("offline"))) });
    await study();
    fireEvent.click(await screen.findByRole("button", { name: /Show answer/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Good/ }));
    expect((await screen.findByRole("alert")).textContent).toContain("could not be saved");
    expect(screen.getByText("Capital of Peru")).toBeTruthy();
  });
});
