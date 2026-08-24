// @vitest-environment jsdom

import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { DiagramDiffView } from "./DiagramDiffView";

/**
 * The review page, rendering a real payload.
 *
 * The diff arithmetic and the SVG renderer are covered in the diagrams
 * package; what is only reachable from here is whether the page turns an API
 * response into a picture — and whether it draws the overlay itself rather
 * than falling back to source listings, which is the entire point of the page.
 *
 * The fetch and the router are stubbed because neither is what is under test:
 * this asks what happens once the answer has arrived.
 */

const params = new URLSearchParams({ pr: "octocat/notes/7" });

vi.mock("next/navigation", () => ({
  useSearchParams: () => params,
}));

const BEFORE = [
  "flowchart TD",
  "    %% forkleaf:layout gw:100,50;rl:100,200;db:100,350",
  "    gw[API gateway] --> rl[Rate limiter]",
  "    rl --> db[(Store)]",
].join("\n");

const AFTER = [
  "flowchart TD",
  "    %% forkleaf:layout gw:100,50;rl:100,200;cache:300,200;db:100,350",
  "    gw[API gateway] --> rl[Rate limiter]",
  "    rl --> cache[Cache]",
  "    cache --> db[(Store)]",
].join("\n");

const payload = {
  pull: {
    number: 7,
    title: "Put a cache in front of the store",
    url: "https://github.com/octocat/notes/pull/7",
    state: "open",
    merged: false,
    author: "octocat",
    base: "main",
    head: "cache",
  },
  repo: { owner: "octocat", repo: "notes" },
  truncated: false,
  markdownFiles: 1,
  signedIn: false,
  files: [
    {
      path: "docs/architecture.md",
      previousPath: null,
      status: "modified",
      diagrams: [
        {
          beforeIndex: 0,
          afterIndex: 0,
          before: BEFORE,
          after: AFTER,
          status: "edited" as const,
          summary: "1 node added, 1 edge added",
        },
      ],
    },
  ],
};

function stubFetch(body: unknown, ok = true): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok, json: async () => body }) as unknown as Response),
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("DiagramDiffView", () => {
  it("draws the changed diagram as an overlay", async () => {
    stubFetch(payload);
    render(<DiagramDiffView />);

    await screen.findByText("docs/architecture.md");

    // The overlay is the default view, and it is our own SVG rather than a
    // source listing or a mermaid render.
    const picture = await screen.findByRole("img", { name: "Both revisions, overlaid" });
    const svg = picture.querySelector("svg");

    expect(svg).not.toBeNull();
    // Everything from both revisions is in one picture.
    expect(picture.textContent).toContain("Cache");
    expect(picture.textContent).toContain("Store");
    // And the added node is drawn in the added colour.
    expect(svg!.innerHTML).toContain("#DCFCE7");
  });

  it("names the pull request it is reviewing", async () => {
    stubFetch(payload);
    render(<DiagramDiffView />);

    await screen.findByText("Put a cache in front of the store");
    expect(screen.getByText(/octocat\/notes #7/)).toBeTruthy();
  });

  it("lists the changes in words as well as in a picture", async () => {
    stubFetch(payload);
    render(<DiagramDiffView />);

    await screen.findByText("docs/architecture.md");

    expect(screen.getByText("+ node Cache")).toBeTruthy();
    expect(screen.getByText("+ arrow Rate limiter → Cache")).toBeTruthy();
  });

  it("says plainly when a pull request changed markdown but no diagram", async () => {
    stubFetch({ ...payload, files: [], markdownFiles: 3 });
    render(<DiagramDiffView />);

    await screen.findByText("No diagram changed");
    expect(screen.getByText(/3 markdown files were changed/)).toBeTruthy();
  });

  it("reports a request it could not read, rather than showing nothing", async () => {
    stubFetch({ error: { code: "not-found", message: "Pull request #7 not found" } }, false);
    render(<DiagramDiffView />);

    await waitFor(() => {
      expect(screen.getByText("Pull request #7 not found")).toBeTruthy();
    });
  });
});
