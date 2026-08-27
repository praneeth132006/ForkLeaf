// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CaptureDialog } from "./CaptureDialog";

const capturePage = vi.fn();
vi.mock("@/lib/gateway", () => ({ capturePage: (...a: unknown[]) => capturePage(...a) }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const RESULT = {
  url: "https://example.com/a",
  title: "The article",
  capturedAt: "2026-08-27T10:04:09.000Z",
  archiveUrl: "https://web.archive.org/web/20240315120000/https://example.com/a",
  archivedAt: "2024-03-15T12:00:00.000Z",
  titleFromUrl: false,
};

function view(onInsert = vi.fn()) {
  render(<CaptureDialog onInsert={onInsert} onClose={vi.fn()} />);
  return onInsert;
}

const type = (value: string) =>
  fireEvent.change(screen.getByLabelText(/address to capture/i), { target: { value } });

describe("CaptureDialog", () => {
  it("refuses something that is not a web address, without asking the server", async () => {
    view();
    type("not a url");
    fireEvent.click(screen.getByRole("button", { name: /^capture$/i }));

    await waitFor(() => expect(screen.getByText(/not a web address/i)).toBeTruthy());
    expect(capturePage).not.toHaveBeenCalled();
  });

  it("shows what it found before anything is written down", async () => {
    capturePage.mockResolvedValue(RESULT);
    view();
    type("https://example.com/a");
    fireEvent.click(screen.getByRole("button", { name: /^capture$/i }));

    await waitFor(() => expect(screen.getByText("The article")).toBeTruthy());
    expect(screen.getByText(/an archived copy exists/i)).toBeTruthy();
  });

  it("says plainly when there is no archived copy", async () => {
    // This changes what the citation is worth and used to be invisible.
    capturePage.mockResolvedValue({ ...RESULT, archiveUrl: null, archivedAt: null });
    view();
    type("https://example.com/a");
    fireEvent.click(screen.getByRole("button", { name: /^capture$/i }));

    await waitFor(() => expect(screen.getByText(/no snapshot of this page/i)).toBeTruthy());
  });

  it("says when the title is only the address", async () => {
    capturePage.mockResolvedValue({ ...RESULT, titleFromUrl: true });
    view();
    type("https://example.com/a");
    fireEvent.click(screen.getByRole("button", { name: /^capture$/i }));

    await waitFor(() => expect(screen.getByText(/could not be read/i)).toBeTruthy());
  });

  it("writes nothing until the reader says so", async () => {
    capturePage.mockResolvedValue(RESULT);
    const onInsert = view();
    type("https://example.com/a");
    fireEvent.click(screen.getByRole("button", { name: /^capture$/i }));

    await waitFor(() => expect(screen.getByText("The article")).toBeTruthy());
    expect(onInsert).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /add to this note/i }));
    await waitFor(() => expect(onInsert).toHaveBeenCalled());
    expect(String(onInsert.mock.calls[0]![0])).toContain("> **Source** — [The article]");
  });

  it("captures on Enter, without reaching for the button", async () => {
    capturePage.mockResolvedValue(RESULT);
    view();
    type("https://example.com/a");
    fireEvent.keyDown(screen.getByLabelText(/address to capture/i), { key: "Enter" });

    await waitFor(() => expect(capturePage).toHaveBeenCalledWith("https://example.com/a"));
  });

  it("passes on why a capture failed", async () => {
    capturePage.mockRejectedValue(new Error("That address is inside a private network."));
    view();
    type("https://example.com/a");
    fireEvent.click(screen.getByRole("button", { name: /^capture$/i }));

    await waitFor(() => expect(screen.getByText(/private network/i)).toBeTruthy());
  });
});
