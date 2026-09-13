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

function open(over: Partial<React.ComponentProps<typeof FlashcardsDialog>> = {}) {
  const props = {
    onClose: vi.fn(),
    loadCards: vi.fn(async () => CARDS),
    readSchedule: vi.fn(async () => null as string | null),
    writeSchedule: vi.fn(async (content: string) => void content),
    onOpenNote: vi.fn(),
    now: NOW,
    ...over,
  };
  render(<FlashcardsDialog {...props} />);
  return props;
}

describe("FlashcardsDialog", () => {
  it("shows a question, then its answer, then grades it into the schedule file", async () => {
    const props = open();
    expect(await screen.findByText("Capital of France")).toBeTruthy();
    expect(screen.queryByText("Paris")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Show answer/ }));
    expect(screen.getByText("Paris")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Good/ }));
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

  it("brings a forgotten card back before the session ends", async () => {
    open();
    await screen.findByText("Capital of France");
    fireEvent.click(screen.getByRole("button", { name: /Show answer/ }));
    fireEvent.click(screen.getByRole("button", { name: /Again/ }));
    fireEvent.click(screen.getByRole("button", { name: /Show answer/ }));
    fireEvent.click(screen.getByRole("button", { name: /Good/ }));
    expect(await screen.findByText("Capital of France")).toBeTruthy();
  });

  it("works from the keyboard", async () => {
    const props = open();
    await screen.findByText("Capital of France");
    fireEvent.keyDown(window, { key: " " });
    expect(screen.getByText("Paris")).toBeTruthy();
    fireEvent.keyDown(window, { key: "4" });
    await waitFor(() => expect(props.writeSchedule).toHaveBeenCalled());
    expect(screen.getByText("Capital of Peru")).toBeTruthy();
  });

  it("accepts Space and the number keys by their key code, whatever the layout reports", async () => {
    const props = open();
    await screen.findByText("Capital of France");
    fireEvent.keyDown(window, { key: "", code: "Space" });
    expect(screen.getByText("Paris")).toBeTruthy();
    fireEvent.keyDown(window, { key: "&", code: "Digit3" });
    await waitFor(() => expect(props.writeSchedule).toHaveBeenCalled());
    expect(screen.getByText("Capital of Peru")).toBeTruthy();
  });

  it("does not grade before the answer is shown", async () => {
    const props = open();
    await screen.findByText("Capital of France");
    fireEvent.keyDown(window, { key: "3" });
    expect(props.writeSchedule).not.toHaveBeenCalled();
  });

  it("says when nothing is due, and when the next card comes back", async () => {
    const schedule = new Map(
      CARDS.map((card) => [card.id, { due: "2026-09-20", interval: 7, ease: 2.5, reps: 2 }]),
    );
    open({ readSchedule: vi.fn(async () => formatSchedule(schedule)) });
    expect(await screen.findByText("Nothing is due today.")).toBeTruthy();
    expect(screen.getByText("The next card is due on 2026-09-20.")).toBeTruthy();
  });

  it("finishes a session", async () => {
    open({ loadCards: vi.fn(async () => [CARDS[0]!]) });
    await screen.findByText("Capital of France");
    fireEvent.click(screen.getByRole("button", { name: /Show answer/ }));
    fireEvent.click(screen.getByRole("button", { name: /Easy/ }));
    expect(await screen.findByText("Done for today — 1 review.")).toBeTruthy();
  });

  it("explains the syntax when there are no cards", async () => {
    open({ loadCards: vi.fn(async () => []) });
    expect(await screen.findByText("There are no flashcards in your notes yet.")).toBeTruthy();
  });

  it("keeps going, and says so, when the schedule cannot be saved", async () => {
    open({ writeSchedule: vi.fn(async () => Promise.reject(new Error("offline"))) });
    await screen.findByText("Capital of France");
    fireEvent.click(screen.getByRole("button", { name: /Show answer/ }));
    fireEvent.click(screen.getByRole("button", { name: /Good/ }));
    expect((await screen.findByRole("alert")).textContent).toContain("could not be saved");
    expect(screen.getByText("Capital of Peru")).toBeTruthy();
  });
});
