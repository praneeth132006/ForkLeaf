// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

const previewLink = vi.fn();
vi.mock("@/lib/gateway", () => ({ previewLink: (url: string) => previewLink(url) }));

const { LinkHoverCard } = await import("./LinkHoverCard");

const PREVIEW = {
  url: "https://github.com/hmaverickadams/breach-parse",
  title: "breach-parse",
  description: "A tool for parsing breached passwords",
  host: "github.com",
};

/**
 * A note with one outward link, one wikilink and one link outside the surface.
 *
 * The address is a parameter because answers are cached for the life of the
 * page — deliberately, since a reader hovers the same link repeatedly while
 * deciding — and a shared address would make each test depend on the ones
 * before it.
 */
function note(href = "https://github.com/hmaverickadams/breach-parse") {
  const { container } = render(
    <>
      <div className="fl-prose">
        <a href={href} data-testid="link">
          breach-parse
        </a>
        <a href="https://example.com/note" data-wikilink="Roadmap" data-testid="wikilink">
          Roadmap
        </a>
      </div>
      <div>
        <a href="https://example.com/elsewhere" data-testid="outside">
          elsewhere
        </a>
      </div>
      <LinkHoverCard within=".fl-prose, .ProseMirror" />
    </>,
  );
  return container;
}

/**
 * Hovers an element, lets the open delay elapse, and settles the fetch.
 *
 * `waitFor` is not usable here: it polls on the timers this test controls, so
 * with fake timers running it waits forever. Advancing the clock inside `act`
 * and then flushing the microtask queue does the same job deterministically.
 */
async function hover(testId: string) {
  fireEvent.mouseOver(screen.getByTestId(testId));
  await act(async () => {
    vi.advanceTimersByTime(400);
  });
  await settle();
}

/** Lets a resolved (or rejected) preview reach the component. */
async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  previewLink.mockResolvedValue(PREVIEW);
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  vi.clearAllMocks();
});

describe("LinkHoverCard", () => {
  it("says what is on the other end of a link", async () => {
    note();
    await hover("link");

    const card = screen.getByRole("tooltip");
    expect(card.textContent).toContain("breach-parse");
    expect(card.textContent).toContain("A tool for parsing breached passwords");
    expect(card.textContent).toContain("github.com");
  });

  it("waits before showing, so crossing a link on the way past shows nothing", async () => {
    note();
    fireEvent.mouseOver(screen.getByTestId("link"));

    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(previewLink).not.toHaveBeenCalled();
  });

  it("leaves wikilinks alone — the app already knows what those are", async () => {
    note();
    await hover("wikilink");

    expect(previewLink).not.toHaveBeenCalled();
  });

  it("ignores links outside a note", async () => {
    note();
    await hover("outside");

    expect(previewLink).not.toHaveBeenCalled();
  });

  it("shows the address even when the page could not be read", async () => {
    // An empty card would read as the feature being broken.
    previewLink.mockRejectedValue(new Error("offline"));
    note("https://unreachable.example/page");
    await hover("link");

    expect(screen.getByRole("tooltip").textContent).toContain("unreachable.example");
  });

  it("asks about one address once, however often it is hovered", async () => {
    note("https://example.com/asked-once");
    await hover("link");
    expect(previewLink).toHaveBeenCalledTimes(1);

    fireEvent.mouseOut(screen.getByTestId("link"));
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    await hover("link");

    expect(previewLink).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape", async () => {
    note();
    await hover("link");
    expect(screen.getByRole("tooltip")).toBeTruthy();

    await act(async () => {
      fireEvent.keyDown(document, { key: "Escape" });
    });

    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("names the host without asking the server when signed out", async () => {
    // The address is worth knowing on its own; only the page's own title needs
    // a session to fetch.
    render(
      <>
        <div className="fl-prose">
          <a href="https://example.com/signed-out" data-testid="link">
            a link
          </a>
        </div>
        <LinkHoverCard within=".fl-prose" canRead={false} />
      </>,
    );

    await hover("link");

    expect(previewLink).not.toHaveBeenCalled();
    const card = screen.getByRole("tooltip");
    expect(card.textContent).toContain("example.com");
    expect(card.textContent).toMatch(/sign in with github/i);
  });
});
