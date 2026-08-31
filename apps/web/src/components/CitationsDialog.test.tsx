// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { PdfPageText } from "@forkleaf/pdf";
import { CitationsDialog } from "./CitationsDialog";

afterEach(cleanup);

const page = (number: number, text: string): PdfPageText => ({ page: number, text, runs: [] });

/** A note quoting one passage, written the way ForkLeaf writes citations. */
const note = (quote: string, at: number, path = "reading.md") => ({
  path,
  content: [
    `> ${quote}`,
    ">",
    `> — [Paper, p. ${at}](papers/attention.pdf#page=${at}&q=${encodeURIComponent(quote)})`,
  ].join("\n"),
});

function open(over: Partial<React.ComponentProps<typeof CitationsDialog>> = {}) {
  const props = {
    onClose: vi.fn(),
    loadNotes: vi.fn(async () => [note("attention is all you need", 2)]),
    pagesFor: vi.fn(async () => [page(1, "Introduction."), page(2, "attention is all you need")]),
    onOpenNote: vi.fn(),
    onOpenDocument: vi.fn(),
    onFix: vi.fn(async () => {}),
    ...over,
  };

  render(<CitationsDialog {...props} />);
  return props;
}

/** Presses the button that starts the sweep. */
const check = () => fireEvent.click(screen.getByRole("button", { name: /Check my citations/ }));

describe("CitationsDialog — checking", () => {
  it("reads nothing until it is asked to", () => {
    const props = open();
    expect(props.pagesFor).not.toHaveBeenCalled();
  });

  it("says everything is where it should be, without listing all of it", async () => {
    open();
    check();

    expect(await screen.findByText(/1 quotation checked/)).toBeTruthy();
    expect(screen.getByText(/exactly where your notes say/)).toBeTruthy();
  });

  it("names a quotation that is no longer in the document", async () => {
    open({ pagesFor: vi.fn(async () => [page(1, "Something else entirely.")]) });
    check();

    expect(await screen.findByText(/not in the document any more/)).toBeTruthy();
    expect(screen.getByText(/1 points at text that is no longer there/)).toBeTruthy();
  });
});

describe("CitationsDialog — a passage that has moved", () => {
  const moved = () =>
    open({
      pagesFor: vi.fn(async () => [
        page(1, "Introduction."),
        page(2, "A figure that was not here before."),
        page(3, "attention is all you need"),
      ]),
    });

  it("says where it is now, and what the note still claims", async () => {
    moved();
    check();

    expect(await screen.findByText(/Still there, now on page 3/)).toBeTruthy();
  });

  it("corrects the page number only when asked, and says it did", async () => {
    const props = moved();
    check();

    fireEvent.click(await screen.findByRole("button", { name: /Correct the page number/ }));

    await waitFor(() => expect(props.onFix).toHaveBeenCalled());
    // The check it was handed is the one that moved, with the new page on it.
    expect(vi.mocked(props.onFix).mock.calls[0]?.[0]?.page).toBe(3);
    expect(await screen.findByText(/Page number corrected to 3/)).toBeTruthy();
    // Offered once. A second press would rewrite a link that is already right.
    expect(screen.queryByRole("button", { name: /Correct the page number/ })).toBeNull();
  });

  it("goes to the passage, and to the note that quoted it", async () => {
    const props = moved();
    check();

    fireEvent.click(await screen.findByRole("button", { name: /Read page 3/ }));
    expect(props.onOpenDocument).toHaveBeenCalledWith("papers/attention.pdf", 3);

    fireEvent.click(screen.getByRole("button", { name: /reading\.md, line 3/ }));
    expect(props.onOpenNote).toHaveBeenCalledWith("reading.md");
  });
});

describe("CitationsDialog — when things go wrong", () => {
  /**
   * The one message that must never be wrong. A document that could not be
   * fetched is not a document whose every quotation has been deleted.
   */
  it("reports a document it could not read as unread, not as broken", async () => {
    open({
      pagesFor: vi.fn(async () => {
        throw new Error("That PDF could not be read from the repository.");
      }),
    });
    check();

    expect(await screen.findByText(/its citations were not checked/)).toBeTruthy();
    expect(screen.queryByText(/no longer there/)).toBeNull();
  });

  it("says so when the notes themselves cannot be read", async () => {
    open({
      loadNotes: vi.fn(async () => {
        throw new Error("The notebook could not be opened.");
      }),
    });
    check();

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText(/The notebook could not be opened\./)).toBeTruthy();
  });
});
