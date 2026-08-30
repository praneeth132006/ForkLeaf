// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ColumnResizer } from "./ColumnResizer";

afterEach(cleanup);

function mount(overrides: Partial<React.ComponentProps<typeof ColumnResizer>> = {}) {
  const onChange = vi.fn();
  const onReset = vi.fn();

  render(
    <ColumnResizer
      label="Notes and folders"
      width={256}
      min={180}
      max={520}
      side="left"
      onChange={onChange}
      onReset={onReset}
      {...overrides}
    />,
  );

  return { handle: screen.getByRole("separator"), onChange, onReset };
}

/**
 * jsdom has no pointer capture, and a handle that calls it unguarded throws
 * on the way down — which is exactly the sort of thing that only shows up in
 * a browser. The tests stub the two methods rather than skipping the drag.
 */
function drag(handle: HTMLElement, from: number, to: number) {
  const element = handle as HTMLElement & {
    setPointerCapture: (id: number) => void;
    releasePointerCapture: (id: number) => void;
    hasPointerCapture: (id: number) => boolean;
  };
  element.setPointerCapture = vi.fn();
  element.releasePointerCapture = vi.fn();
  element.hasPointerCapture = vi.fn(() => true);

  fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: from });
  fireEvent.pointerMove(handle, { pointerId: 1, clientX: to });
  fireEvent.pointerUp(handle, { pointerId: 1, clientX: to });
}

describe("ColumnResizer — dragging", () => {
  it("widens a left-hand column when the pointer moves right", () => {
    const { handle, onChange } = mount();
    drag(handle, 400, 460);
    expect(onChange).toHaveBeenLastCalledWith(316);
  });

  it("narrows a right-hand column when the pointer moves right", () => {
    const { handle, onChange } = mount({ side: "right" });
    drag(handle, 400, 460);
    expect(onChange).toHaveBeenLastCalledWith(196);
  });

  it("stops at the limits rather than following the pointer off the screen", () => {
    const { handle, onChange } = mount();
    drag(handle, 400, 4000);
    expect(onChange).toHaveBeenLastCalledWith(520);
  });

  it("measures from where the drag started, not from the last move", () => {
    const { handle, onChange } = mount();
    const element = handle as HTMLElement & { setPointerCapture: (id: number) => void };
    element.setPointerCapture = vi.fn();

    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 400 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 420 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 440 });

    // Both moves are 40px from where the pointer went down, not 20 then 20
    // again — the second would double-count and the column would run away
    // from the pointer.
    expect(onChange).toHaveBeenLastCalledWith(296);
  });

  it("ignores a press that is not the primary button", () => {
    const { handle, onChange } = mount();
    fireEvent.pointerDown(handle, { button: 2, pointerId: 1, clientX: 400 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 460 });
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("ColumnResizer — the keyboard", () => {
  it("nudges with the arrow keys and jumps with shift", () => {
    const { handle, onChange } = mount();

    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith(272);

    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith(240);

    fireEvent.keyDown(handle, { key: "ArrowRight", shiftKey: true });
    expect(onChange).toHaveBeenLastCalledWith(320);
  });

  it("takes the column to its limits with Home and End", () => {
    const { handle, onChange } = mount();

    fireEvent.keyDown(handle, { key: "Home" });
    expect(onChange).toHaveBeenLastCalledWith(180);

    fireEvent.keyDown(handle, { key: "End" });
    expect(onChange).toHaveBeenLastCalledWith(520);
  });

  it("resets on Enter and on a double-click", () => {
    const { handle, onReset } = mount();

    fireEvent.keyDown(handle, { key: "Enter" });
    fireEvent.doubleClick(handle);
    expect(onReset).toHaveBeenCalledTimes(2);
  });
});

describe("ColumnResizer — what a screen reader is told", () => {
  it("reports the width it is on and the range it may take", () => {
    const { handle } = mount();

    expect(handle.getAttribute("aria-orientation")).toBe("vertical");
    expect(handle.getAttribute("aria-label")).toBe("Notes and folders width");
    expect(handle.getAttribute("aria-valuenow")).toBe("256");
    expect(handle.getAttribute("aria-valuemin")).toBe("180");
    expect(handle.getAttribute("aria-valuemax")).toBe("520");
  });
});
