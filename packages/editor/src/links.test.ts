// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { handleLinkClick, type LinkBridge } from "./links";

/**
 * Clicking a link in rendered markdown.
 *
 * The delegation here decides what the browser is allowed to do with a click,
 * so the cases that matter most are the ones where it must keep its hands off:
 * a modifier held down, a middle click, an ordinary link the app has no
 * opinion about. Getting those wrong means "open in new tab" silently doing
 * nothing, which reads as the app being broken in a way nobody can describe.
 */

function bridgeWith(overrides: Partial<LinkBridge> = {}): LinkBridge {
  return { resolve: () => null, open: vi.fn(), ...overrides };
}

/** Builds a click on an anchor inside a container, as the DOM would deliver it. */
function clickOn(html: string, init: MouseEventInit = {}) {
  document.body.innerHTML = `<div id="root">${html}</div>`;
  const anchor = document.querySelector("a")!;
  const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...init });
  Object.defineProperty(event, "target", { value: anchor });
  return event;
}

describe("wikilinks", () => {
  it("opens the target and stops the browser following the link", () => {
    const open = vi.fn();
    const event = clickOn(`<a data-wikilink="Roadmap" href="#">Roadmap</a>`);

    expect(handleLinkClick(event, bridgeWith({ open }))).toBe(true);
    expect(open).toHaveBeenCalledWith("Roadmap", null);
    expect(event.defaultPrevented).toBe(true);
  });

  it("passes the anchor along", () => {
    const open = vi.fn();
    const event = clickOn(
      `<a data-wikilink="Roadmap" data-wikilink-anchor="q3" href="#">Roadmap</a>`,
    );

    handleLinkClick(event, bridgeWith({ open }));
    expect(open).toHaveBeenCalledWith("Roadmap", "q3");
  });

  it("is claimed before any opinion about the href is asked for", () => {
    const openHref = vi.fn(() => true);
    const event = clickOn(`<a data-wikilink="Paper" href="paper.pdf">Paper</a>`);

    handleLinkClick(event, bridgeWith({ openHref }));
    expect(openHref).not.toHaveBeenCalled();
  });
});

describe("ordinary links", () => {
  it("is claimed when the app says it wants it", () => {
    const openHref = vi.fn(() => true);
    const event = clickOn(`<a href="papers/x.pdf#page=12">the paper</a>`);

    expect(handleLinkClick(event, bridgeWith({ openHref }))).toBe(true);
    expect(openHref).toHaveBeenCalledWith("papers/x.pdf#page=12");
    expect(event.defaultPrevented).toBe(true);
  });

  it("is left to the browser when the app declines it", () => {
    const event = clickOn(`<a href="https://example.com">a site</a>`);

    expect(handleLinkClick(event, bridgeWith({ openHref: () => false }))).toBe(false);
    expect(event.defaultPrevented).toBe(false);
  });

  it("offers the href exactly as the note wrote it", () => {
    // Not `anchor.href`, which the DOM has already resolved against this page —
    // turning a repository-relative path into an absolute URL to this app,
    // which is not a path anything can look up in a repository.
    const openHref = vi.fn(() => true);
    handleLinkClick(clickOn(`<a href="../papers/x.pdf">x</a>`), bridgeWith({ openHref }));

    expect(openHref).toHaveBeenCalledWith("../papers/x.pdf");
  });

  it("finds the link when the click landed on something inside it", () => {
    const openHref = vi.fn(() => true);
    document.body.innerHTML = `<a href="a.pdf"><em id="inner">x</em></a>`;
    const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    Object.defineProperty(event, "target", { value: document.getElementById("inner") });

    expect(handleLinkClick(event, bridgeWith({ openHref }))).toBe(true);
  });

  it("does nothing for a bridge with no opinion at all", () => {
    const event = clickOn(`<a href="a.pdf">x</a>`);
    expect(handleLinkClick(event, bridgeWith())).toBe(false);
    expect(event.defaultPrevented).toBe(false);
  });
});

describe("clicks that are not ours", () => {
  it.each([
    ["a ⌘-click", { metaKey: true }],
    ["a ctrl-click", { ctrlKey: true }],
    ["a shift-click", { shiftKey: true }],
    ["an alt-click", { altKey: true }],
    ["a middle click", { button: 1 }],
    ["a right click", { button: 2 }],
  ])("leaves %s to the browser", (_name, init) => {
    // "Open in a new tab" and "save link as" are affordances people rely on,
    // and an app that swallows them has broken something it did not write.
    const openHref = vi.fn(() => true);
    const open = vi.fn();
    const event = clickOn(`<a data-wikilink="Roadmap" href="a.pdf">x</a>`, init);

    expect(handleLinkClick(event, bridgeWith({ open, openHref }))).toBe(false);
    expect(open).not.toHaveBeenCalled();
    expect(openHref).not.toHaveBeenCalled();
  });

  it("leaves an already-handled click alone", () => {
    const event = clickOn(`<a href="a.pdf">x</a>`);
    event.preventDefault();

    expect(handleLinkClick(event, bridgeWith({ openHref: () => true }))).toBe(false);
  });

  it("does nothing at all without a bridge", () => {
    expect(handleLinkClick(clickOn(`<a href="a.pdf">x</a>`), undefined)).toBe(false);
  });

  it("ignores a click that is not on a link", () => {
    document.body.innerHTML = `<p id="text">not a link</p>`;
    const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    Object.defineProperty(event, "target", { value: document.getElementById("text") });

    expect(handleLinkClick(event, bridgeWith({ openHref: () => true }))).toBe(false);
  });
});
