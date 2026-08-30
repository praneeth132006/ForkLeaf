// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PdfReader } from "./PdfReader";
import type { PdfReaderState } from "@/hooks/usePdfReader";
import type { PdfMention } from "@/lib/pdf-mentions";

afterEach(cleanup);

beforeAll(() => {
  // The reader measures itself to decide whether the contents can sit beside
  // the page. jsdom has no ResizeObserver, and without one the reader throws
  // on mount — the layout under test never renders at all.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );

  // Every element in jsdom is nought pixels wide, and the reader reads that as
  // "too narrow to dock anything" — so without a width the docked layout can
  // never be under test. A laptop's worth of room.
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get: () => 1200,
  });
});

/**
 * A document that is still opening.
 *
 * Deliberately not a ready one: a ready document draws every page to a canvas,
 * which jsdom cannot do, and none of what these tests are about — where the
 * contents live, and what the notebook has said about the document — depends
 * on a page having been rendered.
 */
const loading: PdfReaderState = {
  status: "loading",
  source: { kind: "local", id: "local:1:paper.pdf", name: "paper.pdf", bytes: new Uint8Array() },
  session: null,
  info: null,
  outline: [],
  pages: [],
  indexing: false,
  error: null,
  open: () => {},
  close: () => {},
  search: () => [],
  locate: () => null,
};

/** The tab's accessible name, which is its `aria-label` rather than its text. */
const NOTES_TAB = "What your notes say about this document";

const mention = (overrides: Partial<PdfMention> = {}): PdfMention => ({
  notePath: "reading/attention.md",
  line: 6,
  label: "Attention, p. 12",
  page: 12,
  quote: "Attention is all you need.",
  context: "> — Attention, p. 12",
  ...overrides,
});

describe("PdfReader — where the contents go", () => {
  it("pins them beside the page when the reader is the window", () => {
    render(<PdfReader reader={loading} layout="document" onClose={null} />);

    // The docked column names itself, and offers its two tabs as tabs rather
    // than as toolbar buttons somewhere else.
    expect(screen.getByLabelText("Contents and search")).toBeTruthy();
    expect(screen.getByRole("separator", { name: "Contents width" })).toBeTruthy();
  });

  it("keeps them out of the way when the reader is sharing with a note", () => {
    render(<PdfReader reader={loading} layout="panel" onClose={null} />);

    expect(screen.queryByLabelText("Contents and search")).toBeNull();
    expect(screen.queryByRole("separator", { name: "Contents width" })).toBeNull();
  });

  it("says so rather than showing an empty list when a document has no contents", () => {
    render(<PdfReader reader={loading} layout="document" onClose={null} />);

    expect(screen.getByText(/no contents list of its own/i)).toBeTruthy();
  });
});

describe("PdfReader — what the notebook says about this document", () => {
  it("lists a quotation, and opens the note it was written in", () => {
    const onOpenMention = vi.fn();

    render(
      <PdfReader
        reader={loading}
        layout="document"
        mentions={[mention()]}
        onOpenMention={onOpenMention}
        titleForNote={() => "On attention"}
        onClose={null}
      />,
    );

    const tab = screen.getByRole("button", { name: NOTES_TAB });
    // The count is on the tab, so the column advertises that there is
    // something in it without being opened.
    expect(tab.textContent).toBe("Notes 1");

    fireEvent.click(tab);
    expect(screen.getByText("Attention is all you need.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "On attention" }));
    expect(onOpenMention).toHaveBeenCalledWith("reading/attention.md");
  });

  it("shows the sentence around a bare reference, since there is no quotation", () => {
    render(
      <PdfReader
        reader={loading}
        layout="document"
        mentions={[mention({ quote: null, context: "The argument comes from the paper." })]}
        onClose={null}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: NOTES_TAB }));
    expect(screen.getByText("The argument comes from the paper.")).toBeTruthy();
  });

  it("invites the first citation rather than showing an empty tab", () => {
    render(<PdfReader reader={loading} layout="document" mentions={[]} onClose={null} />);

    fireEvent.click(screen.getByRole("button", { name: NOTES_TAB }));
    expect(screen.getByText(/Nothing in your notes points at this document yet/i)).toBeTruthy();
  });

  it("offers no such tab for a document that is not in the notebook", () => {
    // A PDF opened from a desktop has no path a note could link to, so
    // "nothing points at this yet" would be advice nobody can act on.
    render(<PdfReader reader={loading} layout="document" mentions={null} onClose={null} />);

    expect(screen.queryByRole("button", { name: NOTES_TAB })).toBeNull();
  });
});
