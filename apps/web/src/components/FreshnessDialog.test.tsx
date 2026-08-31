// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FreshnessDialog } from "./FreshnessDialog";

/**
 * jsdom here has a `localStorage` property with nothing behind it, so
 * remembering a dismissal — which is half of what this dialog does — could
 * not otherwise be tested at all. An in-memory Storage is enough: what is
 * under test is that the dialog writes and reads back, not the browser's.
 */
const store = new Map<string, string>();

beforeAll(() => {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, String(value)),
      removeItem: (key: string) => void store.delete(key),
      clear: () => store.clear(),
      key: (index: number) => [...store.keys()][index] ?? null,
      get length() {
        return store.size;
      },
    },
  });
});

afterEach(() => {
  cleanup();
  store.clear();
});

const YEARS_AGO = "2019-01-01T00:00:00.000Z";

const notes = [
  {
    path: "runbook.md",
    content: "# Deploy runbook\n\n![diagram](assets/gone.png)\n\nNeeds v14.2 as of 2019.",
    updatedAt: YEARS_AGO,
  },
  { path: "fine.md", content: "# Fine\n\nOrdinary prose about how I think.", updatedAt: null },
];

function open(over: Partial<React.ComponentProps<typeof FreshnessDialog>> = {}) {
  const props = {
    onClose: vi.fn(),
    loadNotes: vi.fn(async () => notes),
    loadFiles: vi.fn(async () => ["runbook.md", "fine.md"]),
    onOpenNote: vi.fn(),
    workspaceId: "w",
    ...over,
  };

  render(<FreshnessDialog {...props} />);
  return props;
}

const check = () => fireEvent.click(screen.getByRole("button", { name: /Check my notes/ }));

describe("FreshnessDialog — the sweep", () => {
  it("reads nothing until it is asked to", () => {
    const props = open();
    expect(props.loadNotes).not.toHaveBeenCalled();
  });

  it("names the note, and the file that is not there", async () => {
    open();
    check();

    expect(await screen.findByRole("button", { name: "Deploy runbook" })).toBeTruthy();
    expect(screen.getByText("assets/gone.png")).toBeTruthy();
    // The note that is fine is not a row. A list of everything is a list
    // nobody reads.
    expect(screen.queryByRole("button", { name: "Fine" })).toBeNull();
  });

  it("says so plainly when there is nothing to report", async () => {
    open({ loadNotes: vi.fn(async () => [notes[1]!]) });
    check();

    expect(await screen.findByText(/Nothing looks stale/)).toBeTruthy();
  });

  it("opens the note a row is about", async () => {
    const props = open();
    check();

    fireEvent.click(await screen.findByRole("button", { name: "Deploy runbook" }));
    expect(props.onOpenNote).toHaveBeenCalledWith("runbook.md");
  });

  /**
   * Without the file list every picture in the notebook looks deleted, which
   * is the most alarming possible thing to be wrong about.
   */
  it("checks nothing rather than guessing when the file list will not come", async () => {
    open({
      loadFiles: vi.fn(async () => {
        throw new Error("The repository's file list could not be read.");
      }),
    });
    check();

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByText("assets/gone.png")).toBeNull();
  });
});

describe("FreshnessDialog — saying a note is fine", () => {
  it("takes it off the list and remembers", async () => {
    open();
    check();

    fireEvent.click(await screen.findByRole("button", { name: /Dismiss Deploy runbook/ }));
    expect(screen.queryByRole("button", { name: "Deploy runbook" })).toBeNull();

    // Opened again, the same note stays off the list.
    cleanup();
    open();
    check();
    expect(await screen.findByText(/dealt with everything/)).toBeTruthy();
  });

  it("brings it back once the note has been edited again", async () => {
    open();
    check();
    fireEvent.click(await screen.findByRole("button", { name: /Dismiss Deploy runbook/ }));

    cleanup();
    open({
      loadNotes: vi.fn(async () => [{ ...notes[0]!, updatedAt: "2026-08-31T00:00:00.000Z" }]),
    });
    check();

    // The edit is the only moment its claims could have changed.
    expect(await screen.findByRole("button", { name: "Deploy runbook" })).toBeTruthy();
  });

  it("can show what has been dealt with, for anybody who wants to look", async () => {
    open();
    check();
    fireEvent.click(await screen.findByRole("button", { name: /Dismiss Deploy runbook/ }));

    fireEvent.click(screen.getByRole("button", { name: /1 dismissed/ }));
    expect(screen.getByRole("button", { name: "Deploy runbook" })).toBeTruthy();
  });
});
