// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

// The panel reaches for the router to sign out, and for IndexedDB to count
// what has been written. Neither is what is under test here, and jsdom has
// neither.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@forkleaf/store", () => ({ openLocalDatabase: async () => null }));

const { ProfilePanel } = await import("./ProfilePanel");

afterEach(cleanup);

/**
 * Colour swatches, and why they must not use the `background` shorthand.
 *
 * React writes an inline style straight into the server HTML. With the
 * shorthand that is `style="background:#2467db"`, which the browser parses
 * into all eight longhands — `background-image`, `background-position-x` and
 * the rest, each reset to `initial`. The client tree only ever set the one
 * property, so hydration finds a tree it cannot reconcile, reports a mismatch,
 * and stops patching that subtree.
 *
 * `backgroundColor` maps one-to-one onto what a swatch actually is, so there
 * is nothing for hydration to disagree about. This asserts on the rendered
 * attribute rather than on the computed style, because that string is exactly
 * what gets sent to the browser and exactly what differed.
 */
describe("colour swatches", () => {
  it("set a background colour, never the background shorthand", () => {
    render(<ProfilePanel user={null} githubAvailable={false} />);

    const swatches = screen
      .getAllByRole("radio", { hidden: true })
      .flatMap((option) => [...option.querySelectorAll<HTMLElement>("[style]")])
      .filter((element) => (element.getAttribute("style") ?? "").includes("background"));

    expect(swatches.length).toBeGreaterThan(0);

    for (const swatch of swatches) {
      const style = swatch.getAttribute("style") ?? "";
      expect(style).toContain("background-color");
      // `background:` with nothing between it and the colon is the shorthand;
      // `background-color:` is not, so the check has to be on the delimiter.
      expect(style).not.toMatch(/(^|;)\s*background\s*:/);
    }
  });
});
