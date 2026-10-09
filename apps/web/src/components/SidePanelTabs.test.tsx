// @vitest-environment jsdom
import React, { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SidePanelTabs, type SideView } from "./SidePanelTabs";

afterEach(cleanup);

function Harness({ start = "note", unread = 0 }: { start?: SideView; unread?: number }) {
  const [view, setView] = useState<SideView>(start);
  return (
    <>
      <SidePanelTabs view={view} onChange={setView} unread={unread} />
      <output data-testid="view">{view}</output>
    </>
  );
}

const shown = () => screen.getByTestId("view").textContent;

describe("SidePanelTabs", () => {
  it("offers Note, Chat and Assistant, with the current one selected", () => {
    render(<Harness start="chat" />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Note", "Chat", "Assistant"]);
    expect(screen.getByRole("tab", { name: /Chat/ }).getAttribute("aria-selected")).toBe("true");
  });

  it("switches with one click", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("tab", { name: /Assistant/ }));
    expect(shown()).toBe("assistant");
    fireEvent.click(screen.getByRole("tab", { name: /Chat/ }));
    expect(shown()).toBe("chat");
  });

  it("moves with the arrow keys, wrapping at the ends, and Home and End", () => {
    render(<Harness />);
    const note = screen.getByRole("tab", { name: /Note/ });

    fireEvent.keyDown(note, { key: "ArrowLeft" });
    expect(shown()).toBe("assistant");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: /Assistant/ }));

    fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
    expect(shown()).toBe("note");

    fireEvent.keyDown(document.activeElement!, { key: "End" });
    expect(shown()).toBe("assistant");
    fireEvent.keyDown(document.activeElement!, { key: "Home" });
    expect(shown()).toBe("note");
  });

  it("keeps only the selected tab in the tab order", () => {
    render(<Harness start="assistant" />);
    expect(screen.getAllByRole("tab").map((t) => t.tabIndex)).toEqual([-1, -1, 0]);
  });

  it("shows unread messages on Chat while something else is showing", () => {
    render(<Harness unread={3} />);
    expect(screen.getByLabelText("3 unread")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: /Chat/ }));
    expect(screen.queryByLabelText("3 unread")).toBeNull();
  });

  it("caps a large count", () => {
    render(<Harness unread={250} />);
    expect(screen.getByLabelText("250 unread").textContent).toBe("99+");
  });
});
