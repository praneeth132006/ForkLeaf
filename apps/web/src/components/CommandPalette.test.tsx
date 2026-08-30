// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Workspace } from "@forkleaf/types";
import { CommandPalette } from "./CommandPalette";
import { entryFrom } from "@/lib/pdf-index";

afterEach(cleanup);

// jsdom has no `scrollIntoView`, and the palette calls it to keep the
// highlighted row in view. Without this every render throws before anything
// under test happens.
beforeAll(() => {
  Element.prototype.scrollIntoView = () => {};
});

const WORKSPACE: Workspace = {
  id: "w",
  name: "me/notes",
  repo: { owner: "me", repo: "notes", branch: "main", directory: "" },
  isDefault: true,
  isLocal: false,
  createdAt: "",
  lastOpenedAt: "",
};

const DOCUMENTS = [
  entryFrom("w", "papers/attention.pdf", [
    { page: 1, text: "We show that attention is all you need." },
    { page: 2, text: "The rest is engineering." },
  ]),
];

function open(over: Partial<React.ComponentProps<typeof CommandPalette>> = {}) {
  const props = {
    onClose: vi.fn(),
    tree: [{ kind: "file" as const, name: "plan.md", path: "plan.md" }],
    openNotes: [],
    workspace: WORKSPACE,
    onOpenNote: vi.fn(),
    onOpenDocument: vi.fn(),
    documents: DOCUMENTS,
    commands: [],
    ...over,
  };

  render(<CommandPalette {...props} />);
  return props;
}

/** Types into the palette the way somebody looking for something does. */
function search(text: string) {
  fireEvent.change(screen.getByRole("combobox"), { target: { value: text } });
}

describe("CommandPalette — searching inside documents", () => {
  it("finds a phrase in a paper and says which page it is on", () => {
    open();
    search("all you need");

    expect(screen.getByText("Documents")).toBeTruthy();
    expect(screen.getByText("attention.pdf · p. 1")).toBeTruthy();
    // The sentence, not the path: the path is on the line above, and the words
    // are what tell you whether this is the passage you meant.
    expect(screen.getByText(/attention is all you need/)).toBeTruthy();
  });

  it("opens the document at the page the phrase is on", () => {
    const props = open();
    search("engineering");

    fireEvent.click(screen.getByText("attention.pdf · p. 2"));

    expect(props.onOpenDocument).toHaveBeenCalledWith("papers/attention.pdf", 2);
    expect(props.onClose).toHaveBeenCalled();
  });

  it("lists nothing from the documents until something has been typed", () => {
    open();
    expect(screen.queryByText("Documents")).toBeNull();
  });

  it("says it can search documents, but only when it has some", () => {
    open();
    expect(screen.getByRole("combobox").getAttribute("placeholder")).toMatch(/documents/i);

    cleanup();
    open({ documents: [] });
    expect(screen.getByRole("combobox").getAttribute("placeholder")).not.toMatch(/documents/i);
  });

  it("leaves documents out entirely where there is nowhere to open one", () => {
    // The standalone case: no handler, so a result nobody could act on is
    // better not offered.
    open({ onOpenDocument: undefined });
    search("all you need");

    expect(screen.queryByText("Documents")).toBeNull();
  });
});
