// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Dialog } from "./Dialog";

afterEach(cleanup);

function Fields({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="Test" onClose={onClose}>
      <input aria-label="First" />
      <input aria-label="Second" />
    </Dialog>
  );
}

describe("Dialog focus", () => {
  it("focuses the first field once, when it opens", () => {
    render(<Fields onClose={vi.fn()} />);
    expect(document.activeElement).toBe(screen.getByLabelText("First"));
  });

  it("leaves focus where it is when the page behind re-renders with a new close handler", () => {
    const { rerender } = render(<Fields onClose={() => undefined} />);
    const second = screen.getByLabelText("Second");
    second.focus();

    rerender(<Fields onClose={() => undefined} />);
    rerender(<Fields onClose={() => undefined} />);

    expect(document.activeElement).toBe(second);
  });

  it("still closes on Escape with the newest handler", () => {
    const first = vi.fn();
    const latest = vi.fn();
    const { rerender } = render(<Fields onClose={first} />);
    rerender(<Fields onClose={latest} />);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(latest).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });
});
