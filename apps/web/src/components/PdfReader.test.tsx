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

  // A ready document watches its pages to know which are on screen. jsdom has
  // no IntersectionObserver either, and the reader wires one up as soon as it
  // has pages to watch.
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
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
  pdfPath: "papers/attention.pdf",
  citation: { quote: "Attention is all you need.", prefix: "", suffix: "", page: 12 },
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

describe("PdfReader — starting a note from the paper", () => {
  const ready: PdfReaderState = {
    ...loading,
    status: "ready",
    info: {
      pageCount: 15,
      metadata: {
        title: "Attention Is All You Need",
        author: "Vaswani et al.",
        subject: null,
        keywords: [],
        createdAt: null,
        modifiedAt: null,
        producer: null,
      },
      // No sizes, so no page is drawn to a canvas jsdom does not have.
      sizes: [],
      encrypted: false,
    },
  };

  it("offers to write about the paper, and says so in the reader's own words", () => {
    const onStartNote = vi.fn();
    render(<PdfReader reader={ready} layout="document" onStartNote={onStartNote} onClose={null} />);

    fireEvent.click(
      screen.getByRole("button", { name: /Start a note about this paper, with its headings/ }),
    );
    expect(onStartNote).toHaveBeenCalled();
  });

  it("offers nothing of the kind while the document is still opening", () => {
    // The title and the contents are the whole point of the button, and a note
    // made before they arrive would be called "untitled" and be empty.
    render(<PdfReader reader={loading} layout="document" onStartNote={vi.fn()} onClose={null} />);

    expect(screen.queryByRole("button", { name: /Start a note about this paper/ })).toBeNull();
  });
});

/**
 * The one thing here that could outlive ForkLeaf: a citation is a relative
 * path plus a standard fragment, and anything can follow it.
 */
describe("PdfReader — a link anything can follow", () => {
  const withText: PdfReaderState = {
    ...loading,
    status: "ready",
    pages: [
      {
        page: 1,
        text: "We show that attention is all you need, and the rest is engineering.",
        runs: [],
      },
    ],
    info: {
      pageCount: 1,
      metadata: {
        title: null,
        author: null,
        subject: null,
        keywords: [],
        createdAt: null,
        modifiedAt: null,
        producer: null,
      },
      sizes: [],
      encrypted: false,
    },
  };

  it("offers no link for a document that has no path to link to", () => {
    // A PDF from a desktop: a link naming a file nobody else has is not a link.
    render(<PdfReader reader={withText} layout="document" path={null} onClose={null} />);
    expect(screen.queryByRole("button", { name: /Copy link/ })).toBeNull();
  });
});

describe("PdfReader — following the note", () => {
  it("turns to a page it is asked for, and only when the request changes", () => {
    const { rerender } = render(
      <PdfReader reader={loading} layout="document" showPage={null} onClose={null} />,
    );

    // jsdom has no layout, so what is under test is the decision to scroll,
    // not the scrolling: the page is recorded as current either way.
    rerender(<PdfReader reader={loading} layout="document" showPage={4} onClose={null} />);
    rerender(<PdfReader reader={loading} layout="document" showPage={4} onClose={null} />);

    // No throw, no loop: asking twice for the same page is not two requests.
    expect(screen.getByLabelText("Contents and search")).toBeTruthy();
  });

  it("reports the page it is on, so the note can follow it back", () => {
    const onPageChange = vi.fn();
    render(
      <PdfReader reader={loading} layout="document" onPageChange={onPageChange} onClose={null} />,
    );

    expect(onPageChange).toHaveBeenCalledWith(1);
  });
});
