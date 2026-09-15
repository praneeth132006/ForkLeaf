// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Marquee } from "./Marquee";

afterEach(cleanup);

/** jsdom lays nothing out, so the two widths that matter are supplied. */
function withWidths(text: number, room: number, run: () => void) {
  const offset = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth");
  const client = Object.getOwnPropertyDescriptor(Element.prototype, "clientWidth");
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get: () => text,
  });
  Object.defineProperty(Element.prototype, "clientWidth", { configurable: true, get: () => room });
  try {
    run();
  } finally {
    if (offset) Object.defineProperty(HTMLElement.prototype, "offsetWidth", offset);
    if (client) Object.defineProperty(Element.prototype, "clientWidth", client);
  }
}

describe("text in a fixed amount of room", () => {
  it("sits still when it fits", () => {
    withWidths(100, 200, () => {
      render(<Marquee text="notes/plan.md" />);
      const box = screen.getByTitle("notes/plan.md");

      expect(box.hasAttribute("data-scrolling")).toBe(false);
      expect(box.textContent).toBe("notes/plan.md");
    });
  });

  it("scrolls when it does not, with a second copy so the loop is seamless", () => {
    withWidths(600, 200, () => {
      render(<Marquee text="a/very/long/path.md" />);
      const box = screen.getByTitle("a/very/long/path.md");

      expect(box.hasAttribute("data-scrolling")).toBe(true);
      expect(box.textContent).toBe("a/very/long/path.mda/very/long/path.md");
      const track = box.firstElementChild as HTMLElement;
      expect(track.style.getPropertyValue("--fl-marquee-shift")).toBe("648px");
    });
  });
});
