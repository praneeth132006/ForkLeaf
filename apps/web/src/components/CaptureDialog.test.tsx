// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CaptureDialog } from "./CaptureDialog";

const capturePage = vi.fn();

/**
 * Only `capturePage` is faked. The error class is the real one, because the
 * dialog decides what to say with `instanceof` — a stand-in would make the
 * tests agree with a version of the code that does not exist.
 */
vi.mock("@/lib/gateway", async () => {
  const actual = await vi.importActual<typeof import("@/lib/gateway")>("@/lib/gateway");
  return { ...actual, capturePage: (...a: unknown[]) => capturePage(...a) };
});

const { ApiGatewayError } = await import("@/lib/gateway");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const PAGE = {
  url: "https://example.com/a",
  title: "The article",
  capturedAt: "2026-08-27T10:04:09.000Z",
  archiveUrl: null,
  archivedAt: null,
  titleFromUrl: false,
};

const ARCHIVE = {
  ...PAGE,
  archiveUrl: "https://web.archive.org/web/20240315120000/https://example.com/a",
  archivedAt: "2024-03-15T12:00:00.000Z",
};

/** Answers the two halves of a capture separately, as the route does. */
function serve(
  page: unknown = PAGE,
  archive: unknown = ARCHIVE,
  options: { pageRejects?: unknown; archiveRejects?: unknown } = {},
) {
  capturePage.mockImplementation((_url: string, want: string) => {
    if (want === "page") {
      return options.pageRejects ? Promise.reject(options.pageRejects) : Promise.resolve(page);
    }
    return options.archiveRejects
      ? Promise.reject(options.archiveRejects)
      : Promise.resolve(archive);
  });
}

function view(onInsert = vi.fn()) {
  render(<CaptureDialog onInsert={onInsert} onClose={vi.fn()} />);
  return onInsert;
}

const type = (value: string) =>
  fireEvent.change(screen.getByLabelText(/address to capture/i), { target: { value } });

const capture = () => fireEvent.click(screen.getByRole("button", { name: /^capture$/i }));

describe("CaptureDialog — before anything is typed", () => {
  it("says what the feature does and what it writes", async () => {
    // "I do not know how this works or how to use it" is a bug in the dialog,
    // not in the reader.
    view();

    expect(screen.getByText(/paste the address of a page you are citing/i)).toBeTruthy();
    expect(screen.getByText(/> \*\*Source\*\*/)).toBeTruthy();
  });

  it("refuses something that is not a web address, without asking the server", async () => {
    view();
    type("not a url");
    capture();

    await waitFor(() => expect(screen.getByText(/not a web address/i)).toBeTruthy());
    expect(capturePage).not.toHaveBeenCalled();
  });
});

describe("CaptureDialog — while it works", () => {
  it("asks for the two halves separately, so the fast one is not held up", async () => {
    serve();
    view();
    type("https://example.com/a");
    capture();

    await waitFor(() => expect(capturePage).toHaveBeenCalledTimes(2));
    expect(capturePage).toHaveBeenCalledWith("https://example.com/a", "page");
    expect(capturePage).toHaveBeenCalledWith("https://example.com/a", "archive");
  });

  it("names what it is waiting for rather than showing a bare spinner", async () => {
    // A slow archive with no explanation is why this read as broken.
    capturePage.mockImplementation((_url: string, want: string) =>
      want === "page" ? Promise.resolve(PAGE) : new Promise(() => {}),
    );
    view();
    type("https://example.com/a");
    capture();

    await waitFor(() => expect(screen.getByText("The article")).toBeTruthy());
    expect(screen.getByText(/looking for an archived copy/i)).toBeTruthy();
    expect(screen.getByText(/up to a minute/i)).toBeTruthy();
  });

  it("offers to add the citation before the archive lookup has finished", async () => {
    capturePage.mockImplementation((_url: string, want: string) =>
      want === "page" ? Promise.resolve(PAGE) : new Promise(() => {}),
    );
    const onInsert = view();
    type("https://example.com/a");
    capture();

    await waitFor(() => expect(screen.getByText("The article")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /add to this note/i }));

    await waitFor(() => expect(onInsert).toHaveBeenCalled());
  });
});

