// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DiscussSelection } from "./DiscussSelection";

beforeEach(() => {
  // jsdom lays nothing out, so ranges have no rectangles of their own.
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () =>
    ({ top: 100, bottom: 120, left: 50, right: 300, width: 250, height: 20 }) as DOMRect;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((run) => {
    run(0);
    return 0;
  });
});

/** What each test put on the page, taken off again so ids never repeat. */
const added: Element[] = [];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.getSelection()?.removeAllRanges();
  for (const element of added.splice(0)) element.remove();
});

function select(node: Node) {
  const range = document.createRange();
  range.selectNodeContents(node);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  document.dispatchEvent(new Event("selectionchange"));
}

function setup() {
  const root = document.createElement("div");
  root.innerHTML = "<p id='inside'>Rotate the keys\n monthly.</p>";
  const outside = document.createElement("p");
  outside.textContent = "Somewhere else entirely";
  document.body.append(root, outside);
  added.push(root, outside);
  const onDiscuss = vi.fn();
  render(<DiscussSelection root={root} onDiscuss={onDiscuss} />);
  return { root, outside, onDiscuss };
}

describe("DiscussSelection", () => {
  it("appears for a selection in the note, and quotes it", () => {
    const { root, onDiscuss } = setup();
    act(() => select(root.querySelector("#inside")!));

    const button = screen.getByRole("button", { name: "Discuss" });
    fireEvent.mouseDown(button);

    expect(onDiscuss).toHaveBeenCalledWith("Rotate the keys monthly.");
    expect(screen.queryByRole("button", { name: "Discuss" })).toBeNull();
  });

  it("does not appear for a selection outside the note", () => {
    const { outside } = setup();
    act(() => select(outside));
    expect(screen.queryByRole("button", { name: "Discuss" })).toBeNull();
  });

  it("goes away when the selection does", () => {
    const { root } = setup();
    act(() => select(root.querySelector("#inside")!));
    expect(screen.getByRole("button", { name: "Discuss" })).toBeTruthy();

    act(() => {
      window.getSelection()!.removeAllRanges();
      document.dispatchEvent(new Event("selectionchange"));
    });
    expect(screen.queryByRole("button", { name: "Discuss" })).toBeNull();
  });

  it("can be used from the keyboard", () => {
    const { root, onDiscuss } = setup();
    act(() => select(root.querySelector("#inside")!));
    fireEvent.keyDown(screen.getByRole("button", { name: "Discuss" }), { key: "Enter" });
    expect(onDiscuss).toHaveBeenCalledWith("Rotate the keys monthly.");
  });
});
