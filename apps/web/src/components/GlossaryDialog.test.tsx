// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { GlossaryDialog } from "./GlossaryDialog";
import { buildGlossary } from "@/lib/glossary";

afterEach(cleanup);

const glossary = buildGlossary([
  { path: "a.md", title: "Systems", content: "**Latency** is how long one request takes." },
  { path: "b.md", title: "Ops", content: "**Latency** is the delay a user notices." },
  { path: "c.md", title: "Maths", content: "**Bijection** means a one-to-one pairing." },
]);

function mount(entries = glossary.entries) {
  const onOpen = vi.fn();
  const onToggle = vi.fn();
  render(
    <GlossaryDialog
      onClose={vi.fn()}
      entries={entries}
      onOpen={onOpen}
      underlining
      onToggleUnderlining={onToggle}
    />,
  );
  return { onOpen, onToggle };
}

describe("GlossaryDialog", () => {
  it("lists terms A to Z with every definition", () => {
    mount();
    const terms = Array.from(document.querySelectorAll("dt")).map((term) => term.textContent);
    expect(terms).toEqual(["Bijection", "Latency"]);
    expect(screen.getByText("Latency is how long one request takes.")).toBeTruthy();
    expect(screen.getByText("Latency is the delay a user notices.")).toBeTruthy();
  });

  it("filters by term or definition", () => {
    mount();
    fireEvent.change(screen.getByLabelText("Filter terms"), { target: { value: "pairing" } });
    expect(Array.from(document.querySelectorAll("dt")).map((term) => term.textContent)).toEqual([
      "Bijection",
    ]);
    expect(screen.getByText("1 of 2 terms")).toBeTruthy();
  });

  it("opens the note a definition is in", () => {
    const { onOpen } = mount();
    fireEvent.click(screen.getByText("Ops"));
    expect(onOpen).toHaveBeenCalledWith("b.md", 1);
  });

  it("switches underlining from here", () => {
    const { onToggle } = mount();
    fireEvent.click(screen.getByLabelText("Underline terms in notes"));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("explains how to define a term when there are none", () => {
    mount(new Map());
    expect(screen.getByText("No terms defined yet.")).toBeTruthy();
  });
});