describe("CaptureDialog — what it found", () => {
  it("shows the exact text that will be written into the note", async () => {
    serve();
    view();
    type("https://example.com/a");
    capture();

    await waitFor(() => expect(screen.getByText(/what goes into the note/i)).toBeTruthy());
    expect(screen.getByText(/> \*\*Source\*\* — \[The article\]/)).toBeTruthy();
  });

  it("puts the archived copy into that text once it arrives", async () => {
    serve();
    view();
    type("https://example.com/a");
    capture();

    await waitFor(() => expect(screen.getByText(/archived copy from/i)).toBeTruthy());
    expect(screen.getByText(/web\.archive\.org/)).toBeTruthy();
  });

  it("says plainly when there is no archived copy", async () => {
    serve(PAGE, { ...PAGE, archiveUrl: null, archivedAt: null });
    view();
    type("https://example.com/a");
    capture();

    // Said twice on purpose: once as the step's own outcome, and once inside
    // the citation, which carries the caveat into the note.
    await waitFor(() => expect(screen.getAllByText(/no archived copy/i).length).toBe(2));
  });

  it("says when the title is only the address", async () => {
    serve({ ...PAGE, titleFromUrl: true });
    view();
    type("https://example.com/a");
    capture();

    await waitFor(() => expect(screen.getByText(/address stands in for a title/i)).toBeTruthy());
  });

  it("writes nothing until the reader says so", async () => {
    serve();
    const onInsert = view();
    type("https://example.com/a");
    capture();

    await waitFor(() => expect(screen.getByText("The article")).toBeTruthy());
    expect(onInsert).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /add to this note/i }));
    await waitFor(() => expect(onInsert).toHaveBeenCalled());
    expect(String(onInsert.mock.calls[0]![0])).toContain("> **Source** — [The article]");
  });

  it("captures on Enter, without reaching for the button", async () => {
    serve();
    view();
    type("https://example.com/a");
    fireEvent.keyDown(screen.getByLabelText(/address to capture/i), { key: "Enter" });

    await waitFor(() => expect(capturePage).toHaveBeenCalledWith("https://example.com/a", "page"));
  });
});

describe("CaptureDialog — when it fails", () => {
  it("passes on why a capture failed", async () => {
    serve(undefined, undefined, {
      pageRejects: new Error("That address is inside a private network."),
    });
    view();
    type("https://example.com/a");
    capture();

    await waitFor(() => expect(screen.getByText(/private network/i)).toBeTruthy());
  });

  it("explains an expired sign-in instead of repeating the status code", async () => {
    serve(undefined, undefined, {
      pageRejects: new ApiGatewayError("unauthorized", "Sign in with GitHub to continue.", 401),
    });
    view();
    type("https://example.com/a");
    capture();

    await waitFor(() => expect(screen.getByText(/sign in with github to capture/i)).toBeTruthy());
  });

  it("explains being rate limited", async () => {
    serve(undefined, undefined, {
      pageRejects: new ApiGatewayError("rate-limited", "Too many requests", 429),
    });
    view();
    type("https://example.com/a");
    capture();

    await waitFor(() => expect(screen.getByText(/a lot of captures/i)).toBeTruthy());
  });

  it("does not treat a missing archive as a failure of the capture", async () => {
    serve(PAGE, undefined, { archiveRejects: new Error("archive.org is down") });
    view();
    type("https://example.com/a");
    capture();

    await waitFor(() => expect(screen.getByText("The article")).toBeTruthy());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("ignores an answer for an address the reader has moved on from", async () => {
    // The slow half routinely outlives the reader's patience; its snapshot
    // must not land in the citation for whatever they typed next.
    let resolveFirst: (value: unknown) => void = () => {};
    capturePage.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
    );
    capturePage.mockImplementation((_url: string, want: string) =>
      want === "page"
        ? Promise.resolve({ ...PAGE, title: "The second one" })
        : Promise.resolve(ARCHIVE),
    );

    view();
    type("https://example.com/first");
    capture();

    // Enter rather than the button, which reads "Reading…" and is disabled
    // while the first capture is still outstanding — which is the whole
    // situation being tested.
    type("https://example.com/second");
    fireEvent.keyDown(screen.getByLabelText(/address to capture/i), { key: "Enter" });
    await waitFor(() => expect(screen.getByText("The second one")).toBeTruthy());

    resolveFirst({ ...PAGE, title: "The first one" });

    await waitFor(() => expect(screen.queryByText("The first one")).toBeNull());
    expect(screen.getByText("The second one")).toBeTruthy();
  });
});
