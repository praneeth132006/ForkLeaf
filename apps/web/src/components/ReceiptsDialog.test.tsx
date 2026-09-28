// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ReceiptsDialog } from "./ReceiptsDialog";
import { RECEIPTS_KEY, recordReceipt } from "@/lib/ai-receipts";

const store = new Map<string, string>();
beforeAll(() => {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, String(value)),
      removeItem: (key: string) => void store.delete(key),
    },
  });
});
afterEach(() => {
  cleanup();
  store.clear();
});

const send = (path: string | null) =>
  recordReceipt({
    at: "2026-09-28T10:15:00Z",
    provider: "Claude",
    model: "claude-opus-5",
    host: "api.anthropic.com",
    purpose: "Flashcards",
    note: path ? { title: "Cells", path, characters: 1234 } : null,
    question: "Write cards",
  });

describe("ReceiptsDialog", () => {
  it("says nothing has been sent, when nothing has", () => {
    render(<ReceiptsDialog onClose={vi.fn()} />);
    expect(screen.getByText(/Nothing has been sent from this browser/)).toBeTruthy();
  });

  it("lists each send with where it went and which note, and opens the note", () => {
    send("bio/cells.md");
    const onOpenNote = vi.fn();
    render(<ReceiptsDialog onClose={vi.fn()} onOpenNote={onOpenNote} />);
    expect(screen.getByText("1 send to api.anthropic.com")).toBeTruthy();
    expect(screen.getByTestId("receipt").textContent).toContain("Flashcards");
    expect(screen.getByTestId("receipt").textContent).toContain("1,234 characters");
    fireEvent.click(screen.getByRole("button", { name: "Cells" }));
    expect(onOpenNote).toHaveBeenCalledWith("bio/cells.md");
  });

  it("clears them only after asking", () => {
    send(null);
    render(<ReceiptsDialog onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Clear receipts" }));
    expect(store.has(RECEIPTS_KEY)).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(store.has(RECEIPTS_KEY)).toBe(false);
    expect(screen.getByText(/Nothing has been sent/)).toBeTruthy();
  });
});
