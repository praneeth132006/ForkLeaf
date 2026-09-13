// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { cardStatus, faceId, gradePreview, useInlineFlashcards } from "./inline-flashcards";
import { SCHEDULE_PATH, cardId, formatSchedule, parseSchedule } from "./flashcards";

afterEach(cleanup);

const TODAY = "2026-09-13";

describe("what a card in the note says", () => {
  it("is new, due, or coming back on a day", () => {
    expect(cardStatus(undefined, TODAY)).toBe("New card");
    expect(cardStatus({ due: "2026-09-10", interval: 3, ease: 2.5, reps: 2 }, TODAY)).toBe(
      "Due today",
    );
    expect(cardStatus({ due: "2026-09-14", interval: 1, ease: 2.5, reps: 1 }, TODAY)).toBe(
      "Next review tomorrow",
    );
    expect(cardStatus({ due: "2026-09-19", interval: 6, ease: 2.5, reps: 2 }, TODAY)).toBe(
      "Next review in 6 days",
    );
  });

  it("says when each grade brings a new card back", () => {
    expect(gradePreview(undefined, TODAY)).toEqual({
      again: "tomorrow",
      hard: "tomorrow",
      good: "tomorrow",
      easy: "in 4 days",
    });
  });

  it("gives a card the id the review session gives it, escapes and all", () => {
    expect(faceId("a.md", { question: "2 \\* 3", answer: "6", reversed: false })).toBe(
      cardId("a.md", "2 * 3"),
    );
  });
});

describe("grading a card in the note", () => {
  it("reads the schedule, and writes one row back without losing the others", async () => {
    const other = formatSchedule(
      new Map([["abcdef12", { due: "2026-10-01", interval: 10, ease: 2.5, reps: 3 }]]),
    );
    let file = other;
    const store = {
      readNote: vi.fn(async () => file),
      upsertNote: vi.fn(async (_path: string, change: (content: string) => string) => {
        file = change(file);
        return file;
      }),
    };
    const { result } = renderHook(() => useInlineFlashcards("notes/Chem.md", store));
    await waitFor(() => expect(store.readNote).toHaveBeenCalledWith(SCHEDULE_PATH));

    const face = { question: "H2O", answer: "Water", reversed: false };
    expect(result.current!.status(face)).toBe("New card");
    act(() => result.current!.grade(face, "good"));
    expect(result.current!.status(face)).toBe("Next review tomorrow");

    await waitFor(() => expect(store.upsertNote).toHaveBeenCalled());
    const written = parseSchedule(file);
    expect(written.get("abcdef12")).toBeTruthy();
    expect(written.get(cardId("notes/Chem.md", "H2O"))).toMatchObject({ interval: 1, reps: 1 });
  });

  it("says so when a grade cannot be saved", async () => {
    const problem = vi.fn();
    const store = { readNote: async () => null, upsertNote: async () => null };
    const { result } = renderHook(() => useInlineFlashcards("a.md", store, problem));
    act(() => result.current!.grade({ question: "Q", answer: "A", reversed: false }, "easy"));
    await waitFor(() => expect(problem).toHaveBeenCalledWith("The grade could not be saved."));
  });

  it("offers nothing when no note is open", () => {
    const store = { readNote: async () => null, upsertNote: async () => null };
    const { result } = renderHook(() => useInlineFlashcards(null, store));
    expect(result.current).toBeUndefined();
  });
});
