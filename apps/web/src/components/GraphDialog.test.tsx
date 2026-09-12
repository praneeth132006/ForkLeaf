// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { buildLinkGraph } from "@forkleaf/markdown-engine";
import { GraphDialog } from "./GraphDialog";

afterEach(cleanup);

const GRAPH = buildLinkGraph([
  { path: "a.md", title: "Alpha", content: "[[b]]" },
  { path: "b.md", title: "Beta", content: "[[c]]" },
  { path: "c.md", title: "Gamma", content: "[[d]]" },
  { path: "d.md", title: "Delta", content: "" },
  { path: "z.md", title: "Zeta", content: "[[y]]" },
  { path: "y.md", title: "Ypsilon", content: "" },
  { path: "lonely.md", title: "Lonely", content: "" },
]);

const TITLES: Record<string, string> = {
  "a.md": "Alpha",
  "b.md": "Beta",
  "c.md": "Gamma",
  "d.md": "Delta",
  "z.md": "Zeta",
  "y.md": "Ypsilon",
  "lonely.md": "Lonely",
};

function open(over: Partial<React.ComponentProps<typeof GraphDialog>> = {}) {
  const props = {
    onClose: vi.fn(),
    graph: GRAPH,
    titleFor: (path: string) => TITLES[path] ?? path,
    ready: true,
    currentPath: "a.md" as string | null,
    onOpenNote: vi.fn(),
    ...over,
  };
  render(<GraphDialog {...props} />);
  return props;
}

const dots = () =>
  screen
    .getAllByRole("button")
    .filter((element) => element.tagName.toLowerCase() === "g")
    .map((element) => element.getAttribute("aria-label"));

describe("GraphDialog", () => {
  it("starts on the notes within two links of the open one", () => {
    open();
    expect(dots().sort()).toEqual(["Alpha", "Beta", "Gamma"]);
    expect(screen.getByText(/3 notes · 2 links/)).toBeTruthy();
  });

  it("shows the whole notebook, and notes with no links when asked", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Whole notebook" }));
    expect(dots()).toHaveLength(6);
    fireEvent.click(screen.getByRole("checkbox", { name: "Notes with no links" }));
    expect(dots()).toContain("Lonely");
  });

  it("opens a note by click or keyboard", () => {
    const props = open();
    fireEvent.click(screen.getByRole("button", { name: "Beta" }));
    expect(props.onOpenNote).toHaveBeenCalledWith("b.md");
    fireEvent.keyDown(screen.getByRole("button", { name: "Gamma" }), { key: "Enter" });
    expect(props.onOpenNote).toHaveBeenCalledWith("c.md");
  });

  it("offers only the whole notebook when no note is open", () => {
    open({ currentPath: null });
    expect(
      (screen.getByRole("button", { name: "Near this note" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(dots()).toHaveLength(6);
  });

  it("explains how to make a link when there are none", () => {
    open({ graph: buildLinkGraph([{ path: "x.md", title: "x", content: "" }]), currentPath: null });
    expect(screen.getByText(/No links between notes yet/)).toBeTruthy();
  });

  it("says it is still reading", () => {
    open({ ready: false });
    expect(screen.getByText("Reading your notes…")).toBeTruthy();
  });
});
